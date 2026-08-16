// קליטת בקשות שמגיעות במייל (לחסומים): זיהוי סוג + מוטב, פרסור, אימות, קבצים
// לפי שם, הכנסה למערכת (סטטוס pending) ושליחת אישור/דחייה. best-effort, לא זורק.
import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from './sendMail'
import { mailFor } from './departments'
import { emailIntakeRejectedEmail, requestBlockedRejectedEmail, requestReceivedEmail, greetMrs } from './emailTemplates'
import {
  detectReqType, SUBJECT_PREFIX, attachmentsFor, parseDraft, validateRequest,
  draftMailto, IGUD_MAILBOX, type ReqType,
} from './emailRequestForms'
import { isDepartmentOpen, departmentClosedMessage, type GatedDepartment } from './departmentGates'
import { findOpenLoan, openLoanEmailReason } from './openLoanGuard'

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

async function loadCtx(admin: SupabaseClient, type: ReqType, pending: boolean) {
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

  // ⚠️ הטופס הריק אינו מצורף עוד כקובץ אלא מוצע כקישור בגוף ההודעה
  // (ראו emailIntakeRejectedEmail). הצרופה ניפחה כל דחייה במאות קילובייטים
  // ונשלחה שוב בכל ניסיון חוזר.
  //
  // 🔴 הקישור עצמו *חייב* להישאר: הדחייה הזו נשלחת דווקא כשהטופס חסר, ומי
  // שהגיש במייל לא עבר בפורטל ואין לו מאיפה להוריד אותו. הודעת "חסר טופס"
  // בלי דרך להשיגו משאירה את המבקש תקוע.
  return deliverMail(to, mail.subject, mail.html, undefined, { ...mailFor('igud'), skipLog: true })
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

export async function handleEmailRequest(admin: SupabaseClient, msg: Msg): Promise<boolean> {
  // ⚠️ נבדק *לפני* detectReqType: הנושא "רישום לחלוקת חגים" אינו סוג טופס, ואילו
  // היה נופל לזיהוי הרגיל הוא היה מוחזר כ-null והמייל היה נבלע בשקט.
  if (isHolidaySubject(msg.subject)) return handleHolidayEmail(admin, msg)

  const type = detectReqType(msg.subject)
  if (!type) return false

  const from = (msg.fromEmail || '').toLowerCase()
  if (!from || from.endsWith('@chasamsofer.info') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) return true

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

  // קבצים לפי שם
  const specs = attachmentsFor(type, ctx)
  const matched: Record<string, string> = {}
  for (const spec of specs) {
    const f = msg.attachments.find((a) => baseName(a.filename) === spec.name && a.url)
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
  // ── רישום לחלוקת חגים במייל ──
  // ⚠️ מופיע רק כשיש חלוקה שהרישום אליה פתוח *וגם* מתג-האב פתוח — שתי הבדיקות
  // יחד יושבות ב-getOpenDistribution, ולכן די בקריאה אחת. בלי שדות למלא:
  // הנושא נושא את הת"ז וזה כל מה שנדרש.
  const { getOpenDistribution } = await import('./holidayDistributions')
  const openDist = await getOpenDistribution()
  if (openDist) {
    const subject = `${HOLIDAY_SUBJECT_PREFIX} ${idNumber}`
    const body = `שלום וברכה\n\nאבקש לרשום אותי לחלוקת ${openDist.name}${openDist.year ? ` ${openDist.year}` : ''}.\n\nאין צורך למלא פרטים נוספים — יש לשלוח את המייל כמו שהוא.`
    links.push({
      label: `להרשמה לחלוקת ${openDist.name}${openDist.year ? ` ${openDist.year}` : ''}`,
      href: `mailto:${IGUD_MAILBOX}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
      open: true,
    })
  }

  // ⚠️ מחלקה סגורה (שער סגור בהגדרות) — לא מוצגת כלל, לא מאפור. המשתמש ביקש
  // שכפתור של מחלקה שאינה פעילה לא יופיע בכלל, גם במייל וגם בטופס הציבורי.
  return links.filter(l => l.open)
}
