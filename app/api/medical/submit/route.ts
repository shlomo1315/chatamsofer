import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { isDepartmentAccessible, departmentClosedMessage } from '@/lib/departmentGates'
import { resolveBeneficiaryByEnteredId } from '@/lib/portalBeneficiary'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { NEED, ID_CARD_DOC, sanitizeFamily, sanitizeIncome } from '@/lib/aidDepartmentV2'
import {
  MEDICAL_FILE_TYPES, MEDICAL_MAX_DOCS, MEDICAL_MAX_FILE,
  fileSignatureMatches, idDigits, parseAidType, validateMedical,
} from '@/lib/medicalRequest'

export const dynamic = 'force-dynamic'

const BUCKET = 'documents'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const str = (f: FormData, k: string, max = 300) => String(f.get(k) ?? '').trim().slice(0, max)
const files = (f: FormData, k: string) =>
  f.getAll(k).filter((x): x is File => typeof x !== 'string' && x.size > 0)
const json = (f: FormData, k: string) => { try { return JSON.parse(str(f, k, 20000)) } catch { return null } }

const EXTRA_DOC = 'מסמך נוסף'
const MEDICAL_DOCS = ['סיכום רפואי או מכתב רופא', 'הצעת מחיר או חשבונית לטיפול']

// מסמכים מהאשף: doc_<i> עם doc_label_<i> מתוך רשימת המסמכים של הסיבה. התווית נבדקת בשרת.
function labeledDocs(f: FormData, aidType: keyof typeof NEED) {
  const allowed = [...NEED[aidType], EXTRA_DOC]
  const out: { f: File; kind: 'id_card' | 'medical' | 'other'; label: string }[] = []
  for (let i = 0; i < 12; i++) {
    const file = files(f, `doc_${i}`)[0]
    if (!file) continue
    const label = str(f, `doc_label_${i}`, 80)
    if (!allowed.includes(label)) return null
    out.push({ f: file, label, kind: label === ID_CARD_DOC ? 'id_card' : MEDICAL_DOCS.includes(label) ? 'medical' : 'other' })
  }
  return out
}

// הגשת בקשת סיוע רפואי מהטופס הציבורי. המבקש מקבל רק אישור קבלה, בלי שום מידע על הרשומות.
export async function POST(request: NextRequest) {
  if (!(await isDepartmentAccessible('financial_aid', request.nextUrl.searchParams.get('preview')))) {
    return NextResponse.json({ error: departmentClosedMessage('financial_aid'), departmentClosed: true }, { status: 403 })
  }
  if (!rateLimit(`medical-submit-ip:${clientIp(request)}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'נשלחו יותר מדי בקשות. נסה שוב מאוחר יותר.' }, { status: 429 })
  }
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let form: FormData
  try { form = await request.formData() }
  catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  // שדה מלכודת לבוטים: אנשים אמיתיים לא רואים אותו
  if (str(form, 'website')) return NextResponse.json({ ok: true })

  const input = {
    idNumber: idDigits(form.get('id_number')),
    fullName: str(form, 'full_name', 120),
    phone: str(form, 'phone', 20),
    email: str(form, 'email', 120),
    address: str(form, 'address', 200),
    city: str(form, 'city', 80),
    amount: Number(str(form, 'amount', 12)),
    reason: str(form, 'reason', 3000),
    aidType: parseAidType(form.get('aid_type')),
    relation: str(form, 'relation', 80),
    referrer: str(form, 'referrer', 200),
    phone2: str(form, 'phone2', 20),
    birthDate: str(form, 'birth_date', 10),
    gender: str(form, 'gender', 10),
    maritalStatus: str(form, 'marital_status', 20),
    childrenCount: Math.min(40, Math.max(0, Math.trunc(Number(str(form, 'children_count', 3)) || 0))),
    spouseName: str(form, 'spouse_name', 120),
    spouseId: idDigits(form.get('spouse_id_number')).slice(0, 9),
  }
  // צאצא שנכנס לאזור האישי: הזיהוי לפי הסשן, לא לפי מה שנשלח בטופס
  const portalId = getPortalBeneficiaryId(request)
  const portalBen = portalId
    ? (await admin.from('beneficiaries').select('id, id_number').eq('id', portalId).maybeSingle()).data as { id: string; id_number: string | null } | null
    : null
  if (portalBen?.id_number) input.idNumber = idDigits(portalBen.id_number)

  // האשף החדש שולח מסמכים לפי תווית; הטופס הישן שלח id_card ו-medical
  const wizard = labeledDocs(form, input.aidType)
  if (!wizard) return NextResponse.json({ error: 'סוג מסמך לא מוכר' }, { status: 400 })
  const all = [
    ...wizard,
    ...files(form, 'id_card').map(f => ({ f, kind: 'id_card' as const, label: ID_CARD_DOC })),
    ...files(form, 'medical').map(f => ({ f, kind: 'medical' as const, label: '' })),
  ]
  const idCount = all.filter(d => d.kind === 'id_card').length
  const medicalCount = all.filter(d => d.kind === 'medical').length
  if (idCount > 1 || all.length > MEDICAL_MAX_DOCS + 4) {
    return NextResponse.json({ error: 'יותר מדי מסמכים בבקשה אחת' }, { status: 400 })
  }
  if (input.idNumber.length >= 5 && !rateLimit(`medical-submit-id:${input.idNumber}`, 3, 24 * 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'כבר נשלחו בקשות עבור מספר זה. נסה שוב מחר.' }, { status: 429 })
  }

  // זיהוי בשרת בלבד — הלקוח לא קובע אם הוא צאצא
  const ben = portalBen ?? (input.idNumber.length >= 5
    ? await resolveBeneficiaryByEnteredId<{ id: string }>(admin, input.idNumber, 'id')
    : null)
  const descendant = !!ben

  const err = validateMedical(input, descendant, idCount === 1, medicalCount)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  // עיר: אותה אכיפה כמו ברישום לאיגוד (רק עיר מהמאגר הרשמי)
  if (!descendant) {
    const { isKnownCity } = await import('@/lib/govData')
    if (!(await isKnownCity(admin, input.city))) {
      return NextResponse.json({ error: 'יש לבחור עיר מתוך הרשימה.' }, { status: 400 })
    }
  }

  // בדיקת קבצים: סיומת מותרת, גודל, ותוכן אמיתי שתואם את הסיומת
  const prepared: { kind: 'id_card' | 'medical' | 'other'; label: string; name: string; ext: string; type: string; buf: ArrayBuffer }[] = []
  for (const { f, kind, label } of all) {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    const type = MEDICAL_FILE_TYPES[ext]
    if (!type) return NextResponse.json({ error: 'סוג הקובץ אינו נתמך. ניתן להעלות תמונות או PDF בלבד.' }, { status: 400 })
    if (f.size > MEDICAL_MAX_FILE) return NextResponse.json({ error: 'קובץ גדול מ-10MB' }, { status: 400 })
    const buf = await f.arrayBuffer()
    if (!fileSignatureMatches(ext, new Uint8Array(buf.slice(0, 16)))) {
      return NextResponse.json({ error: 'תוכן הקובץ אינו תואם לסוגו. נא להעלות תמונה או PDF תקינים.' }, { status: 400 })
    }
    prepared.push({ kind, label, name: f.name.slice(0, 120), ext, type, buf })
  }

  const uploaded: { kind: string; label: string; url: string; name: string }[] = []
  const paths: string[] = []
  // מחיקת קבצים שכבר עלו כשהשמירה נכשלת, כדי שלא יישארו יתומים במאגר
  const cleanup = async () => { if (paths.length) await admin.storage.from(BUCKET).remove(paths).catch(() => {}) }
  for (const p of prepared) {
    const path = `public-medical/${Date.now()}-${Math.random().toString(36).slice(2)}.${p.ext}`
    const { error } = await admin.storage.from(BUCKET).upload(path, p.buf, { contentType: p.type, upsert: false })
    if (error) { await cleanup(); return NextResponse.json({ error: 'שגיאה בהעלאת המסמך' }, { status: 500 }) }
    paths.push(path)
    uploaded.push({ kind: p.kind, label: p.label, url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, name: p.name })
  }

  const firstMedical = uploaded.find(u => u.kind === 'medical')
  const family = sanitizeFamily(json(form, 'family'))
  const income = form.has('income') ? sanitizeIncome(json(form, 'income')) : null
  const fields = {
    beneficiary_id: ben?.id ?? null,
    source: 'public',
    is_descendant: descendant && input.relation !== 'not_descendant',
    aid_type: input.aidType,
    relation: input.relation || null,
    referrer: input.referrer || null,
    reason: input.reason,
    requested_amount: input.amount,
    applicant_name: input.fullName || null,
    applicant_id_number: input.idNumber,
    applicant_phone: input.phone,
    applicant_email: input.email || null,
    applicant_address: input.address || null,
    applicant_city: input.city || null,
    applicant_details: descendant ? null : {
      phone2: input.phone2 || null,
      birth_date: input.birthDate,
      gender: input.gender,
      marital_status: input.maritalStatus,
      children_count: input.childrenCount,
      spouse_name: input.spouseName || null,
      spouse_id_number: input.spouseId || null,
    },
    document_url: firstMedical?.url ?? null,
    document_name: firstMedical?.name ?? null,
    status: 'pending',
  }
  // לפני שהמיגרציה רצה אין עמודות family/income/request_no: שומרים בלעדיהן
  let res = await admin.from('financial_aid_requests')
    .insert({ ...fields, family: family.wife || family.kids.length ? family : null, income })
    .select('id, request_no').single()
  if (res.error) res = await admin.from('financial_aid_requests').insert(fields).select('id').single() as typeof res
  const row = res.data
  if (res.error || !row) { await cleanup(); return NextResponse.json({ error: 'שגיאה בשמירת הבקשה' }, { status: 500 }) }

  if (uploaded.length) {
    const docs = uploaded.map(u => ({ request_id: row.id, kind: u.kind, label: u.label || null, file_url: u.url, file_name: u.name }))
    const { error: de } = await admin.from('financial_aid_documents').insert(docs)
    if (de) await admin.from('financial_aid_documents').insert(docs.map(({ label: _l, ...d }) => ({ ...d, kind: d.kind === 'other' ? 'medical' : d.kind })))
  }

  return NextResponse.json({ ok: true, requestNo: row.request_no ?? null })
}
