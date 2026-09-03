// קליטת בקשות שמגיעות במייל (לחסומים): זיהוי סוג + מוטב, פרסור, אימות, קבצים
// לפי שם, הכנסה למערכת (סטטוס pending) ושליחת אישור/דחייה. best-effort, לא זורק.
import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from './sendMail'
import { mailFor } from './departments'
import { emailIntakeRejectedEmail, requestBlockedRejectedEmail, requestReceivedEmail, greetMrs } from './emailTemplates'
import { isReplyToOurMail } from './intakeReplyLoop'
import { isOurMailbox } from './ourMailboxes'
import { readFile } from 'fs/promises'
import path from 'path'
import type { MailAttachment } from './sendMail'

/** האם הדחייה נובעת מטופס אישור רב חסר — אותה בדיקה שקובעת את הבלוק בגוף. */
function needsRabbiForm(errors: string[]): boolean {
  return errors.some(e => e.includes('טופס-אישור-רב') || e.includes('טופס אישור רב'))
}

/**
 * הטופס הריק כצרופה.
 *
 * ⚠️ נקרא מהדיסק בכל שליחה ולא נשמר בזיכרון: 193KB אינם שווים מטמון
 * שנשאר תלוי אחרי החלפת הקובץ.
 *
 * ⚠️ כישלון קריאה אינו מפיל את הדחייה — המייל נשלח בלי הצרופה, והקישור
 * בגוף עדיין נותן למבקש דרך להשיג את הטופס.
 */
async function rabbiFormAttachment(): Promise<MailAttachment[] | undefined> {
  try {
    const file = path.join(process.cwd(), 'public', 'forms', 'rabbi-form-blank.jpg')
    const buf = await readFile(file)
    return [{
      filename: 'טופס-אישור-רב.jpg',
      mimeType: 'image/jpeg',
      contentB64: buf.toString('base64'),
    }]
  } catch (e) {
    console.error('[intake] צירוף טופס אישור רב נכשל:', e instanceof Error ? e.message : String(e))
    return undefined
  }
}
import {
  detectReqType, detectReqTypeForMailbox, SUBJECT_PREFIX, attachmentsFor, parseDraft, validateRequest,
  draftMailto, IGUD_MAILBOX, type ReqType,
} from './emailRequestForms'
import { isDepartmentOpen, departmentClosedMessage, type GatedDepartment } from './departmentGates'
import { findOpenLoan, openLoanEmailReason } from './openLoanGuard'
import { mergeTwinAttachments } from './twinAttachments'

// מיפוי סוג בקשה → מחלקה (שער), כדי לדעת אם המחלקה פתוחה כרגע.
// משמש גם את חסימת הקליטה (מחלקה סגורה) וגם את בניית קישורי הטיוטה.
const REQ_TO_DEPT: Partial<Record<ReqType, GatedDepartment>> = {
  birth: 'maternity', silent_birth: 'maternity',
  loan: 'gemach', financial_aid: 'financial_aid', widow: 'widows',
}

type InAttachment = { filename: string; url?: string; mimeType?: string }
type Msg = { fromEmail: string; subject: string; body: string; attachments: InAttachment[] }

const RH_DEFAULT = ['אם וילד', 'טלזסטון', 'ביכורים']

// שם קובץ ללא סיומת + רווחים (להשוואה לשם הנדרש)
function baseName(name: string): string {
  return String(name ?? '').replace(/\.[^.]+$/, '').trim()
}

export async function loadCtx(admin: SupabaseClient, type: ReqType, pending: boolean) {
  const silent = type === 'silent_birth'
  const { data: rhRows } = await admin.from('recovery_homes').select('name, availability').order('name')
  const recovery = new Set<string>(RH_DEFAULT)
  for (const r of (rhRows ?? []) as { name?: string; availability?: string }[]) {
    if (!r.name) continue
    const a = r.availability ?? 'regular'
    if (silent) recovery.add(r.name)               // לידה שקטה: כל הבתים
    else if (a === 'regular' || a === 'both') recovery.add(r.name)
  }
  // אין יותר בחירת מוקד — היולדת מקבלת כרטיס לכל מוקד (מוצגים בשובר בעת האישור)
  return { recoveryHomes: [...recovery], pending }
}

// ממפה סוג בקשה לפרמטר ה-deep-link בדף הבית (?action=), כדי שהכפתור יפתח ישירות
// את טופס ההגשה המתאים ולא את הדף הכללי.
const ACTION_PARAM: Record<ReqType, string> = {
  birth: 'birth', silent_birth: 'birth', loan: 'loan', financial_aid: 'aid', widow: 'aid',
}

// להגשה חוזרת מצרפים *קישור* לטיוטה מוכנה (mailto) במקום להדביק את כל הטקסט.
// בבקשות לידה הפנייה היא ליולדת ("מרת <משפחה> <שם האשה> תחי׳") ולא לבעל.
async function reject(
  to: string, name: string, type: ReqType, errors: string[], idNumber: string,
  ctx: Awaited<ReturnType<typeof loadCtx>>,
  ben?: { family_name?: string | null; spouse_name?: string | null } | null,
) {
  const draftHref = draftMailto(type, idNumber, ctx)
  const isBirth = type === 'birth' || type === 'silent_birth'
  const greeting = (isBirth && ben?.spouse_name)
    ? greetMrs(ben.family_name, ben.spouse_name)
    : null
  const mail = emailIntakeRejectedEmail({
    name, typeLabel: SUBJECT_PREFIX[type], errors, draftHref, action: ACTION_PARAM[type], greeting,
  })

  // ── הטופס הריק מצורף כתמונה, *וגם* מוצע כקישור בגוף ההודעה ──────────
  //
  // 🔴 הקישור חייב להישאר בכל מקרה: הדחייה הזו נשלחת דווקא כשהטופס חסר,
  // ומי שהגיש במייל לא עבר בפורטל ואין לו מאיפה להוריד אותו. הודעת
  // "חסר טופס" בלי דרך להשיגו משאירה את המבקש תקוע.
  //
  // ⚠️ תמונה ולא ה-PDF: המקור הוא 3.4MB, ובניסיונות חוזרים הוא ניפח את
  // התיבה עד כדי חסימה — כלומר המבקש היה מפסיק לקבל את המייל *כולו*,
  // ובכללו רשימת השגיאות. הרינדור ל-JPEG הוריד אותו ל-193KB (פי 20),
  // והטופס נשאר קריא להדפסה. ראו public/forms/rabbi-form-blank.jpg.
  //
  // ⚠️ מצורף רק כשזו סיבת הדחייה: מי שנדחה על סכום שגוי אינו זקוק לו.
  const attachments = needsRabbiForm(errors) ? await rabbiFormAttachment() : undefined
  return deliverMail(to, mail.subject, mail.html, attachments, { ...mailFor('igud'), skipLog: true })
}

/**
 * האם המייל הגיע מתיבה מחוברת שלנו.
 *
 * ⚠️ נטען מ-gmail_accounts ולא מרשימה קשיחה: תיבה שתתווסף בעתיד תיכנס
 * מעצמה, ורשימה בקוד הייתה מחזירה את הבאג בשקט בפעם הבאה.
 *
 * 🔴 נכשל-*פתוח* במכוון: אם השאילתה נכשלה, ממשיכים לטפל בבקשה. חסימה
 * בספק הייתה משתיקה בקשות אמיתיות ממשפחות — נזק גדול יותר ממענה מיותר
 * לתיבה שלנו, שאותו ממילא תופסת ההגנה על @chasamsofer.info.
 */
async function isFromOurMailbox(admin: SupabaseClient, from: string): Promise<boolean> {
  try {
    const { data } = await admin.from('gmail_accounts').select('email')
    const list = (data ?? []).map(r => String((r as { email?: string }).email ?? ''))
    return isOurMailbox(from, list)
  } catch (e) {
    console.error('[emailRequestIntake] בדיקת התיבות נכשלה — ממשיכים:', e instanceof Error ? e.message : e)
    return isOurMailbox(from, [])
  }
}

// מחזיר true אם המייל זוהה כבקשה וטופל (כדי לדלג על מענה אוטומטי אחר).
// ─────────────────────────────────────────────────────────────────────────────
// רישום לחלוקת חגים במייל.
//
// ⚠️ מסלול נפרד ומכוון: לחלוקת חגים אין *שום* שדה למלא — רק "רשמו אותי". העברתו
// דרך מנגנון הטפסים (שדות, ולידציה, קבצים מצורפים) הייתה מוסיפה מכניקה שלמה
// לבקשה שאין בה נתונים. הזיהוי והאבטחה זהים לחלוטין: ת"ז מלאה בנושא + התאמה
// לכתובת המייל הרשומה.
// ─────────────────────────────────────────────────────────────────────────────
export const HOLIDAY_SUBJECT_PREFIX = 'רישום לחלוקת חגים'

export function isHolidaySubject(subject: string): boolean {
  const s = String(subject ?? '')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u00A0\u2007\u202F\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
  return /חלוק[הת]?\s*(ה)?חגים/.test(s) || /רישום\s*לחלוק/.test(s)
}

/**
 * 🔴 אינה בשימוש — ערוץ הרישום במייל בוטל (ראו handleEmailRequest).
 *
 * נשמרת ולא נמחקה: היא מתעדת את הזיהוי, את בדיקת ההתאמה בין כתובת השולח
 * לכתובת הרשומה, ואת ההודעות — כל מה שיידרש אם אי פעם יוחלט להחזיר את
 * הערוץ. מחיקה הייתה מאבדת את ההקשר ומחייבת לבנות אותו מחדש.
 *
 * ⚠️ אין להחזיר אותה בלי להחזיר גם את הטיוטה במענה האוטומטי — ערוץ שנקלט
 * בלי דרך מוצהרת להשתמש בו הוא בדיוק חצי-הדרך שגרם לבלאגן.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleHolidayEmail(admin: SupabaseClient, msg: Msg): Promise<boolean> {
  const from = (msg.fromEmail || '').toLowerCase()
  if (!from || from.endsWith('@chasamsofer.info') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) return true

  const { getOpenDistribution, registerToOpenDistribution } = await import('./holidayDistributions')
  const { holidayRegisteredEmail } = await import('./emailTemplates')
  const send = async (subject: string, html: string) => {
    await deliverMail(from, subject, html, undefined, { ...mailFor('igud'), skipLog: true })
  }

  // ⚠️ מתג-האב ומצב הרישום נבדקים דרך getOpenDistribution — אותה נקודה שכל
  // הערוצים נגזרים ממנה, כדי שלא ייווצר ערוץ שממשיך לרשום אחרי סגירה.
  const dist = await getOpenDistribution()
  if (!dist) {
    await send('רישום לחלוקת חגים', '<p style="font-family:Heebo,Arial,sans-serif">הרישום לחלוקת החגים אינו פתוח כרגע. נשמח לעמוד לרשותכם במועד הרישום.</p>')
    return true
  }

  const idM = String(msg.subject).match(/\d{9}/)
  if (!idM) {
    await send('רישום לחלוקת חגים', '<p style="font-family:Heebo,Arial,sans-serif">לא צוינה תעודת זהות מלאה (9 ספרות) בשורת הנושא. יש להשיב עם הנושא: <strong>רישום לחלוקת חגים &lt;תעודת זהות&gt;</strong></p>')
    return true
  }
  const idNumber = idM[0]

  const { data: ben } = await admin
    .from('beneficiaries')
    .select('id, full_name, family_name, spouse_name, email, eligibility_status')
    .or(`id_number.eq.${idNumber},spouse_id_number.eq.${idNumber}`)
    .maybeSingle()

  // ⚠️ אותה אבטחה כמו בשאר הבקשות: כתובת שולח ניתנת לזיוף ות"ז אינה סוד, ולכן
  // נדרשת התאמה לכתובת הרשומה. הודעת הכשל גנרית ואינה חושפת אם הת"ז קיימת.
  const benEmail = (ben?.email || '').trim().toLowerCase()
  if (!ben || !benEmail || benEmail !== from) {
    await send('רישום לחלוקת חגים', '<p style="font-family:Heebo,Arial,sans-serif">לא ניתן לאמת את הבקשה מכתובת מייל זו. יש לשלוח מהכתובת הרשומה במערכת, או להירשם דרך האזור האישי.</p>')
    return true
  }

  const result = await registerToOpenDistribution(ben.id, 'email')
  if (!result.ok) {
    await send('רישום לחלוקת חגים', `<p style="font-family:Heebo,Arial,sans-serif">${result.error ?? 'הרישום נכשל'}. אנא נסו שוב או פנו למשרד.</p>`)
    return true
  }

  const name = [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ')
  const mail = holidayRegisteredEmail(name, { distribution: [dist.name, dist.year].filter(Boolean).join(' ') })
  // ⚠️ מי שכבר רשום מקבל את אותו מייל עם שורת פתיחה שמבהירה זאת, ולא הודעת
  // כשל: רישום כפול אינו שגיאה מבחינת המשפחה, והיא צריכה לדעת שהיא בפנים.
  const html = result.created
    ? mail.html
    : `<p style="font-family:Heebo,Arial,sans-serif;font-size:15px;color:#0f766e;font-weight:700">אתם כבר רשומים לחלוקה זו — אין צורך בפעולה נוספת.</p>${mail.html}`
  await send(mail.subject, html)
  return true
}

/**
 * צירופי המייל, ואם הוא הגיע ריק — הצירופים של העותק התאום.
 *
 * 🔴 dual-delivery של Google מייצר שני עותקים של אותה הודעה, ובאחד מהם
 * הצירופים חסרים. ראו twinAttachments.ts למדידה ולנימוק המלא.
 *
 * ⚠️ פונה ל-DB **רק** כשהעותק הנוכחי ריק — במסלול הרגיל אין כאן שאילתה
 * נוספת כלל.
 *
 * ⚠️ התאום מזוהה לפי שולח + נושא בחלון של שעה. message_id אינו משמש:
 * לשני העותקים יש מזהים שונים, ובדיוק זו הסיבה שהבאג קיים.
 *
 * ⚠️ נכשל-פתוח: אם השאילתה נכשלת מחזירים את מה שיש. שגיאת רשת אינה
 * סיבה להפיל בקשה תקינה.
 */
async function withTwinAttachments(
  admin: SupabaseClient, msg: Msg, from: string,
): Promise<InAttachment[]> {
  const own = (msg.attachments ?? []).filter(a => a?.url)
  if (own.length) return own

  try {
    const { data } = await admin
      .from('inbound_emails')
      .select('attachments')
      .eq('subject', msg.subject)
      .ilike('from_email', from)
      .gte('received_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .order('received_at', { ascending: false })
      .limit(5)

    for (const row of (data ?? []) as { attachments?: unknown }[]) {
      const raw = typeof row.attachments === 'string'
        ? JSON.parse(row.attachments)
        : row.attachments
      if (!Array.isArray(raw)) continue
      const merged = mergeTwinAttachments([], raw as InAttachment[])
      if (merged.length) {
        console.warn(`[emailRequest] צירופים הושלמו מהעותק התאום — ${from} · "${msg.subject}" (${merged.length} קבצים)`)
        return merged as InAttachment[]
      }
    }
  } catch (e) {
    console.error('[emailRequest] שליפת העותק התאום נכשלה — ממשיכים בלעדיה', e)
  }
  return own
}

export async function handleEmailRequest(admin: SupabaseClient, msg: Msg): Promise<boolean> {
  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 רישום לחלוקת חגים במייל — בוטל.
  //
  // הרישום נעשה בטלפון ובאזור האישי. הערוץ במייל היה תלוי בהתאמה מדויקת
  // בין כתובת השולח לכתובת הרשומה, וכל פער יצר פנייה שנראית כרישום ואינה
  // נקלטת — בלאגן במקום שירות.
  //
  // ⚠️ מוחזר false ולא true: כך המייל **אינו נבלע** אלא ממשיך לתיבה
  // כפנייה רגילה, והמזכירה רואה אותו ויכולה לענות. הבליעה השקטה הייתה
  // משאירה משפחה בהמתנה לתשובה שלא תגיע.
  //
  // ⚠️ הזיהוי (isHolidaySubject) נשאר בקוד: הוא עדיין מונע מהנושא הזה
  // ליפול לזיהוי סוגי הטפסים ולהתפרש כבקשה אחרת.
  // ─────────────────────────────────────────────────────────────────────────
  if (isHolidaySubject(msg.subject)) return false

  const type = detectReqType(msg.subject)
  if (!type) return false

  const from = (msg.fromEmail || '').toLowerCase()
  if (!from || from.endsWith('@chasamsofer.info') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) return true

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 בלימת לולאת דחיות.
  //
  // מי שמשיב על הודעת "הבקשה לא נקלטה" שלנו — התשובה נקלטת כפנייה חדשה,
  // אין בה ת"ז בנושא, ולכן יוצאת דחייה נוספת שעליה הוא משיב שוב. ביומן
  // הנכנס נצפו ארבעה סיבובים על אותה כותרת בתוך רבע שעה.
  //
  // ⚠️ יוצאים בשקט (true = "טופל"): תשובה על דחייה אינה בקשה, וכל מענה
  // עליה הוא בדיוק מה שמזין את הלולאה.
  // ─────────────────────────────────────────────────────────────────────────
  if (isReplyToOurMail(msg.subject)) {
    console.log(`[emailRequestIntake] 🔴 תשובה על הודעת דחייה — לא נשלח מענה (from=${from})`)
    return true
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 מייל שיצא מתיבה שלנו אינו בקשה.
  //
  // התיבות המחוברות (עזר ליולדות, גמ"ח ישן) משמשות את המזכירות למתן
  // שירות. כשמזכירה עונה משם למשפחה, המייל נקלט כפנייה חדשה, אין בו
  // ת"ז בנושא, ונשלחת אליה "הבקשה לא נקלטה" — היא מוצפת והמשפחה אינה
  // מקבלת דבר. מהתיבה הזו לבדה נקלטו 17,000 מיילים.
  //
  // ⚠️ הבדיקה הקיימת כיסתה רק @chasamsofer.info; שלוש מהתיבות שלנו
  // יושבות ב-Gmail ונפלו בפער.
  // ─────────────────────────────────────────────────────────────────────────
  if (await isFromOurMailbox(admin, from)) {
    console.log(`[emailRequestIntake] 🔴 מייל מתיבה שלנו — לא נשלח מענה (from=${from})`)
    return true
  }

  // ⚠️ שער המחלקה — מחלקה סגורה לא קולטת בקשות באף ערוץ, כולל מייל. בלי הבדיקה
  // הזו נקלטו בקשות הלוואה (גמ״ח) למרות שהמחלקה סגורה — הטופס הציבורי חסום אך
  // ערוץ המייל דילג על השער. משיבים הודעת "לא זמין" ידידותית ולא יוצרים בקשה.
  const gateDept = REQ_TO_DEPT[type]
  if (gateDept && !(await isDepartmentOpen(gateDept, admin))) {
    console.log(`[emailRequestIntake] ${type} blocked — ${gateDept} department closed (from=${from})`)
    await deliverMail(
      from, 'לגבי פנייתכם',
      `<div dir="rtl" style="font-family:Heebo,Arial,sans-serif;font-size:15px;color:#334155;line-height:1.7">שלום רב,<br/><br/>${departmentClosedMessage(gateDept)}<br/><br/>בברכה,<br/>מזכירות היכל החתם סופר</div>`,
      undefined, { ...mailFor('igud'), skipLog: true },
    ).catch(() => {})
    return true
  }

  // זיהוי לפי ת"ז מלאה (9 ספרות) בנושא
  const idM = String(msg.subject).match(/\d{9}/)
  const generic = await loadCtx(admin, type, true)
  if (!idM) {
    await reject(from, '', type, ['לא צוינה תעודת זהות מלאה (9 ספרות) בשורת הנושא'], '<ת.ז>', generic)
    return true
  }
  const idNumber = idM[0]

  const { data: ben } = await admin
    .from('beneficiaries')
    .select('id, full_name, family_name, spouse_name, email, eligibility_status, rejection_reason, marital_status')
    .or(`id_number.eq.${idNumber},spouse_id_number.eq.${idNumber}`)
    .maybeSingle()
  const name = ben ? [ben.family_name, ben.full_name].filter(Boolean).join(' ') : ''
  if (!ben) {
    await reject(from, '', type, [`לא נמצאה רשומה לתעודת זהות ${idNumber}. ודאו שנרשמתם, או הירשמו במערכת הדיגיטלית שלנו`], idNumber, generic)
    return true
  }

  // ⚠️ אבטחה: כתובת השולח במייל ניתנת לזיוף, ות"ז אינה סוד. בלי הבדיקה
  // הזו כל אחד היה יכול לשלוח מייל עם ת"ז של מישהו אחר בשורת הנושא,
  // לקבל בחזרה את שם המשפחה, המצב המשפחתי וסיבת הדחייה הפנימית שלו,
  // וגם לפתוח על שמו בקשות ולצרף מסמכים. דורשים התאמה לכתובת הרשומה.
  const benEmail = (ben.email || '').trim().toLowerCase()
  if (!benEmail || benEmail !== from) {
    console.warn(`[emailRequest] שולח שאינו תואם לרשומה — ת"ז ${idNumber}, from=${from}`)
    // הודעה גנרית בלבד: לא חושפים אם הת"ז קיימת ולא שום פרט מהרשומה.
    await reject(from, '', type, [
      'לא ניתן לאמת את הבקשה מכתובת מייל זו. יש לשלוח מהכתובת הרשומה במערכת, או להגיש דרך המערכת הדיגיטלית.',
    ], idNumber, generic)
    return true
  }
  if (ben.eligibility_status === 'rejected') {
    // נדחה שמנסה להגיש — מקבל הודעה שהרישום לא אושר (עם הסיבה), במקום טופס חוזר
    const mail = requestBlockedRejectedEmail({
      family_name: ben.family_name, full_name: ben.full_name,
      marital_status: ben.marital_status, reason: ben.rejection_reason,
    })
    await deliverMail(from, mail.subject, mail.html, undefined, { ...mailFor('igud'), skipLog: true })
    return true
  }

  const pending = ben.eligibility_status !== 'approved'
  const ctx = await loadCtx(admin, type, pending)

  // פרסור + אימות שדות
  const values = parseDraft(type, msg.body, ctx)
  const valid = validateRequest(type, values, ctx)
  const errors: string[] = valid.ok ? [] : valid.errors

  // 🔴 צירופים — כולל השלמה מהעותק התאום (dual-delivery של Google).
  //
  // Google מייצר שני עותקים של אותו מייל, ובאחד מהם הצירופים חסרים.
  // נמדד: מתוך 136 בקשות ב-14 יום, 74 הגיעו כפול ו-17 מהן עם עותק ריק.
  // עד היום העותק המלא נקלט ראשון — מקרי לחלוטין. ראו twinAttachments.ts.
  const attachments = await withTwinAttachments(admin, msg, from)

  // קבצים לפי שם
  const specs = attachmentsFor(type, ctx)
  const matched: Record<string, string> = {}
  for (const spec of specs) {
    const f = attachments.find((a) => baseName(a.filename) === spec.name && a.url)
    if (f?.url) matched[spec.name] = f.url
    else if (spec.required) errors.push(`לא נמצא קובץ בשם "${spec.name}". שנו את שם הקובץ בדיוק לכך וצרפו שוב`)
  }

  if (errors.length || !valid.ok) {
    await reject(from, name, type, errors, idNumber, ctx, ben)
    return true
  }

  const data = valid.data
  // צילומי ת"ז (אם צורפו) → טבלת documents של המשפחה
  const idDocs: { name: string; doc: string }[] = [
    { name: 'תעודת-זהות-בעל', doc: 'id_husband' },
    { name: 'תעודת-זהות-אשה', doc: 'id_wife' },
  ]
  for (const d of idDocs) {
    if (matched[d.name]) {
      await admin.from('documents').insert({ beneficiary_id: ben.id, doc_type: d.doc, file_url: matched[d.name], file_name: `${d.name} (מייל)` }).then(undefined, () => {})
    }
  }

  // ⚠️ מניעת בקשה כפולה על *אותו תינוק* (לפי ת"ז) — גם בהגשה במייל, בדיוק כמו
  // בטופס הציבורי. אם כבר הוגשה בקשה על ת"ז זו — דוחים עם ההודעה המתאימה:
  // אושרה → "כבר אושרה"; בתהליך → "בטיפול, תקבלו עדכון". (לידה שקטה — אין ת"ז.)
  if (type === 'birth' && data.baby_id_number) {
    const idNorm = String(data.baby_id_number).replace(/\D/g, '')
    const idVariants = Array.from(new Set([idNorm, idNorm.padStart(9, '0'), idNorm.replace(/^0+/, '')].filter(Boolean)))
    const { data: existingAid } = await admin
      .from('maternity_aids')
      .select('id, status')
      .in('baby_id_number', idVariants)
      .not('status', 'eq', 'cancelled')
      .limit(1)
    if (existingAid?.length) {
      const approved = existingAid[0].status === 'active' || existingAid[0].status === 'completed'
      await reject(from, name, type, [
        approved
          ? 'הבקשה ללידה זו כבר אושרה.'
          : 'כבר הגשתם בקשה ללידה זו, הבקשה בטיפול ותקבלו על כך עדכון בהקדם.',
      ], idNumber, ctx, ben)
      return true
    }
  }

  // ⚠️ מניעת בקשת הלוואה כפולה — כמו בלידה, גם כאן שתי בקשות פתוחות לאותו
  // אדם הן תקלה ולא מצב לגיטימי. הבודק משותף לפורטל ולמייל כדי ששני הערוצים
  // לא יגדירו "בקשה פתוחה" אחרת זה מזה.
  if (type === 'loan') {
    const openLoan = await findOpenLoan(admin, ben.id)
    if (openLoan) {
      await reject(from, name, type, [openLoanEmailReason(openLoan)], idNumber, ctx, ben)
      return true
    }
  }

  // הכנסת הבקשה למערכת בסטטוס pending
  let insErr: string | null = null
  try {
    if (type === 'birth' || type === 'silent_birth') {
      const r = await admin.from('maternity_aids').insert({
        beneficiary_id: ben.id,
        birth_date: data.birth_date,
        baby_name: (data.baby_name as string) ?? null,
        baby_gender: (data.baby_gender as string) ?? null,
        baby_id_number: (data.baby_id_number as string) ?? null,
        baby_id_type: data.baby_id_number ? 'id' : null,
        recovery_home: data.recovery_home,
        wants_food_card: data.wants_food_card !== false,
        wants_recovery: data.wants_recovery !== false,
        birth_certificate_url: matched['אישור-לידה'] ?? null,
        notes: data.notes ?? null,
        birth_type: type === 'silent_birth' ? 'silent' : 'live',
        status: 'pending',
        source: 'email',   // אופן הגשה — נקלט מהמייל
      })
      insErr = r.error?.message ?? null
    } else if (type === 'loan') {
      const amount = data.amount as number
      const installments = data.installments as number
      // ⚠️ הטופס החתום נשמר בשדה הייעודי (rabbi_form_url) ולא רק ברשימת
      // המסמכים: המזכיר צריך לראות שהוא קיים, ואותו שדה משמש גם בהגשה
      // דרך הפורטל — אחרת אותו נתון היה יושב בשני מקומות שונים לפי הערוץ.
      const rabbiForm = matched['טופס-אישור-רב'] ?? null
      const docs = [
        matched['מסמך-אחר'], matched['הזמנה-לחתונה'], matched['צילום-תעודות-זהות'],
      ].filter(Boolean) as string[]
      const r = await admin.from('loans').insert({
        beneficiary_id: ben.id, amount, installments,
        monthly_payment: Math.round((amount / installments) * 100) / 100,
        purpose: data.purpose, notes: data.notes ?? null,
        document_urls: docs.length ? docs : null,
        rabbi_form_url: rabbiForm,
        rabbi_form_uploaded_at: rabbiForm ? new Date().toISOString() : null,
        status: 'pending',
      })
      insErr = r.error?.message ?? null
    } else if (type === 'financial_aid') {
      const r = await admin.from('financial_aid_requests').insert({
        beneficiary_id: ben.id, reason: data.reason,
        document_url: matched['מסמך-רפואי'] ?? null, document_name: matched['מסמך-רפואי'] ? 'מסמך רפואי (מייל)' : null,
        status: 'pending',
      })
      insErr = r.error?.message ?? null
    } else if (type === 'widow') {
      const r = await admin.from('widow_requests').insert({
        beneficiary_id: ben.id, request_type: data.request_type,
        description: data.description ?? null, amount: (data.amount as number | null) ?? null,
        status: 'pending',
      })
      insErr = r.error?.message ?? null
    }
  } catch (e) { insErr = e instanceof Error ? e.message : String(e) }

  if (insErr) {
    console.error('[emailRequestIntake] insert failed:', insErr)
    await reject(from, name, type, ['אירעה שגיאה בקליטת הבקשה. אנא נסו שוב או הגישו דרך המערכת הדיגיטלית שלנו'], idNumber, ctx, ben)
    return true
  }

  // מייל אישור עם כל הפרטים שהוגשו — כמו בהגשה דרך האתר (requestReceivedEmail).
  const s = (v: unknown) => (v == null || v === '') ? '' : String(v)
  const genderLbl = (g: unknown) => g === 'male' ? 'זכר' : g === 'female' ? 'נקבה' : ''
  let rows: [string, string][] = []
  let mailType: 'birth' | 'loan' | 'financial_aid' | 'widow' = 'birth'
  if (type === 'birth' || type === 'silent_birth') {
    mailType = 'birth'
    rows = [
      ...(type === 'silent_birth' ? [['סוג בקשה', 'לאחר לידה שקטה'] as [string, string]] : []),
      ['שם הנולד/ת', s(data.baby_name)],
      ['מין', genderLbl(data.baby_gender)],
      ['ת.ז הנולד/ת', s(data.baby_id_number)],
      ['תאריך לידה', s(data.birth_date)],
      ['הטבות שנבחרו', [data.wants_food_card !== false && 'כרטיס מזון', data.wants_recovery !== false && 'בית החלמה'].filter(Boolean).join(' · ')],
      ['בית החלמה', s(data.recovery_home)],
      ['הערות', s(data.notes)],
    ].filter(([, v]) => v !== '') as [string, string][]
  } else if (type === 'loan') {
    mailType = 'loan'
    rows = [
      ['סכום מבוקש', s(data.amount)],
      ['מספר תשלומים', s(data.installments)],
      ['מטרת ההלוואה', s(data.purpose)],
      ['הערות', s(data.notes)],
    ].filter(([, v]) => v !== '') as [string, string][]
  } else if (type === 'financial_aid') {
    mailType = 'financial_aid'
    rows = [['סיבת הבקשה', s(data.reason)]].filter(([, v]) => v !== '') as [string, string][]
  } else if (type === 'widow') {
    mailType = 'widow'
    rows = [
      ['סוג הבקשה', s(data.request_type)],
      ['פירוט', s(data.description)],
      ['סכום מבוקש', s(data.amount)],
    ].filter(([, v]) => v !== '') as [string, string][]
  }
  const ok = requestReceivedEmail({
    type: mailType,
    firstTime: ben.eligibility_status !== 'approved',
    beneficiary: ben,
    requestRows: rows,
  })
  await deliverMail(from, ok.subject, ok.html, undefined, { ...mailFor('igud'), skipLog: true })
  console.log(`[emailRequestIntake] ${type} accepted for ben ${ben.id}`)
  return true
}

// משמש את ה-webhook לבדיקה מהירה אם זו בקשה (לפי הנושא)
export function isRequestSubject(subject: string): boolean {
  return detectReqType(subject) !== null
}

/**
 * כמו isRequestSubject, אך מזהה גם לפי התיבה שאליה הגיע המייל.
 *
 * 🔴 חייב לשמש בכל מקום שבו isRequestSubject שימש לקבלת החלטה על מייל
 * נכנס. בקשה שתזוהה כאן אך לא שם (או להפך) תיפול בין הכיסאות: או
 * שתיקלט ותקבל *גם* מענה אוטומטי, או שלא תיקלט כלל.
 */
export function isRequestMailFor(subject: string, mailbox?: string | null): boolean {
  return detectReqTypeForMailbox(subject, mailbox) !== null
}

/**
 * הנושא שהקליטה עובדת איתו.
 *
 * ⚠️ handleEmailRequest נשען על detectReqType(subject) כדי לדעת את הסוג.
 * כשההגשה הגיעה לתיבת אגף עם ת"ז בלבד, הנושא אינו מכיל את הסוג — ולכן
 * הוא מורכב כאן מחדש בפורמט שהקליטה מצפה לו.
 */
export function effectiveRequestSubject(subject: string, mailbox?: string | null): string {
  const type = detectReqTypeForMailbox(subject, mailbox)

  // 🔴 אינו בקשה — מוחזר נושא מנוטרל ולא הנושא המקורי.
  //
  // ⚠️ "מה קורה עם ההלוואה שלי?" שנשלח ל-g@ אינו בקשה (אין ת"ז), אבל
  // הנושא המקורי עדיין מכיל את המילה "הלוואה" — ולכן isRequestSubject
  // עליו מחזיר אמת. החזרתו כפי שהוא הייתה מחזירה את השאלה למסלול
  // הקליטה דרך הדלת האחורית, והפונה היה מקבל מייל דחייה במקום מענה.
  if (!type) return isRequestSubject(subject) ? '' : subject

  const id = String(subject ?? '').match(/\d{9}/)?.[0] ?? ''
  // נושא שכבר בפורמט הנכון נשאר כפי שהוא — כדי לא לאבד ניסוח מדויק
  // (למשל "בקשת סיוע אלמן" מול "אלמנה").
  return isRequestSubject(subject) ? subject : `${SUBJECT_PREFIX[type]} · ת.ז ${id}`
}

// בונה קישורי mailto לטיוטות הגשה במייל (לחסומים) — לכל סוג בקשה, עם הת"ז בנושא.
// סיוע אלמנה מוצג רק אם מצב המשפחה אלמן/אלמנה, והתווית בהתאם (אלמן/אלמנה).
// ⚠️ כל קישור מסומן ב-open (האם המחלקה פתוחה) — מחלקה סגורה מוצגת אפורה עם
// "המערכת בפיתוח, אפשרות זו תיפתח בקרוב", בלי קישור פעיל.
export async function buildDraftLinks(
  admin: SupabaseClient,
  idNumber: string,
  pending: boolean,
  maritalStatus?: string | null,
): Promise<{ label: string; href: string; open: boolean }[]> {
  const widower = maritalStatus === 'אלמן' || maritalStatus === 'אלמנה'
  const married = maritalStatus === 'נשואים'
  const LABELS: Partial<Record<ReqType, string>> = {
    birth: 'להגשת בקשה לימי החלמה ומזון מוכן לאחר לידה',
    silent_birth: 'להגשת בקשה להחלמה ומזון לאחר לידה שקטה',
    loan: 'להגשת בקשת הלוואה (גמ״ח)',
    financial_aid: 'להגשת בקשת סיוע רפואי',
  }
  // מצב השערים (פתוח/סגור) לכל המחלקות — נטען פעם אחת.
  const { getDepartmentGates } = await import('./departmentGates')
  const gates = await getDepartmentGates(admin)
  const isOpen = (t: ReqType) => {
    const dept = REQ_TO_DEPT[t]
    return dept ? gates[dept] : true
  }
  // התאמת האפשרויות לפי הסטטוס המשפחתי:
  //  • לידה — רק נשואים.
  //  • הלוואה + סיוע רפואי — לכולם.
  //  • אלמנות ויתומים — רק אלמן/אלמנה.
  const types: ReqType[] = married
    ? ['birth', 'loan', 'financial_aid']
    : ['loan', 'financial_aid']
  const links: { label: string; href: string; open: boolean }[] = []
  for (const t of types) {
    const ctx = await loadCtx(admin, t, pending)
    links.push({ label: LABELS[t] ?? SUBJECT_PREFIX[t], href: draftMailto(t, idNumber, ctx), open: isOpen(t) })
  }
  if (widower) {
    const ctx = await loadCtx(admin, 'widow', pending)
    const prefix = `בקשת סיוע ${maritalStatus}` // "בקשת סיוע אלמן" / "בקשת סיוע אלמנה"
    links.push({ label: prefix, href: draftMailto('widow', idNumber, ctx, prefix), open: isOpen('widow') })
  }
  // ── רישום לחלוקת חגים במייל — בוטל ──
  //
  // 🔴 הערוץ הוסר במכוון. הרישום נעשה בטלפון ובאזור האישי, ושני אלה
  // מזהים את המשפחה ומאשרים לה מיד. הרישום במייל, לעומתם, היה תלוי
  // בהתאמה בין כתובת השולח לכתובת הרשומה — וכל פער בין השתיים יצר
  // פנייה שנראית כרישום אך אינה נקלטת, ובלאגן במקום שירות.
  //
  // ⚠️ הטיוטה המוכנה הוסרה כאן, וקליטת המייל עצמה נחסמה ב-handleEmailRequest.
  // ⚠️ אין להחזיר בלי להחזיר גם את הקליטה — קישור שמייצר פנייה שאיש אינו
  // קולט גרוע מהיעדר קישור.

  // ⚠️ מחלקה סגורה (שער סגור בהגדרות) — לא מוצגת כלל, לא מאפור. המשתמש ביקש
  // שכפתור של מחלקה שאינה פעילה לא יופיע בכלל, גם במייל וגם בטופס הציבורי.
  return links.filter(l => l.open)
}
