// קליטת בקשות שמגיעות במייל (לחסומים): זיהוי סוג + מוטב, פרסור, אימות, קבצים
// לפי שם, הכנסה למערכת (סטטוס pending) ושליחת אישור/דחייה. best-effort, לא זורק.
import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from './sendMail'
import { mailFor } from './departments'
import { emailIntakeRejectedEmail, requestBlockedRejectedEmail, requestReceivedEmail } from './emailTemplates'
import {
  detectReqType, SUBJECT_PREFIX, attachmentsFor, parseDraft, validateRequest,
  draftMailto, type ReqType,
} from './emailRequestForms'

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
  const { data: cRows } = await admin.from('card_centers').select('id, name, city').eq('is_active', true).order('name')
  const centers = (cRows ?? []).map((c) => ({ id: c.id as string, name: c.name as string, city: (c.city ?? null) as string | null }))
  return { recoveryHomes: [...recovery], centers, pending }
}

// ממפה סוג בקשה לפרמטר ה-deep-link בדף הבית (?action=), כדי שהכפתור יפתח ישירות
// את טופס ההגשה המתאים ולא את הדף הכללי.
const ACTION_PARAM: Record<ReqType, string> = {
  birth: 'birth', silent_birth: 'birth', loan: 'loan', financial_aid: 'aid', widow: 'aid',
}

// להגשה חוזרת מצרפים *קישור* לטיוטה מוכנה (mailto) במקום להדביק את כל הטקסט.
function reject(to: string, name: string, type: ReqType, errors: string[], idNumber: string, ctx: Awaited<ReturnType<typeof loadCtx>>) {
  const draftHref = draftMailto(type, idNumber, ctx)
  const mail = emailIntakeRejectedEmail({ name, typeLabel: SUBJECT_PREFIX[type], errors, draftHref, action: ACTION_PARAM[type] })
  return deliverMail(to, mail.subject, mail.html, undefined, { ...mailFor('igud'), skipLog: true })
}

// מחזיר true אם המייל זוהה כבקשה וטופל (כדי לדלג על מענה אוטומטי אחר).
export async function handleEmailRequest(admin: SupabaseClient, msg: Msg): Promise<boolean> {
  const type = detectReqType(msg.subject)
  if (!type) return false

  const from = (msg.fromEmail || '').toLowerCase()
  if (!from || from.endsWith('@chasamsofer.info') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) return true

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
    .select('id, full_name, family_name, eligibility_status, rejection_reason, marital_status')
    .or(`id_number.eq.${idNumber},spouse_id_number.eq.${idNumber}`)
    .maybeSingle()
  const name = ben ? [ben.family_name, ben.full_name].filter(Boolean).join(' ') : ''
  if (!ben) {
    await reject(from, '', type, [`לא נמצאה רשומה לתעודת זהות ${idNumber}. ודאו שנרשמתם, או הירשמו במערכת הדיגיטלית שלנו`], idNumber, generic)
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
    await reject(from, name, type, errors, idNumber, ctx)
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
        card_center_id: (data.card_center_id as string) ?? null,
        birth_certificate_url: matched['אישור-לידה'] ?? null,
        notes: data.notes ?? null,
        birth_type: type === 'silent_birth' ? 'silent' : 'live',
        status: 'pending',
      })
      insErr = r.error?.message ?? null
    } else if (type === 'loan') {
      const amount = data.amount as number
      const installments = data.installments as number
      const r = await admin.from('loans').insert({
        beneficiary_id: ben.id, amount, installments,
        monthly_payment: Math.round((amount / installments) * 100) / 100,
        purpose: data.purpose, notes: data.notes ?? null,
        document_urls: matched['מסמך-תומך'] ? [matched['מסמך-תומך']] : null,
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
    await reject(from, name, type, ['אירעה שגיאה בקליטת הבקשה. אנא נסו שוב או הגישו דרך המערכת הדיגיטלית שלנו'], idNumber, ctx)
    return true
  }

  // מייל אישור עם כל הפרטים שהוגשו — כמו בהגשה דרך האתר (requestReceivedEmail).
  const s = (v: unknown) => (v == null || v === '') ? '' : String(v)
  const genderLbl = (g: unknown) => g === 'male' ? 'זכר' : g === 'female' ? 'נקבה' : ''
  const centerName = (data.card_center_id as string)
    ? (ctx.centers.find(c => c.id === data.card_center_id)?.name ?? '')
    : ''
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
      ['בית החלמה', s(data.recovery_home)],
      ['מוקד לקבלת הכרטיס', centerName],
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
export async function buildDraftLinks(
  admin: SupabaseClient,
  idNumber: string,
  pending: boolean,
  maritalStatus?: string | null,
): Promise<{ label: string; href: string }[]> {
  const widower = maritalStatus === 'אלמן' || maritalStatus === 'אלמנה'
  const married = maritalStatus === 'נשואים'
  const LABELS: Partial<Record<ReqType, string>> = {
    birth: 'להגשת בקשה לימי החלמה ומזון מוכן לאחר לידה',
    silent_birth: 'להגשת בקשה להחלמה ומזון לאחר לידה שקטה',
    loan: 'להגשת בקשת הלוואה (גמ״ח)',
    financial_aid: 'להגשת בקשת סיוע רפואי',
  }
  // התאמת האפשרויות לפי הסטטוס המשפחתי:
  //  • לידה + לידה שקטה — רק נשואים.
  //  • הלוואה + סיוע רפואי — לכולם.
  //  • אלמנות ויתומים — רק אלמן/אלמנה.
  const types: ReqType[] = married
    ? ['birth', 'silent_birth', 'loan', 'financial_aid']
    : ['loan', 'financial_aid']
  const links: { label: string; href: string }[] = []
  for (const t of types) {
    const ctx = await loadCtx(admin, t, pending)
    links.push({ label: LABELS[t] ?? SUBJECT_PREFIX[t], href: draftMailto(t, idNumber, ctx) })
  }
  if (widower) {
    const ctx = await loadCtx(admin, 'widow', pending)
    const prefix = `בקשת סיוע ${maritalStatus}` // "בקשת סיוע אלמן" / "בקשת סיוע אלמנה"
    links.push({ label: prefix, href: draftMailto('widow', idNumber, ctx, prefix) })
  }
  return links
}
