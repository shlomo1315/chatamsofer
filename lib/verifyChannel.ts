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

  // ── הגבלת קצב במסלול המייל: אין. ──
  //
  // ⚠️ אל תחזירו לכאן תקרות IP או תקרה גלובלית. הן הוסרו אחרי שחסמו נרשמים
  // לגיטימיים בהמונים, בכל שלב בשרשרת בתורו:
  //   • IP אחד ≠ אדם אחד. הקהל גולש דרך סינון (NetFree/רימון) ודרך עמדות
  //     משותפות, ולכן אלפי משפחות שונות מגיעות מאותה כתובת בדיוק.
  //   • תקרה גלובלית על הערוץ פוגעת בכולם בבת אחת ברגע השיא — כלומר בדיוק
  //     כשהמערכת אמורה לעבוד. היא בולמת תקלה נדירה במחיר השבתה ודאית.
  //
  // מה שמרסן את המייל בפועל הוא הקירור: שליחה אחת ל-120 שניות לכל כתובת,
  // שנבדק למעלה מול חותמת sentAt בבסיס הנתונים. הוא חזק מכל תקרת חלון —
  // הוא מונע הצפה של כתובת ספציפית, ואינו יכול לחסום אדם שממתין כנדרש.
  //
  // בטלפון המצב שונה ולכן התקרות נשארו: כל שליחה שם היא שיחה יוצאת בתשלום,
  // אין עליה קירור, וללא רסן אפשר להפעיל חיוג אינסופי למספר של אדם אחר.
  // 🔴 תקרה פר-כתובת גם במייל — לא פר-IP.
  //
  // ההסתמכות על הקירור לבדו נשברה: כשמונה הניסיונות מגיע ל-5, confirm
  // *מוחק את הרשומה כולה* — ואיתה את חותמת sentAt שהקירור נבדק מולה.
  // התוצאה: 5 ניחושים → מחיקה → שליחה חוזרת מיידית בלי שום המתנה →
  // 5 נוספים, בקצב שמוגבל רק במהירות השרת. קוד בן 6 ספרות אינו עומד
  // בפני ניחוש בלתי מוגבל.
  //
  // ⚠️ התקרה היא פר-כתובת יעד ולכן אינה מחזירה את הבעיה שההערה למעלה
  // מתארת: היא אינה חוסמת אף אחד לפי IP, ומשפחות שחולקות כתובת רשת
  // אינן מושפעות זו מזו.
  if (!rateLimit(`verify-send:${channel}:${value}`, 8, 15 * 60 * 1000)) {
    return { status: 429, body: { error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' } }
  }

  if (channel === 'phone') {
    const ip = clientIp(request)
    if (!rateLimit(`verify-send:phone:${value}`, 4, 15 * 60 * 1000) ||
        !rateLimit(`verify-send-ip:${ip}`, 3000, 15 * 60 * 1000)) {
      return { status: 429, body: { error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' } }
    }
    if (!rateLimit('verify-send-global:phone', 8000, 15 * 60 * 1000)) {
      console.error('[verify/send] global phone cap hit — possible flooding attack')
      return { status: 429, body: { error: 'השירות עמוס כעת. אנא נסו שוב מאוחר יותר.' } }
    }
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

  // ── הגבלת קצב על אימות הקוד: אין. ──
  //
  // ⚠️ אל תחזירו לכאן תקרת IP. עמדה כאן תקרה של 30 אימותים ל-IP ברבע שעה,
  // והיא חסמה את השלב שאין ממנו דרך חזרה: הנרשם כבר קיבל את הקוד, הקליד
  // אותו — וקיבל "יותר מדי ניסיונות". הרישום ההמוני מגיע מעמדות ומרשתות
  // מסוננות שכל הפונים דרכן חולקים IP אחד, ולכן המאמת ה-31 נחסם לרבע שעה
  // בלי שעשה דבר. אותה מסקנה כבר הוסקה בכל שאר שלבי השרשרת.
  //
  // ההגנה מפני ניחוש קוד אינה תלויה ב-IP ונשארת במלואה: חמישה ניסיונות
  // שגויים לכל קוד מוחקים אותו (rec.attempts למטה), הקוד בן שש ספרות
  // ותוקפו מוגבל. שם ניחוש עיוור נחסם — לא בתקרה שפוגעת בכל השאר.

  const value = normalizeVerifyValue(channel, raw)
  const admin = getServiceClient()
  if (!admin) return { status: 500, body: { error: 'שגיאת שרת' } }

  // 🔴 תקרת ניחושים מצטברת — חוצה מחזורי קוד.
  //
  // מונה rec.attempts שלמטה מתאפס בכל שליחת קוד חדש, ולכן הוא מגביל את
  // הניחושים *לקוד בודד* בלבד ולא את סך הניחושים לכתובת. בלי התקרה
  // הזו אפשר היה להריץ 5 ניחושים, לבקש קוד חדש, ולחזור ללא הגבלה.
  //
  // ⚠️ פר-כתובת ולא פר-IP, מאותו טעם שמתואר למעלה: משפחות רבות חולקות
  // כתובת רשת, וחסימה לפיה הייתה פוגעת בנרשמים לגיטימיים.
  if (!rateLimit(`verify-confirm:${channel}:${value}`, 20, 15 * 60 * 1000)) {
    return { status: 429, body: { error: 'יותר מדי ניסיונות. נסו שוב מאוחר יותר.' } }
  }

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
