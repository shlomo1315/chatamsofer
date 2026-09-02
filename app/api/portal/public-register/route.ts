import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit } from '@/lib/rateLimit'
import { registrationReceivedEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { validateIsraeliId, normalizeDateToISO } from '@/lib/validation'
import { getRegistrationGate, registrationAllowed } from '@/lib/registrationGate'
import { childRegisteredSeparatelyMessage, isChildMarried } from '@/lib/childDuplicateMessage'
import { placeAnnouncementCall } from '@/lib/yemotCall'
import { getRegistrationCallText, getRegistrationCallAudio } from '@/lib/registrationCallMessage'
import { verifyVerifyToken } from '@/lib/verifyToken'
import { buildDraftLinks } from '@/lib/emailRequestIntake'
import { normalizeLineageNodeName, lineageIdentityKey } from '@/lib/lineageNameFormat'
import { invalidateLineageCache } from '@/lib/lineageSync'
import { normalizePhone } from '@/lib/phone'
import { attachOrphanMailToBeneficiary } from '@/lib/legacyMailSync'
import { getStreets, isKnownCity } from '@/lib/govData'
import { registerToOpenDistribution } from '@/lib/holidayDistributions'
import type { RegisterSource } from '@/lib/distributionSources'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// החגים שתחת "מענק לקראת החגים" בשאלת ההטבות בעבר.
//
// ⚠️ רשימה אחת שמשרתת את הטופס שלנו, את טופס נדרים ואת האכיפה בשרת. הוספת חג
// בעתיד נעשית כאן, ואז שלושתם יודעים עליו — לעומת שלוש רשימות שהיו מתפצלות
// בחג הראשון שמתווסף.
// ─────────────────────────────────────────────────────────────────────────────
export const HOLIDAY_GRANT_KEYS = ['tishrei_5786', 'pesach_5786', 'shavuot_5786'] as const

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * ההרשמה לאיגוד — מקור האמת לכל הערוצים.
 *
 * ⚠️ channel מועבר במפורש מהראוט שנקרא (למשל nedarim-form/register → 'nedarim')
 * ולא נגזר מכותרת origin: כותרת נשלטת בידי הלקוח, ואילו הראוט שנקרא הוא עובדה.
 * ברירת המחדל היא 'portal' — הרישום מהאתר שלנו.
 */
export async function handlePublicRegister(request: NextRequest, channel?: RegisterSource) {
  // טופס נדרים פלוס רץ בדפדפן המשתמש מ-matara.pro (ראה lib/cors.ts), ולכן
  // כל נרשם מגיע מה-IP שלו — אותה תקרה מתאימה לשניהם.
  const isNedarim = request.headers.get('origin') === 'https://matara.pro'
  const registrationSource: RegisterSource = channel ?? (isNedarim ? 'nedarim' : 'portal')

  // ── הגבלת קצב: אין. בשום ערוץ. ──
  //
  // ⚠️ אל תחזירו לכאן תקרת IP. עד כה עמדה כאן תקרה של 10 רישומים לשעה לכל IP,
  // ונרשמים לגיטימיים נחסמו ב"יותר מדי ניסיונות רישום":
  //   • IP אחד ≠ אדם אחד. הקהל גולש דרך סינון (NetFree/רימון) ודרך רשתות
  //     משותפות, ולכן אלפי משפחות שונות מגיעות אלינו מאותה כתובת בדיוק.
  //     המשפחה ה-11 באותו סינון נחסמה לשעה שלמה — בלי שעשתה דבר, ואחרי שכבר
  //     מילאה טופס ארוך ואימתה מייל וטלפון.
  //   • גם ניסיון שנכשל בוולידציה (רחוב שאינו ברשימת העיר, ת"ז כפולה, שדה
  //     חסר) צרך מהמכסה — כך שמשפחה אחת שתיקנה טעויות מיצתה אותה לבדה.
  //   • ההרשמה היא אירוע חד-פעמי בחיי משפחה, ומגיעה בגלים (שחרור המוני של
  //     אלפי נרשמים בדקות). חסימה כאן פירושה משפחה שוויתרה — נזק גדול לאין
  //     ערוך מרישום ספאם בודד, שממילא נמחק בשתי לחיצות מהניהול.
  //
  // ההגנה על המסלול אינה ה-IP אלא מה שאי אפשר לזייף בקנה מידה: אימות המייל
  // בקוד + אימות טלפון בשיחה (אסימונים חתומים שנבדקים למטה), ת"ז ייחודית
  // במסד עם ספרת ביקורת, רחוב מרשימת העיר הרשמית ושער ההרשמה. אותה מסקנה
  // כבר הוסקה בערוץ נדרים ובערוץ האימות (lib/verifyChannel.ts).
  //
  // 🔴 מה שכן קיים: גג-על *גלובלי*, לא per-IP.
  //
  // ⚠️ הוא אינו סותר את האמור למעלה — הוא מכוון גבוה בהרבה מכל גל רישום
  // אמיתי, ולכן נרשם לגיטימי לא ייתקל בו לעולם. תפקידו היחיד הוא לעצור
  // הצפה אוטומטית: כל רישום כותב למסד, שולח מייל, ולעיתים מפעיל שיחה
  // יוצאת *בתשלום*. בלי שום תקרה זו נקודת הקצה היקרה ביותר במערכת,
  // פתוחה לאינטרנט. גל של אלפי נרשמים בדקות עדיין עובר בנוחות.
  if (!rateLimit('public-register:global', 4000, 60 * 60 * 1000)) {
    console.error('[public-register] גג-העל הגלובלי נחצה — ייתכן ניסיון הצפה')
    return NextResponse.json(
      { error: 'המערכת עמוסה כרגע. אנא נסו שוב בעוד מספר דקות.' },
      { status: 429 },
    )
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const {
    id_number, id_doc_type, full_name, family_name, phone, phone2, email,
    address, city, birth_date, gender, marital_status,
    spouse_name, spouse_id_number, spouse_id_doc_type, spouse_phone, spouse_birth_date, children, children_count, notes, community_affiliation, lineage_node_id, lineage_manual, lineage_chain, lineage_new_nodes, past_benefits, signature,
    email_verify_token, phone_verify_token, phone_tokens, email_tokens,
  } = body
  // ─────────────────────────────────────────────────────────────────────────
  // רישום לחלוקת החגים *באמצע ההרשמה*: הטופס מסמן תיבה בתוך הרישום עצמו,
  // ולא שולח בקשה נפרדת אחר כך.
  //
  // ⚠️ השם `holiday` הוסר מהרשימה במכוון. הוא היה גנרי מדי: כל שדה בטופס חיצוני
  // ששמו במקרה `holiday` (למשל בחירת חג, סוג פנייה) וערכו 1/true צירף את הנרשם
  // לחלוקה בלי שביקש — וזה בדיוק מה שנרשמים דרך נדרים פלוס התלוננו עליו. הם גם
  // לא קיבלו מייל אישור על הצירוף, ולכן גילו זאת רק בדיעבד.
  // נשארו רק שני שמות מפורשים וחד-משמעיים, ששניהם אומרים "רשום אותי לחג".
  // ─────────────────────────────────────────────────────────────────────────
  const isTruthyFlag = (v: unknown) => v === true || v === 'true' || v === 1 || v === '1'
  const wantsHoliday = isTruthyFlag(body.holiday_register) || isTruthyFlag(body.register_holiday)

  if (!id_number || !full_name || !family_name) {
    return NextResponse.json({ error: 'שדות חובה חסרים' }, { status: 400 })
  }

  // חייב להיות לפחות מספר טלפון אחד (בעל / אשה / נוסף)
  const phoneList = [phone, spouse_phone, phone2].map(p => (p ? String(p).trim() : '')).filter(Boolean)
  if (phoneList.length === 0) {
    return NextResponse.json({ error: 'יש להזין לפחות מספר טלפון אחד' }, { status: 400 })
  }

  // כתובת מלאה חובה — עיר, רחוב ומספר בית (הכתובת מגיעה כמחרוזת "רחוב מספר")
  if (!city || !String(city).trim()) {
    return NextResponse.json({ error: 'יש להזין עיר מגורים' }, { status: 400 })
  }

  // 🔴 העיר חייבת להיות מהמאגר הרשמי של משרד הפנים — בדיוק כמו הרחוב.
  //
  // ⚠️ עד כה נבדק כאן רק ש*השדה אינו ריק*, ולכן נשמרו במאגר ערים כמו
  // "יר", "ירו", "ירוש", "בית ש", "בית שמ" ו-"Jerusalem" — הקלדות
  // חלקיות שנקטעו באמצע ומילוי אוטומטי של הדפדפן. האירוניה: הרחוב כן
  // נאכף מול המאגר 20 שורות מכאן, והעיר — שהיא המפתח לרשימת הרחובות —
  // לא נבדקה כלל.
  //
  // ⚠️ חל גם על טופס נדרים (matara.pro) שפונה ישירות ל-API ואינו עובר
  // את בורר הערים בממשק — שם לא היה שום מסנן.
  {
    const adminDb = getAdminClient()
    if (adminDb && !(await isKnownCity(adminDb, String(city).trim()))) {
      return NextResponse.json({
        error: 'יש לבחור עיר מתוך הרשימה. לא ניתן להזין עיר שאינה קיימת.',
        field: 'city',
      }, { status: 400 })
    }
  }

  // ⚠️ השתייכות קהילתית — שדה חובה. נאכף בשרת כדי לכסות גם את טופס הנדרים
  // (matara.pro) שמגיע ישירות ל-API ולא עובר את בדיקת הטופס הציבורי.
  if (!community_affiliation || !String(community_affiliation).trim()) {
    return NextResponse.json({ error: 'יש להזין השתייכות קהילתית' }, { status: 400 })
  }

  // ⚠️ "מענק לקראת החגים" — מי שסימן אותו חייב לציין באילו חגים. עד כה זה נאכף
  // בטופס שלנו בלבד, ולכן טופס נדרים (matara.pro) שפונה ישירות ל-API היה יכול
  // לשמור holiday_grant=true בלי אף חג. הנתון הזה הוא הבסיס לתכנון החלוקה,
  // ו"קיבל מענק אך לא ידוע באיזה חג" הוא בדיוק מה שאין ממנו מה ללמוד.
  {
    const pb = (past_benefits && typeof past_benefits === 'object' ? past_benefits : {}) as Record<string, unknown>
    if (pb.holiday_grant === true || pb.holiday_grant === 'true') {
      if (!HOLIDAY_GRANT_KEYS.some(k => pb[k] === true || pb[k] === 'true')) {
        return NextResponse.json({
          error: 'סומן "מענק לקראת החגים" — יש לציין באילו חגים התקבל המענק',
          field: 'past_benefits',
          expected: HOLIDAY_GRANT_KEYS,
        }, { status: 400 })
      }
    }
  }
  {
    const addr = String(address ?? '').trim()
    const m = addr.match(/^(.*?)\s*(\d[\d/א-ת\s]*)$/)
    const streetPart = (m ? m[1] : addr).trim()
    const housePart = (m ? m[2] : '').trim()
    if (!streetPart || !housePart) {
      return NextResponse.json({ error: 'יש להזין כתובת מלאה — רחוב ומספר בית' }, { status: 400 })
    }
    // אכיפה: הרחוב חייב להיות מתוך רשימת הרחובות הרשמית של אותה עיר (gov_streets).
    // מונע הזנת מלל חופשי — גם בטופס הציבורי וגם בנדרים (שמנתב לכאן).
    const adminDb = getAdminClient()
    if (adminDb) {
      try {
        const streets = await getStreets(adminDb, String(city).trim())
        // אם למערכת יש רשימת רחובות לעיר — הרחוב שהוזן חייב להופיע בה (השוואה מנורמלת).
        if (streets.length > 0) {
          const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
          const target = norm(streetPart)
          if (!streets.some(s => norm(s) === target)) {
            return NextResponse.json(
              { error: 'יש לבחור רחוב מתוך הרשימה של העיר. לא ניתן להזין רחוב שאינו קיים.' },
              { status: 400 },
            )
          }
        }
      } catch { /* כשל בשליפת רחובות — לא חוסמים את הרישום (fail-open) */ }
    }
  }

  // אימות חובה: כתובת המייל חייבת להיות מאומתת בקוד.
  //
  // ⚠️ יוצא מן הכלל — טופס נדרים פלוס מאמת טלפון בלבד (וכך גם ה-endpoints
  // שנבנו עבורו: nedarim-form/verify תומך ב-'phone' בלבד). בלי הפטור הזה
  // כל רישום משם היה נכשל ב-400. אימות הטלפון עצמו נאכף בהמשך לכל המסלולים,
  // כולל נדרים — הוא ההגנה האמיתית.
  // אסימון אימות המייל — מתקבל בשני מבנים, כדי שהטופס של נדרים לא יידרש לשנות
  // את מה שכבר עובד אצלו בטלפון:
  //   email_verify_token: "<טוקן>"                     ← יחיד (יש שדה מייל אחד)
  //   email_tokens: [{ value: "a@b.com", token: "…" }]  ← מבנה זהה ל-phone_tokens
  const emailTokenFor = (addr: string): string | undefined => {
    if (typeof email_verify_token === 'string' && email_verify_token) return email_verify_token
    const list = Array.isArray(email_tokens) ? (email_tokens as { value?: unknown; token?: unknown }[]) : []
    const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()
    const hit = list.find(t => norm(t?.value) === norm(addr) && t?.token)
    return hit ? String(hit.token) : undefined
  }
  const emailToken = email ? emailTokenFor(String(email)) : undefined

  // ⚠️ אסימון שנשלח — חייב להיות תקף. בכל ערוץ, ובלי קשר למתג בהגדרות:
  // אסימון פגום שמתקבל בשקט הוא הגרוע מכל העולמות — הטופס מציג "אומת" והמערכת
  // שומרת מייל שלא אומת מעולם.
  //
  // *הדרישה* לאמת נבדקת בהמשך, אחרי טעינת ההגדרות (getRegistrationGate) —
  // היא תלויה במתג email_verification_required, ולכן זקוקה לחיבור לבסיס הנתונים
  // שנוצר רק בהמשך הפונקציה.
  const emailTokenValid = !!(email && emailToken && verifyVerifyToken(emailToken, 'email', String(email)))
  if (email && emailToken && !emailTokenValid) {
    return NextResponse.json({ error: 'אימות כתובת המייל אינו תקף. יש לשלוח קוד חדש ולאמת שוב.' }, { status: 400 })
  }
  // טלפונים — חובה לפחות מספר אחד מאומת. אוספים את כל המספרים המאומתים (verified_phones).
  const verifiedPhones: string[] = []
  const rawTokens = Array.isArray(phone_tokens) ? (phone_tokens as { value?: unknown; token?: unknown }[]) : []
  for (const t of rawTokens) {
    const val = t?.value ? String(t.value).trim() : ''
    const tok = t?.token ? String(t.token) : ''
    if (val && tok && verifyVerifyToken(tok, 'phone', val)) {
      const norm = normalizePhone(val)
      if (norm && !verifiedPhones.includes(norm)) verifiedPhones.push(norm)
    }
  }
  // תאימות לאחור — לקוח ישן ששלח phone_verify_token יחיד לטלפון הבעל
  if (verifiedPhones.length === 0 && phone && verifyVerifyToken(phone_verify_token as string | undefined, 'phone', String(phone))) {
    const norm = normalizePhone(String(phone))
    if (norm) verifiedPhones.push(norm)
  }
  if (verifiedPhones.length === 0) {
    return NextResponse.json({ error: 'יש לאמת לפחות מספר טלפון אחד בקוד שיוקרא בשיחה לפני סיום הרישום.' }, { status: 400 })
  }

  // 🔴 ת"ז מנורמלת ל-9 ספרות, כולל אפסים מובילים.
  //
  // ⚠️ replace(/\D/g,'') לבדו מנקה תווים אך אינו משלים אפס מוביל, ולכן
  // "23603491" ו-"023603491" נשמרו כשתי מחרוזות שונות. בדיקת הכפילות
  // היא eq מדויק — היא לא מצאה את הקיימת, ואותו אדם נרשם פעמיים
  // (גרינפלד מרדכי, 12.08 ו-28.08, אותו טלפון ואותה משפחה).
  //
  // ⚠️ הנרמול חייב לקרות *לפני* בדיקת הכפילות וגם לפני השמירה: נרמול
  // רק באחת מהן משאיר את הפער פתוח מהצד השני.
  // ⚠️ דרכון אינו מנורמל — הוא אינו בן 9 ספרות ואותיותיו משמעותיות.
  const isPassport = String(id_doc_type ?? 'id') === 'passport'
  const cleanId = isPassport
    ? String(id_number).trim()
    : String(id_number).replace(/\D/g, '').padStart(9, '0')

  if (isPassport) {
    if (cleanId.length < 5 || cleanId.length > 20) {
      return NextResponse.json({ error: 'מספר דרכון לא תקין' }, { status: 400 })
    }
  } else {
    // תעודת זהות ישראלית — כולל אימות ספרת ביקורת (מונע ת"ז שגויה/מומצאת)
    if (!validateIsraeliId(cleanId)) {
      return NextResponse.json({ error: 'מספר תעודת זהות לא תקין' }, { status: 400 })
    }
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // שער ההרשמה — חסום אם ההרשמה סגורה, אלא אם הוצג קוד עוקף תקין (לטסטים).
  //
  // ⚠️ טופס נדרים פלוס (matara.pro) פטור מהשער: הוא ערוץ רישום נפרד, ופתיחה
  // או סגירה של הטופס הראשי באתר אינה אמורה להשפיע עליו. בלי הפטור הזה,
  // סגירת הרישום הייתה משביתה להם את הטופס בלי שאיש ישים לב.
  // ⚠️ שער ההרשמה חל על האתר שלנו בלבד. סגירת ההרשמה בהגדרות היא מתג תפעולי
  // של הפורטל — טופס נדרים הוא ערוץ נפרד, שרץ בעמדות ואינו אמור להיעצר כשאנחנו
  // סוגרים את האתר לקהל.
  //
  // הבדיקה היא על registrationSource ולא על isNedarim: isNedarim נגזר מכותרת
  // origin בלבד, וכשהיא חסרה (בקשה שאינה מדפדפן, או הקשר בלי CORS) טופס נדרים
  // תקין נחסם ב-403 "ההרשמה סגורה". registrationSource מביא בחשבון גם את
  // הערוץ שהראוט העביר במפורש — עובדה בשרת, שאינה תלויה בכותרת.
  if (registrationSource !== 'nedarim') {
    const gate = await getRegistrationGate(admin)
    if (!registrationAllowed(gate, body.bypass as string | undefined)) {
      return NextResponse.json({ error: 'ההרשמה למערכת סגורה כעת. לפרטים ניתן לפנות למזכירות.' }, { status: 403 })
    }
    // אימות המייל — נדרש רק כשהמתג בהגדרות דלוק (ברירת המחדל: דלוק).
    // כשהוא כבוי הרישום מסתיים בלי אימות, והנרשם יתבקש לאמת בכניסה הבאה
    // לאזור האישי. אימות הטלפון בשיחה נשאר חובה בכל מצב — הוא נאכף למעלה.
    if (gate.emailVerificationRequired && !emailTokenValid) {
      return NextResponse.json({ error: 'יש לאמת את כתובת המייל בקוד שנשלח אליה לפני סיום הרישום.' }, { status: 400 })
    }
  }

  // ⚠️ נבדקות שתי הצורות: הרשומות שנוצרו לפני הנרמול שמורות בלי האפס
  // המוביל, ובדיקה על הצורה המנורמלת בלבד לא הייתה מוצאת אותן — כלומר
  // הכפילות הייתה ממשיכה להיווצר מול כל מי שכבר רשום.
  const idVariants = Array.from(new Set(
    isPassport ? [cleanId] : [cleanId, cleanId.replace(/^0+/, '')].filter(Boolean),
  ))
  const { data: existing } = await admin.from('beneficiaries')
    .select('id').in('id_number', idVariants).limit(1).maybeSingle()
  if (existing) return NextResponse.json({ error: 'תעודת זהות זו כבר רשומה במערכת' }, { status: 409 })

  const isSpousePassport = String(spouse_id_doc_type ?? 'id') === 'passport'
  const cleanSpouseId = spouse_id_number
    // ⚠️ אותו נרמול כמו לבעל — אחרת ת"ז האישה נשמרת בשתי צורות ובדיקות
    // הכפילות מולה (כולל "זהה לזו של הבעל") מפספסות.
    ? (isSpousePassport ? String(spouse_id_number).trim() : String(spouse_id_number).replace(/\D/g, '').padStart(9, '0'))
    : ''

  // ⚠️ אבטחת נתונים: הבעל והאשה חייבים להיות שני אנשים שונים.
  // הבדיקה הזו התקיימה רק בטופס הפורטל (client-side), אבל טופס נדרים פלוס
  // (matara.pro) מגיע ישירות ל-API ועקף אותה — וכך נקלטה משפחה שבה הבעל
  // והאשה זהים (אותה ת"ז, אותו שם). אוכפים בשרת, כך שכל המסלולים מכוסים.
  if (cleanSpouseId) {
    if (cleanSpouseId === cleanId) {
      return NextResponse.json({ error: 'תעודת הזהות של האישה זהה לזו של הבעל. יש להזין תעודות זהות שונות.' }, { status: 409 })
    }
    // ת"ז האשה — אימות תקינות (כמו של הבעל). דרכון אינו נבדק בספרת ביקורת.
    if (!isSpousePassport && !validateIsraeliId(cleanSpouseId)) {
      return NextResponse.json({ error: 'תעודת הזהות של האישה אינה תקינה' }, { status: 400 })
    }
  }
  // שם זהה + ת"ז זהה = אותו אדם. גם אם ת"ז ריקה, שם בעל=אשה חשוד מאוד.
  {
    const hName = String(full_name ?? '').trim().replace(/\s+/g, ' ')
    const sName = String(spouse_name ?? '').trim().replace(/\s+/g, ' ')
    if (hName && sName && hName === sName && (!cleanSpouseId || !cleanId || cleanSpouseId === cleanId)) {
      return NextResponse.json({ error: 'שם הבעל ושם האישה זהים. יש להזין את פרטי שני בני הזוג בנפרד.' }, { status: 409 })
    }
  }

  // מניעת כפילות תעודת זהות של הילדים — קריטי למניעת טעויות.
  // ⚠️ ביצועים לרישום המוני: קודם היו *שתי* שאילתות DB רצופות לכל ילד (משפחה עם
  // 8 ילדים = 16 סבבי רשת), והשנייה סורקת JSON כבד. עכשיו: הבדיקות המקומיות
  // (כפילות ברשימה / זהות להורה) רצות ראשונות ללא DB, ובדיקת ה"כבר קיים" נעשית
  // בשאילתה *אחת* לכל השדות (id_number/spouse) ובשאילתה אחת ל-children — לכל
  // הילדים יחד. מוריד את עומס ה-DB דרסטית כשאלפי טפסים מגיעים במקביל.
  if (Array.isArray(children) && children.length) {
    // ⚠️ isChildMarried המשותף ולא בדיקה עברית מקומית: טופס הניהול שומר
    // 'married' באנגלית, ולכן ילד שסומן נשוי מהמשרד לא זוהה ככזה ונחסם —
    // "אי אפשר לרשום ילדים נשואים". ראו lib/childDuplicateMessage.
    const childIsMarried = isChildMarried
    const seen = new Set<string>()
    const childIds: string[] = []
    const childLabels: string[] = []
    const childMarried: boolean[] = []
    // נשמר לצורך לשון הפנייה בהודעת השגיאה (זכר/נקבה)
    const childRows: { gender?: string; marital_status?: string }[] = []
    for (const c of children as { name?: string; id_number?: string; marital_status?: string; gender?: string; id_doc_type?: string }[]) {
      // ⚠️ דרכון נשמר עם האותיות; רק ת"ז מפשיטים ל-ספרות. אחרת מפתח הכפילות
      // ("123456" אחרי הפשטת אותיות) לא תואם לערך המאוחסן ("AA123456").
      const cid = c?.id_doc_type === 'passport'
        ? (c?.id_number ?? '').trim()
        : (c?.id_number ?? '').replace(/\D/g, '')
      if (!cid) continue
      const childName = (c?.name ?? '').trim() || 'הילד/ה'
      if (seen.has(cid)) return NextResponse.json({ error: `תעודת הזהות של ${childName} מופיעה פעמיים ברשימת הילדים.` }, { status: 409 })
      if (cid === cleanId || (cleanSpouseId && cid === cleanSpouseId)) {
        return NextResponse.json({ error: `תעודת הזהות של ${childName} זהה לזו של ההורה. יש להזין תעודת זהות נכונה.` }, { status: 409 })
      }
      seen.add(cid)
      childIds.push(cid)
      childLabels.push(childName)
      childMarried.push(childIsMarried(c?.marital_status))
      childRows.push({ gender: c?.gender, marital_status: c?.marital_status })
    }
    if (childIds.length) {
      // שאילתה אחת: האם מי מת"ז הילדים כבר קיימת כבעל/אשה של רשומה קיימת.
      //
      // 🔴 .in() ולא .or() עם מחרוזת מורכבת.
      //
      // ⚠️ זו הייתה חור אבטחה חמור: ערך *דרכון* עובר trim() בלבד (בכוונה —
      // דרכון מכיל אותיות), ונשתל ישירות במחרוזת ה-.or(). הנתיב הזה פתוח
      // לאינטרנט ללא שום אימות, ולכן תוקף יכול היה לשלוח דרכון ובו פסיקים
      // ונקודות ולהזריק תנאים על עמודות אחרות — למשל
      // `portal_password_hash.like.$2b$10$a*` — ולקבל תשובה בוליאנית
      // (409 מול המשך רישום). כלומר חילוץ תו-אחר-תו של גיבובי סיסמאות
      // הפורטל ושל תעודות זהות מכל המאגר.
      //
      // .in() מעביר את הערכים כפרמטרים ואינו ניתן להזרקה. שתי שאילתות
      // במקום אחת — מחיר זניח מול הפער שנסגר.
      const [{ data: asBenSelf }, { data: asBenSpouse }, ...childHits] = await Promise.all([
        admin.from('beneficiaries').select('id_number, spouse_id_number').in('id_number', childIds).limit(childIds.length),
        admin.from('beneficiaries').select('id_number, spouse_id_number').in('spouse_id_number', childIds).limit(childIds.length),
        // בדיקת "רשום כילד אצל אחר" — שאילתה אחת לכל ת"ז (contains דורש ערך יחיד)
        ...childIds.map(id => admin.from('beneficiaries').select('id').contains('children', [{ id_number: id }]).limit(1)),
      ])
      const takenAsBen = new Set<string>()
      const asBen = [...(asBenSelf ?? []), ...(asBenSpouse ?? [])]
      for (const row of asBen as { id_number?: string; spouse_id_number?: string }[]) {
        if (row.id_number) takenAsBen.add(String(row.id_number).replace(/\D/g, ''))
        if (row.spouse_id_number) takenAsBen.add(String(row.spouse_id_number).replace(/\D/g, ''))
      }
      for (let i = 0; i < childIds.length; i++) {
        const cid = childIds[i]
        const asChild = childHits[i]?.data
        if (takenAsBen.has(cid) || (asChild?.length)) {
          // ⚠️ קיום ברשומה אחרת אינו בהכרח כפילות. צאצא נשוי *אמור* להופיע
          // בשני מקומות: כמשפחה עצמאית משלו, וגם ברשימת הילדים של הוריו —
          // ולעיתים גם אצל חמיו. חסימה גורפת עצרה כאן אב שרשם את ילדיו
          // הנשואים, בלי שום דרך להתקדם ובלי להסביר לו מה הבעיה.
          //
          // ההוספה מותרת בתנאי אחד: הילד מסומן כנשוי. הסימון הוא ההצהרה
          // שמדובר במשפחה עצמאית ולא ברישום כפול של אותו אדם — ילד שאינו
          // נשוי אמור להופיע במשפחה אחת בלבד.
          if (!childMarried[i]) {
            return NextResponse.json({
              error: childRegisteredSeparatelyMessage(childLabels[i], childRows[i]),
              code: 'child_registered_separately',
            }, { status: 409 })
          }
        }
      }
    }
  }

  const isMarried = String(marital_status) === 'נשואים'
  const cleanChildCount = Array.isArray(children) ? children.length : (typeof children_count === 'number' ? children_count : parseInt(String(children_count || '0'), 10))
  // ⚠️ נרמול תאריך הלידה של הילדים ל-ISO (טופס נדרים שולח DDMMYYYY) — לעקביות
  // עם הרשומה הראשית ולמניעת תאריכים פגומים ב-JSON.
  const childrenJson = Array.isArray(children) && children.length > 0
    ? children.map((c: Record<string, unknown>) => c && typeof c === 'object' && 'birth_date' in c
        ? { ...c, birth_date: normalizeDateToISO(c.birth_date as string) }
        : c)
    : null

  // ── קביעת רמת הבדיקה לפי סדר הדורות ─────────────────────────────────────────
  // בדיקה מעמיקה (deep_review) כשהנרשם *סטה מהנתיב המאומת בתוך 5 הדורות
  // הראשונים* — כלומר הוסיף צמתים חדשים שאינם במאגר בדור רדוד (≤5).
  //   • הצומת המאומת שנבחר (lineage_node_id) נמצא בדור N.
  //   • צמתים חדשים (lineage_new_nodes) נוספים מתחתיו — בדורות N+1, N+2…
  //   • אם N ≥ 5 → החדשים בדור 6+ בלבד → בדיקה רגילה (הוסיף *מעבר* ל-5).
  //   • אם N < 5 והוסיף חדשים → חלקם נופלים *בתוך* 5 הדורות → בדיקה מעמיקה.
  // ללא צמתים חדשים כלל → בדיקה רגילה (בחר נתיב קיים במלואו).
  const NORMAL_DEPTH = 5
  let eligibilityStatus = 'pending'
  try {
    const hasNewNodes = Array.isArray(lineage_new_nodes) && lineage_new_nodes.length > 0
    if (hasNewNodes && lineage_node_id) {
      const { data: sel } = await admin.from('lineage_nodes').select('generation').eq('id', String(lineage_node_id)).maybeSingle()
      const gen = sel?.generation != null ? Number(sel.generation) : null
      // הצומת שנבחר רדוד (בתוך 5 הדורות) והנרשם הוסיף עליו צמתים חדשים → סטייה
      if (gen != null && gen < NORMAL_DEPTH) eligibilityStatus = 'deep_review'
    }
  } catch { /* כשל בזיהוי — נשאר pending (בדיקה רגילה), לא חוסם רישום */ }
  const sharedFields = {
    // טלפון ראשי — של הבעל אם הוזן, אחרת המספר הראשון שהוזן (בעל אינו חובה יותר)
    phone: phone ? String(phone).trim() : (phoneList[0] ?? null),
    phone2: phone2 ? String(phone2).trim() : null,
    verified_phones: verifiedPhones.length ? verifiedPhones : null,
    email: email ? String(email).toLowerCase().trim() : null,
    // מועד אימות המייל. NULL = נרשם בלי אימות (המתג בהגדרות כבוי, או נדרים) —
    // ולכן יתבקש לאמת בכניסה הבאה לאזור האישי.
    email_verified_at: emailTokenValid ? new Date().toISOString() : null,
    address: address ? String(address).trim() : null,
    city: city ? String(city).trim() : null,
    marital_status: marital_status ? String(marital_status) : null,
    children_count: cleanChildCount,
    children: childrenJson,
    notes: notes ? String(notes).trim() : null,
    community_affiliation: community_affiliation ? String(community_affiliation).trim() : null,
    lineage_node_id: lineage_node_id ? String(lineage_node_id) : null,
    lineage_manual: Array.isArray(lineage_manual) && lineage_manual.length > 0 ? lineage_manual : null,
    lineage_chain: Array.isArray(lineage_chain) && lineage_chain.length > 0 ? lineage_chain : null,
    past_benefits: past_benefits && typeof past_benefits === 'object' ? past_benefits : null,
    // חתימה דיגיטלית (data URL של PNG) — נלכדה בעת סימון ההצהרה
    signature: typeof signature === 'string' && signature.startsWith('data:image') ? signature : null,
    // 'pending' (בדיקה רגילה) או 'deep_review' (סטייה ביחוס בתוך 5 הדורות)
    eligibility_status: eligibilityStatus,
    is_active: true,
    // באיזה אופן נרשם — נשמר בעת הרישום, כי בדיעבד אין דרך להבדיל בין ערוץ לערוץ
    registration_source: registrationSource,
  }

  // נשואים = משפחה אחת = כרטסת אחת. הבעל והאשה נשמרים על אותה רשומה
  // (full_name + spouse_name), ולא כשתי רשומות נפרדות.
  const records: Record<string, unknown>[] = [{
    id_number: cleanId,
    id_doc_type: isPassport ? 'passport' : 'id',
    full_name: String(full_name).trim(),
    family_name: String(family_name).trim(),
    // ⚠️ נרמול תאריך ל-ISO: טופס נדרים החיצוני שולח DDMMYYYY, שהפיל את ה-INSERT
    // עם 22008 (ראו lib/validation normalizeDateToISO). הפורטל שולח ISO ולא מושפע.
    birth_date: normalizeDateToISO(birth_date as string | null | undefined),
    gender: isMarried ? 'male' : (gender || null),
    spouse_name: spouse_name ? String(spouse_name).trim() : null,
    spouse_id_number: cleanSpouseId || null,
    spouse_phone: spouse_phone ? String(spouse_phone).trim() : null,
    spouse_birth_date: normalizeDateToISO(spouse_birth_date as string | null | undefined),
    ...sharedFields,
  }]

  let { error } = await admin.from('beneficiaries').insert(records)

  // Retry without optional columns that may not exist in DB yet (pending migrations)
  if (error && error.message?.includes('column') && error.message?.includes('does not exist')) {
    console.error('[public-register] column missing, retrying without optional fields:', error.message)
    const stripped = records.map(r => {
      const { spouse_phone, spouse_birth_date, children, lineage_manual, lineage_chain, past_benefits, verified_phones, signature, community_affiliation, registration_source, email_verified_at, ...rest } = r as Record<string, unknown>
      void spouse_phone; void spouse_birth_date; void children; void lineage_manual; void lineage_chain; void past_benefits; void verified_phones; void signature; void community_affiliation; void registration_source; void email_verified_at
      return rest
    })
    const retry = await admin.from('beneficiaries').insert(stripped)
    error = retry.error
  }

  if (error) {
    console.error('[public-register] insert error:', error.code, error.message, error.details)
    if (error.code === '23505') return NextResponse.json({ error: 'פרטים אלו כבר קיימים במערכת' }, { status: 409 })
    return NextResponse.json({ error: 'שגיאה בשמירת הנתונים. אנא נסה שוב.' }, { status: 500 })
  }

  // ── רישום לחלוקת החגים, כחלק מאותה הרשמה ──
  // ⚠️ best-effort ואחרי שהרישום נשמר: כשל כאן לא יבטל הרשמה שהושלמה. אם אין
  // חלוקה פתוחה — הסימון פשוט מתעלם (הטופס אינו יודע מה מצב הרישום אצלנו).
  let holidayRegistered = false
  if (wantsHoliday) {
    try {
      const { data: justCreated } = await admin.from('beneficiaries').select('id').eq('id_number', cleanId).maybeSingle()
      if (justCreated?.id) {
        // גם התיוג לחלוקת החגים לפי הערוץ ולא לפי כותרת origin — אחרת רישום
        // נדרים שהגיע בלי הכותרת נרשם בחלוקה כ"פורטל" ומעוות את הפילוח.
        const r = await registerToOpenDistribution(justCreated.id, registrationSource)
        holidayRegistered = r.ok
        // ⚠️ מתועד גם *איזה* שדה הפעיל את הצירוף ומאיזה ערוץ — בלי זה לא היה
        // אפשר לברר תלונות על "צירפו אותנו בלי שביקשנו" מתוך הלוגים.
        const flag = isTruthyFlag(body.holiday_register) ? 'holiday_register' : 'register_holiday'
        console.log(`[public-register] רישום לחלוקת חגים: ok=${r.ok} created=${r.created} src=${registrationSource} flag=${flag}${r.error ? ` (${r.error})` : ''}`)
      }
    } catch (e) { console.error('[public-register] holiday register failed:', e) }
  }

  // שיוך למפרע: מיילים ישנים של הנרשם שכבר במערכת אך ללא שיוך — לקשר אליו כעת (לא חוסם).
  try {
    const { data: newBen } = await admin.from('beneficiaries').select('id').eq('id_number', cleanId).maybeSingle()
    if (newBen?.id) {
      await attachOrphanMailToBeneficiary(admin, {
        id: newBen.id,
        email: email ? String(email).toLowerCase().trim() : null,
        id_number: cleanId,
        spouse_id_number: cleanSpouseId || null,
      })
    }
  } catch (e) { console.error('[public-register] attach orphan mail failed:', e) }

  // הכנסת הדורות שהנרשם הוסיף ידנית (אבות + הנרשם) לעץ הדורות בסטטוס "ממתין לאימות",
  // משורשרים תחת הצומת המאומת שנבחר. הנרשם מקושר לצומת האחרון (מיקומו בעץ).
  try {
    if (lineage_node_id && Array.isArray(lineage_new_nodes) && lineage_new_nodes.length) {
      const { data: sel } = await admin.from('lineage_nodes').select('id, generation').eq('id', String(lineage_node_id)).maybeSingle()
      if (sel) {
        let parentId: string = sel.id
        let gen: number = sel.generation as number
        let lastId: string = sel.id
        const newPendingNames: string[] = []
        // ⚠️ הניסוח נאכף בשרת ולא רק בטופס. אותו נתיב משרת גם את טופס נדרים
        // פלוס החיצוני, ושם אין שליטה על צד הלקוח — בלי הנרמול כאן היו נכנסים
        // לעץ שמות עם תארים ("רבי משה שליט\"א") לצד אותו אדם בלי תואר, וזו
        // בדיוק הכפילות שהפורמט האחיד נועד למנוע.
        for (const n of lineage_new_nodes as { name?: string; relation?: string; husband?: string; wife?: string; family?: string }[]) {
          const nm = normalizeLineageNodeName(n)
          if (!nm) continue
          gen += 1
          const rel = n?.relation === 'son' || n?.relation === 'son_in_law' ? n.relation : null
          // ─────────────────────────────────────────────────────────────────
          // שימוש חוזר בצומת קיים תחת אותו אב, במקום ליצור עותק נוסף.
          //
          // 🔴 קודם נבדקו כאן רק צמתים `verified`, בהשוואת `ilike` על השם
          // המלא. אבל כל צומת שנרשם מוסיף ידנית נוצר `pending`, ולכן הבדיקה
          // כמעט לעולם לא מצאה דבר: כל נרשם שהוסיף את אותו אדם יצר עותק חדש.
          // בייצור נמצאו כך ארבעה עותקים של "רבי יהודה ומרת גיטל ברנדייס"
          // תחת אותו אב, ומתחת לכל אחד עותק נוסף של אותו בן.
          //
          // 🔴 וההשוואה עצמה הייתה על השם המילולי, כך ש"ומרת גיטל" ו"וגיטל"
          // נחשבו לשני אנשים. עכשיו משווים לפי מפתח זהות (lineageIdentityKey)
          // שמתעלם מתארים, ברכות וגרשיים.
          //
          // ⚠️ הסטטוס אינו מסנן עוד, אבל `verified` מקבל עדיפות: אם קיימים גם
          // מאומת וגם ממתין, נכון להמשיך דרך המאומת.
          // ⚠️ הסינון בקוד ולא ב-SQL — המפתח נגזר בטיפוס ואין לו ייצוג ב-SQL.
          // מספר האחים תחת אב יחיד קטן, ולכן זה זול.
          const key = lineageIdentityKey(nm)
          const { data: siblings } = await admin.from('lineage_nodes')
            .select('id, generation, name, status').eq('parent_id', parentId)
          const matches = (siblings ?? []).filter(
            (s: { name: string }) => lineageIdentityKey(s.name) === key,
          )
          const existing = matches.find((s: { status: string }) => s.status === 'verified') ?? matches[0]
          if (existing?.id) { parentId = existing.id; lastId = existing.id; gen = (existing.generation as number) ?? gen; continue }
          const { data: node } = await admin.from('lineage_nodes')
            .insert({ name: nm, parent_id: parentId, generation: gen, relation: rel, status: 'pending' })
            .select('id').single()
          if (node?.id) { parentId = node.id; lastId = node.id; newPendingNames.push(nm) }
        }
        if (lastId !== sel.id) {
          await admin.from('beneficiaries').update({ lineage_node_id: lastId }).eq('id_number', cleanId)
        }
        // אישור אוטומטי — שם שנעשה בו שימוש ע"י 10 נרשמים או יותר (מופיע ב-lineage_chain
        // של 10 משפחות) מאושר אוטומטית ומופיע לכולם ברשימת הבחירה.
        const AUTO_VERIFY_THRESHOLD = 10
        for (const nm of [...new Set(newPendingNames)]) {
          try {
            const { count } = await admin.from('beneficiaries')
              .select('id', { count: 'exact', head: true })
              .contains('lineage_chain', [{ name: nm }])
            if ((count ?? 0) >= AUTO_VERIFY_THRESHOLD) {
              await admin.from('lineage_nodes').update({ status: 'verified' }).eq('name', nm).eq('status', 'pending')
              invalidateLineageCache()
            }
          } catch { /* ספירה/אישור לא חוסמים את הרישום */ }
        }
      }
    }
  } catch (e) {
    console.error('[public-register] lineage nodes insert failed:', e)
  }

  // ── 🔴 הנרשם עצמו מקבל צומת בעץ, מיד ──
  //
  // הבלוק שמעל מכניס לעץ רק דורות שהנרשם הוסיף *ידנית*. מי שמצא את אביו כבר
  // מאומת ולא הוסיף כלום לא קיבל צומת בכלל, ולכן לא היה לו שום ייצוג בעץ —
  // עומדים על האב ורואים "פתיחת הכרטסת" במקום את הצאצא. זו הסיבה ש"יש
  // צאצאים שרשומים ולא מופיעים בעץ".
  //
  // ⚠️ רץ תמיד, ולא רק כשהוסיפו דורות. אידמפוטנטי (מזהה לפי ת"ז), ולכן מי
  // שכבר קיבל צומת בבלוק שמעל לא יקבל כפילות.
  // ⚠️ אינו תלוי באישור: הצומת נוצר בסטטוס 'pending', כמו כל צומת שממתין
  // לאימות. האישור נשאר החלטה של הצוות.
  try {
    // 🔴 lineage_chain חייב להיכלל. הוא הסימן השני ב-nodeIsSelf — "הנרשם סימן
    // 'זה אני' על צומת קיים שנוסח אחרת" — וזו ההגנה היחידה כשהניסוח בעץ שונה
    // מהשם המחושב (אות אחת בשם האישה מספיקה). בלי השדה הבדיקה נופלת תמיד על
    // מחרוזת ריקה, המערכת מסיקה "אינו בעץ", ונוצר לנרשם עותק שני *כילד של
    // עצמו* — דור אחרון מיותר בכל כרטסת.
    const { data: fresh } = await admin.from('beneficiaries')
      .select('id, id_number, full_name, spouse_name, family_name, gender, lineage_node_id, lineage_chain')
      .eq('id_number', cleanId).maybeSingle()
    if (fresh) {
      const { ensureBeneficiaryNode } = await import('@/lib/beneficiaryNode')
      const res = await ensureBeneficiaryNode(admin, fresh)
      if (res.ok && (res.created || res.adopted)) {
        invalidateLineageCache()
        console.log(`[public-register] צומת לנרשם ${res.created ? 'נוצר' : 'אומץ'} · ${res.nodeId}`)
      } else if (!res.ok) {
        console.warn(`[public-register] לא נוצר צומת לנרשם: ${res.reason}`)
      }
    }
  } catch (e) {
    // ⚠️ best-effort: רישום לא נכשל בגלל העץ. השלמה יזומה קיימת בהגדרות.
    console.error('[public-register] ensureBeneficiaryNode failed:', e)
  }

  // Send confirmation email (non-blocking) — מעוצב עם כל פרטי הרישום + קישור לפורטל
  if (email) {
    // קישורי טיוטה מוכנה (mailto) — כדי שנרשם שחסום לגלישה יוכל להגיש בקשה
    // ישירות מהמייל. כשל בבנייתם לא מפיל את מייל האישור.
    let drafts: { label: string; href: string }[] | undefined
    try {
      drafts = await buildDraftLinks(admin, cleanId, true, marital_status ? String(marital_status) : null)
    } catch (e) {
      console.error('[public-register] בניית קישורי הטיוטות נכשלה:', e)
    }

    // מצב שערי המחלקות — כדי שהכפתורים העליונים במייל של מחלקה סגורה יופיעו אפורים
    const { getDepartmentGates } = await import('@/lib/departmentGates')
    const gates = await getDepartmentGates(admin)
    const reg = registrationReceivedEmail({
      full_name: full_name ? String(full_name) : null,
      family_name: family_name ? String(family_name) : null,
      id_number: id_number ? String(id_number) : null,
      phone: phone ? String(phone) : null,
      email: String(email),
      address: address ? String(address) : null,
      city: city ? String(city) : null,
      marital_status: marital_status ? String(marital_status) : null,
      spouse_name: spouse_name ? String(spouse_name) : null,
      spouse_id_number: spouse_id_number ? String(spouse_id_number) : null,
      children_count: cleanChildCount,
    }, undefined, drafts, gates)
    deliverMail(String(email), reg.subject, reg.html, undefined, mailFor('igud'))
      .catch(e => console.error('[public-register] confirmation email failed:', e))
  }

  // שיחה טלפונית יוצאת (לא-חוסמת): הקראת אישור קליטת הרישום למספר של הנרשם.
  // אם ימות אינו מוגדר — placeAnnouncementCall מחזיר notConfigured ולא מבצע שיחה.
  if (phone) {
    // הטקסט ניתן לעריכה מדף ההגדרות (registration_call_message). הכתובת מוקראת
    // בעברית מדוברת ואז אות-אות באנגלית — לפי הנוסח השמור.
    Promise.all([getRegistrationCallText(), getRegistrationCallAudio()])
      .then(([text, audio]) => placeAnnouncementCall(String(phone), text, { audioFile: audio }))
      .then((r) => {
        if (r && !r.ok && !r.notConfigured) console.error('[public-register] announcement call failed:', r.error)
      })
      .catch((e) => console.error('[public-register] announcement call error:', e))
  }

  // holiday — מוחזר כדי שהטופס יוכל להציג "נרשמתם גם לחלוקת החגים"
  return NextResponse.json({ ok: true, ...(wantsHoliday ? { holidayRegistered } : {}) })
}

export async function POST(request: NextRequest) {
  await ensureEmailTexts()
  return handlePublicRegister(request)
}
