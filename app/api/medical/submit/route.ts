import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { isDepartmentAccessible, departmentClosedMessage } from '@/lib/departmentGates'
import { resolveBeneficiaryByEnteredId } from '@/lib/portalBeneficiary'
import {
  MEDICAL_FILE_TYPES, MEDICAL_MAX_DOCS, MEDICAL_MAX_FILE,
  fileSignatureMatches, idDigits, validateMedical,
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
  }
  const idCards = files(form, 'id_card')
  const medical = files(form, 'medical')
  const all = [...idCards.map(f => ({ f, kind: 'id_card' as const })), ...medical.map(f => ({ f, kind: 'medical' as const }))]

  if (idCards.length > 1 || medical.length > MEDICAL_MAX_DOCS) {
    return NextResponse.json({ error: `ניתן לצרף עד ${MEDICAL_MAX_DOCS} מסמכים רפואיים וצילום ת.ז. אחד` }, { status: 400 })
  }
  if (input.idNumber.length >= 5 && !rateLimit(`medical-submit-id:${input.idNumber}`, 3, 24 * 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'כבר נשלחו בקשות עבור מספר זה. נסה שוב מחר.' }, { status: 429 })
  }

  // זיהוי בשרת בלבד — הלקוח לא קובע אם הוא צאצא
  const ben = input.idNumber.length >= 5
    ? await resolveBeneficiaryByEnteredId<{ id: string }>(admin, input.idNumber, 'id')
    : null
  const descendant = !!ben

  const err = validateMedical(input, descendant, idCards.length === 1, medical.length)
  if (err) return NextResponse.json({ error: err }, { status: 400 })

  // בדיקת קבצים: סיומת מותרת, גודל, ותוכן אמיתי שתואם את הסיומת
  const prepared: { kind: 'id_card' | 'medical'; name: string; ext: string; type: string; buf: ArrayBuffer }[] = []
  for (const { f, kind } of all) {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    const type = MEDICAL_FILE_TYPES[ext]
    if (!type) return NextResponse.json({ error: 'סוג הקובץ אינו נתמך. ניתן להעלות תמונות או PDF בלבד.' }, { status: 400 })
    if (f.size > MEDICAL_MAX_FILE) return NextResponse.json({ error: 'קובץ גדול מ-10MB' }, { status: 400 })
    const buf = await f.arrayBuffer()
    if (!fileSignatureMatches(ext, new Uint8Array(buf.slice(0, 16)))) {
      return NextResponse.json({ error: 'תוכן הקובץ אינו תואם לסוגו. נא להעלות תמונה או PDF תקינים.' }, { status: 400 })
    }
    prepared.push({ kind, name: f.name.slice(0, 120), ext, type, buf })
  }

  const uploaded: { kind: string; url: string; name: string }[] = []
  const paths: string[] = []
  // מחיקת קבצים שכבר עלו כשהשמירה נכשלת, כדי שלא יישארו יתומים במאגר
  const cleanup = async () => { if (paths.length) await admin.storage.from(BUCKET).remove(paths).catch(() => {}) }
  for (const p of prepared) {
    const path = `public-medical/${Date.now()}-${Math.random().toString(36).slice(2)}.${p.ext}`
    const { error } = await admin.storage.from(BUCKET).upload(path, p.buf, { contentType: p.type, upsert: false })
    if (error) { await cleanup(); return NextResponse.json({ error: 'שגיאה בהעלאת המסמך' }, { status: 500 }) }
    paths.push(path)
    uploaded.push({ kind: p.kind, url: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, name: p.name })
  }

  const firstMedical = uploaded.find(u => u.kind === 'medical')
  const { data: row, error } = await admin.from('financial_aid_requests').insert({
    beneficiary_id: ben?.id ?? null,
    source: 'public',
    is_descendant: descendant,
    reason: input.reason,
    requested_amount: input.amount,
    applicant_name: input.fullName || null,
    applicant_id_number: input.idNumber,
    applicant_phone: input.phone,
    applicant_email: input.email || null,
    applicant_address: input.address || null,
    applicant_city: input.city || null,
    document_url: firstMedical?.url ?? null,
    document_name: firstMedical?.name ?? null,
    status: 'pending',
  }).select('id').single()
  if (error || !row) { await cleanup(); return NextResponse.json({ error: 'שגיאה בשמירת הבקשה' }, { status: 500 }) }

  if (uploaded.length) {
    await admin.from('financial_aid_documents').insert(
      uploaded.map(u => ({ request_id: row.id, kind: u.kind, file_url: u.url, file_name: u.name })),
    )
  }

  return NextResponse.json({ ok: true })
}
