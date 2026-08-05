// לוגיקה משותפת לשליחה ואימות של קוד חד-פעמי (מייל/טלפון).
// מקור-אמת יחיד עבור:
//   - app/api/portal/verify/send + confirm (הפורטל הציבורי)
//   - app/api/nedarim-form/verify/send + confirm (טופס נדרים, טלפון בלבד)
// כל route עוטף את התוצאה בתגובת HTTP משלו (עם/בלי CORS).
import { getServiceClient } from '@/lib/apiAuth'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { generateCode, hashCode, verifyCode } from '@/lib/portalPassword'
import { sendTransactionalMail } from '@/lib/transactionalMail'
import { placeCodeCall, yemotCallConfigured } from '@/lib/yemotCall'
import { createVerifyToken, normalizeVerifyValue, type VerifyChannel } from '@/lib/verifyToken'
import { verifyCodeEmail } from '@/lib/emailTemplates'

// ⚠️ הוארך מ-10 ל-30 דקות [תקלת מסירה 05/08/2026]. כשהמסירה אצל ספק הדואר
// מתעכבת, מייל שיוצא בזמן מגיע רבע שעה אחר כך — ועם תוקף של 10 דקות הוא מגיע
// כשהקוד כבר מת. המשתמש מקליד קוד תקין ומקבל "הקוד פג תוקף", ומבקש קוד חדש
// שיתעכב בדיוק כמוהו. חצי שעה חוצה את זמן ההשהיה הריאלי ומוציאה את המשתמש
// מהלולאה. ההגנות האמיתיות אינן נפגעות: 5 ניסיונות שגויים מוחקים את הקוד,
// והקירור מגביל שליחה חוזרת לפעם ב-120 שניות.
const CODE_TTL_MS = 30 * 60 * 1000
// ⚠️ קירור בין שליחה לשליחה של קוד במייל. אחרי שקוד נשלח בהצלחה אי אפשר לבקש
// קוד חדש לאותה כתובת למשך שתי דקות. שתי סיבות:
//   • מייל אינו מיידי — הוא עובר סינון וממתין בתור. משתמש שלא רואה אותו מיד
//     לוחץ "שליחת קוד מחדש" שוב ושוב; כל לחיצה מייצרת קוד *חדש* ומבטלת את
//     הקודם, ואז גם המייל שכן הגיע כבר לא תקף — והוא נתקע בלולאה.
//   • רצף שליחות לאותה כתובת בתוך שניות הוא בדיוק החתימה שמורידה מוניטין
//     דומיין אצל Gmail ומגדילה את הסיכוי שההודעה הבאה תיחסם.
// נאכף בצד השרת (מקור-אמת) ומשוקף ל-UI דרך cooldown/retryAfter בתשובה.
const EMAIL_RESEND_COOLDOWN_MS = 120 * 1000
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// תוצאה ניטרלית ל-HTTP: ה-route ממיר ל-NextResponse (עם/בלי CORS).
export interface ChannelResult {
  status: number
  body: Record<string, unknown>
}

// נרמול הערוץ מקלט גולמי. מחזיר null אם לא תקין.
export function parseChannel(raw: unknown): VerifyChannel | null {
  return raw === 'phone' ? 'phone' : raw === 'email' ? 'email' : null
}

// שליחת קוד אימות. הלוגיקה זהה למקור (portal/verify/send) — מחולצת לשיתוף.
export async function sendVerifyCode(
  request: Request,
  channel: VerifyChannel,
  rawValue: string,
): Promise<ChannelResult> {
  const raw = String(rawValue ?? '').trim()
  if (!raw) return { status: 400, body: { error: 'חסרים פרטים' } }

  if (channel === 'email' && !EMAIL_RE.test(raw)) {
    return { status: 400, body: { error: 'כתובת מייל לא תקינה' } }
  }
  const value = normalizeVerifyValue(channel, raw)
  if (channel === 'phone' && value.replace(/\D/g, '').length < 9) {
    return { status: 400, body: { error: 'מספר טלפון לא תקין' } }
  }

  // הגבלת קצב:
  //   • per-value — הגנה על מספר/מייל *ספציפי* מהצפה (אותו אדם מבקש שוב ושוב).
  //     נשאר הדוק (4 לטלפון / 5 למייל) — זה בריא ואינו מפריע לרישום לגיטימי.
  //   • per-IP — ⚠️ הועלה דרסטית (20→3000): הרישום המאסיבי נעשה גם *מעמדות /
  //     מחשב מרכזי*, שכל הרישומים מהן יוצאים מ-IP אחד. תקרה נמוכה חסמה את
  //     הנרשם ה-21 מאותה עמדה. ההגנה האמיתית מפני spam היא ה-per-value + אימות
  //     הקוד עצמו, לא ה-IP.
  const admin = getServiceClient()
  if (!admin) return { status: 500, body: { error: 'שגיאת שרת' } }
  const key = `verify:${channel}:${value}`

  // קירור שליחה חוזרת במייל — נבדק *לפני* מוני הקצב בכוונה: ניסיון שנחסם
  // בקירור אינו שליחה, ואסור שישרוף למשתמש את מכסת השליחות של הכתובת שלו.
  // אחרת חמש לחיצות מהירות על "שליחה מחדש" היו נועלות אותו לרבע שעה.
  if (channel === 'email') {
    const { data: prev } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle()
    if (prev?.value) {
      try {
        const rec = JSON.parse(prev.value) as { sentAt?: number }
        const elapsed = Date.now() - (rec.sentAt ?? 0)
        // רשומה ישנה מלפני התכונה (בלי sentAt) אינה חוסמת.
        if (rec.sentAt && elapsed >= 0 && elapsed < EMAIL_RESEND_COOLDOWN_MS) {
          const retryAfter = Math.ceil((EMAIL_RESEND_COOLDOWN_MS - elapsed) / 1000)
          return {
            status: 429,
            body: {
              error: `כבר נשלח קוד לכתובת זו. אפשר לשלוח קוד חדש בעוד ${retryAfter} שניות.`,
              retryAfter,
            },
          }
        }
      } catch { /* רשומה פגומה — לא חוסמים שליחה לגיטימית */ }
    }
  }

  const ip = clientIp(request)
  // ⚠️ במייל הועלה מ-5 ל-8. הקירור כבר מגביל לשליחה אחת ל-120 שניות, כלומר
  // לכל היותר 7 שליחות לגיטימיות ברבע שעה — ותקרה של 5 חסמה משתמש שסבלני
  // והמתין כנדרש בין הניסיונות. בטלפון נשאר 4: שם כל שליחה היא שיחה בתשלום,
  // ואין קירור שמרסן אותה.
  const perValue = channel === 'phone' ? 4 : 8
  if (!rateLimit(`verify-send:${channel}:${value}`, perValue, 15 * 60 * 1000) ||
      !rateLimit(`verify-send-ip:${ip}`, 3000, 15 * 60 * 1000)) {
    return { status: 429, body: { error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' } }
  }

  // תקרה גלובלית מוחלטת על סך השליחות בערוץ — בולמת call/email-bombing.
  // ⚠️ הועלתה דרסטית לשחרור המוני (אלפי נרשמים לגיטימיים ב-15 דק'): התקרה
  // הישנה (60 שיחות/15דק') נחסמה מיד בשיא וחסמה המונים מלקבל אימות. ההגנה
  // האמיתית מפני bombing נשארת ב-per-value (4 לטלפון) + per-IP (20) שלמעלה —
  // הן חוסמות תוקף בודד; התקרה הגלובלית רק גג-על מפני תקלה קיצונית.
  const globalCap = channel === 'phone' ? 8000 : 8000
  if (!rateLimit(`verify-send-global:${channel}`, globalCap, 15 * 60 * 1000)) {
    console.error(`[verify/send] global ${channel} cap hit — possible flooding attack`)
    return { status: 429, body: { error: 'השירות עמוס כעת. אנא נסו שוב מאוחר יותר.' } }
  }

  if (channel === 'phone' && !yemotCallConfigured()) {
    return { status: 503, body: { error: 'אימות טלפוני אינו זמין כעת. אנא נסו שוב מאוחר יותר.' } }
  }

  const code = generateCode()
  const hash = await hashCode(code)
  // ⚠️ באימות טלפון נשמר גם הקוד הגלוי. הוובהוק של ימות מקריא לפי מספר
  // המתקשר: בכניסה הקוד נשלף מ-portal_phone_code_plain בטבלת המוטבים, אך
  // בהרשמה ובטופס נדרים אין עדיין רשומה שם — ובלי זה אין מה להקריא.
  // נמחק מיד עם ההקראה (חד-פעמי); ה-hash נשאר לאימות.
  // sentAt — חותמת השליחה שעליה נשען הקירור של שתי הדקות. נשמרת בבסיס הנתונים
  // ולא בזיכרון התהליך, כדי שתחזיק גם בין אינסטנסים וגם אחרי דיפלוי.
  const record = JSON.stringify({
    hash, expires: Date.now() + CODE_TTL_MS, attempts: 0, sentAt: Date.now(),
    ...(channel === 'phone' ? { plain: code } : {}),
  })
  const { error: upErr } = await admin.from('app_settings').upsert(
    { key, value: record, updated_at: new Date().toISOString() }, { onConflict: 'key' },
  )
  if (upErr) return { status: 500, body: { error: 'שגיאת שרת' } }

  if (channel === 'email') {
    // ⚠️ ניקוי כתובת המייל לפני שליחה: משתמשים מזינים לעיתים רווחים נסתרים,
    // תווי כיווניות (RLM/LRM) או אותיות עבריות בטעות — ו-Resend דוחה כתובת
    // עם תווים שאינם ASCII ("Invalid `to` field"). מסירים הכל ומוודאים תקינות.
    const cleanEmail = raw.trim().replace(/[‎‏‪-‮\s]/g, '')
    if (!/^[\x00-\x7F]+$/.test(cleanEmail) || !/^[^@]+@[^@]+\.[^@]+$/.test(cleanEmail)) {
      console.error('[verify/send] email invalid/non-ASCII:', JSON.stringify(raw))
      return { status: 400, body: { error: 'כתובת המייל אינה תקינה. יש להזין כתובת באותיות לועזיות בלבד.' } }
    }
    const mail = verifyCodeEmail(code)
    // ⚠️ נמעני ג'ימייל יוצאים דרך חשבון ה-Workspace, והשאר דרך Resend.
    // הרקע המלא ב-lib/transactionalMail: Gmail לבדו מאט את הדואר מהדומיין,
    // ובאותה שנייה בדיוק הודעות לדומיינים אחרים נמסרות כרגיל.
    const sent = await sendTransactionalMail(admin, cleanEmail, mail.subject, mail.html)
    if (!sent.ok) {
      console.error('[verify/send] email failed:', sent.error)
      // ⚠️ המייל לא יצא — מוחקים את הרשומה שנכתבה זה עתה. בלי זה חותמת ה-sentAt
      // הייתה נועלת את הכתובת לשתי דקות בגלל שליחה שכלל לא הגיעה: המשתמש מקבל
      // הודעת שגיאה, לוחץ "נסו שוב" כפי שנאמר לו — ונחסם.
      await admin.from('app_settings').delete().eq('key', key)
      return { status: 502, body: { error: 'שליחת המייל נכשלה. נסו שוב או פנו למזכירות.' } }
    }
    // ⚠️ תיעוד ההצלחה: מייל קוד האימות נשלח עם skipLog (אינו נכנס ל"דואר יוצא"),
    // ולכן עד כה לא הייתה שום דרך לענות על "נשלח לו קוד או לא". בלי השורה הזו
    // תלונת "לא קיבלתי מייל" אינה ניתנת לבדיקה — לא ידוע אם השליחה בכלל יצאה.
    // via= מציין באיזה מסלול יצא, כדי שאפשר יהיה להשוות מסירה בין השניים.
    console.log(`[verify/send] מייל קוד אימות נשלח אל ${cleanEmail} · via=${sent.via} · id=${sent.id ?? '—'}`)
  } else {
    const r = await placeCodeCall(raw, code)
    // ⚠️ כשל בשיחה החזיר עד כה ok:true — המשתמש ראה "מתקשרים אליך כעת"
    // בזמן שהחיוג נכשל, ונשאר להמתין לשיחה שלא תגיע. מדווחים במפורש.
    if (!r.ok && !r.notConfigured) {
      console.error('[verify/send] call failed:', r.error)
      return {
        status: 502,
        body: { error: 'החיוג נכשל. נסו שוב, או בחרו אימות במייל.' },
      }
    }
  }

  // cooldown — כמה שניות הכפתור צריך להישאר נעול ב-UI. מגיע מהשרת ולא מקבוע
  // בצד הלקוח, כדי שהספירה שהמשתמש רואה תהיה בדיוק זו שתיאכף בבקשה הבאה.
  return {
    status: 200,
    body: {
      ok: true, sent: true,
      ...(channel === 'email' ? { cooldown: EMAIL_RESEND_COOLDOWN_MS / 1000 } : {}),
    },
  }
}

// אימות קוד. בהצלחה מחזיר טוקן חתום. הלוגיקה זהה למקור (portal/verify/confirm).
export async function confirmVerifyCode(
  request: Request,
  channel: VerifyChannel,
  rawValue: string,
  rawCode: string,
): Promise<ChannelResult> {
  const raw = String(rawValue ?? '').trim()
  const code = String(rawCode ?? '').replace(/\D/g, '')
  if (!raw || !code) return { status: 400, body: { error: 'חסרים פרטים' } }

  // ⚠️ תקרת ה-IP הועלתה דרסטית (30→3000): זו הייתה החסימה האחרונה שנשארה
  // בשרשרת ההרשמה, והיא חסמה בדיוק את השלב שאין ממנו דרך חזרה — הזנת הקוד.
  // הרישום ההמוני מגיע מעמדות ומרשתות מסוננות (NetFree/רימון), שכל הפונים
  // דרכן חולקים IP אחד; עם 30, המאמת ה-31 קיבל "יותר מדי ניסיונות" אחרי
  // שכבר קיבל את הקוד למייל. אותה מסקנה כבר הוסקה ב-verify/send (3000),
  // ב-lookup (2000) ובמסלול הרישום עצמו — כאן היא פשוט לא הוחלה.
  //
  // ההגנה האמיתית מפני ניחוש קוד נשארת במקומה ואינה תלויה ב-IP: חמישה
  // ניסיונות שגויים לכל קוד מוחקים אותו (rec.attempts למטה), הקוד בן שש
  // ספרות ותוקפו מוגבל. ניחוש עיוור נחסם שם, לא כאן.
  if (!rateLimit(`verify-confirm-ip:${clientIp(request)}`, 3000, 15 * 60 * 1000)) {
    return { status: 429, body: { error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' } }
  }

  const value = normalizeVerifyValue(channel, raw)
  const admin = getServiceClient()
  if (!admin) return { status: 500, body: { error: 'שגיאת שרת' } }

  const key = `verify:${channel}:${value}`
  const { data } = await admin.from('app_settings').select('value').eq('key', key).maybeSingle()
  if (!data?.value) return { status: 400, body: { error: 'לא נמצא קוד פעיל. שלחו קוד חדש.' } }

  let rec: { hash?: string; expires?: number; attempts?: number }
  try { rec = JSON.parse(data.value) } catch { return { status: 400, body: { error: 'קוד לא תקין. שלחו קוד חדש.' } } }

  if (!rec.expires || Date.now() > rec.expires) {
    await admin.from('app_settings').delete().eq('key', key)
    return { status: 400, body: { error: 'הקוד פג תוקף. שלחו קוד חדש.' } }
  }
  if ((rec.attempts ?? 0) >= 5) {
    await admin.from('app_settings').delete().eq('key', key)
    return { status: 400, body: { error: 'יותר מדי ניסיונות שגויים. שלחו קוד חדש.' } }
  }

  const ok = await verifyCode(code, rec.hash)
  if (!ok) {
    await admin.from('app_settings').upsert(
      { key, value: JSON.stringify({ ...rec, attempts: (rec.attempts ?? 0) + 1 }), updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )
    return { status: 400, body: { error: 'קוד שגוי. נסו שוב.' } }
  }

  await admin.from('app_settings').delete().eq('key', key)
  return { status: 200, body: { ok: true, token: createVerifyToken(channel, raw) } }
}
