import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { MAX_IMPORT_FILE_BYTES, decodeTextFile, importFileKind, xlsxToImportText } from '@/lib/gilyonotImportFile'
import { MAX_IMPORT_DISTRIBUTORS, cleanText, parseCsv, parseDistributorTable, validateDistributor, type DistributorFields } from '@/lib/gilyonotDistributors'
import { DISTRIBUTOR_COLS } from '@/lib/gilyonotDistributorServer'

// מערך המפיצים (app/admin/gilyonot?tab=distributors): הוספה, ייבוא, עריכה, הסרה/החזרה ומחיקה.
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CHUNK = 500

// מפתח כפילות בייבוא: אותו טלפון באותו בית כנסת, או (בלי טלפון) אותו שם באותה עיר
const dupKey = (r: { full_name: string; phone: string | null; city: string | null; synagogue: string | null }) =>
  r.phone ? `p:${r.phone}|${r.synagogue ?? ''}` : `n:${r.full_name}|${r.city ?? ''}`

// קובץ שהועלה (multipart, שדה file) → { mode: 'import', text }. שורת הכותרות נשמרת: לפיה מזהים עמודות.
async function fileBody(request: Request): Promise<Record<string, unknown> | NextResponse> {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'לא נבחר קובץ' }, { status: 400 })
  const kind = importFileKind(file.name)
  if (!kind) return NextResponse.json({ error: 'אפשר להעלות קובץ Excel (xlsx) או CSV' }, { status: 400 })
  if (file.size > MAX_IMPORT_FILE_BYTES) return NextResponse.json({ error: 'הקובץ גדול מדי (עד 5MB)' }, { status: 400 })
  const buf = await file.arrayBuffer()
  try {
    return { mode: 'import', text: kind === 'xlsx' ? await xlsxToImportText(buf) : decodeTextFile(buf) }
  } catch {
    return NextResponse.json({ error: 'לא הצלחנו לקרוא את הקובץ. שמרו אותו כ-xlsx או CSV ונסו שוב.' }, { status: 400 })
  }
}

// POST { mode: 'add', ...שדות } | { mode: 'import', text } | multipart עם קובץ (file)
export async function POST(request: Request) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const isFile = (request.headers.get('content-type') ?? '').startsWith('multipart/form-data')
  const body = isFile ? await fileBody(request) : await request.json().catch(() => null) as Record<string, unknown> | null
  if (body instanceof NextResponse) return body
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  if (body.mode === 'add') {
    const v = validateDistributor(body)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    const { data, error } = await db.from('gilyonot_distributors').insert({ ...v.value, source: 'manual' }).select(DISTRIBUTOR_COLS).single()
    if (error) return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
    await logActivity(db, { userId: staff.userId, action: 'gilyonot_distributor_add', entityType: 'gilyonot_distributor', details: { id: data.id, name: v.value.full_name } })
    return NextResponse.json({ ok: true, distributor: data })
  }

  if (body.mode === 'import') {
    const text = typeof body.text === 'string' ? body.text : ''
    const parsed = parseDistributorTable(parseCsv(text))
    if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 })
    if (!parsed.rows.length) return NextResponse.json({ error: 'לא נמצאו שורות תקינות', invalid: parsed.invalid.slice(0, 50) }, { status: 400 })
    if (parsed.rows.length > MAX_IMPORT_DISTRIBUTORS) return NextResponse.json({ error: `אפשר לייבא עד ${MAX_IMPORT_DISTRIBUTORS.toLocaleString('he-IL')} מפיצים בפעם אחת` }, { status: 400 })

    // מי שכבר רשום (גם אם הוסר) לא נכנס שוב — כך ייבוא חוזר של אותו קובץ לא מכפיל
    const existing = new Set<string>()
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from('gilyonot_distributors').select('full_name, phone, city, synagogue').order('id').range(offset, offset + 999)
      if (error) return NextResponse.json({ error: 'טעינת המפיצים הקיימים נכשלה' }, { status: 500 })
      for (const r of data ?? []) existing.add(dupKey(r))
      if ((data ?? []).length < 1000) break
    }
    const fresh: DistributorFields[] = []
    let exists = 0
    for (const r of parsed.rows) {
      const k = dupKey(r)
      if (existing.has(k)) { exists++; continue }
      existing.add(k)
      fresh.push(r)
    }
    for (let i = 0; i < fresh.length; i += CHUNK) {
      const { error } = await db.from('gilyonot_distributors').insert(fresh.slice(i, i + CHUNK).map(r => ({ ...r, source: 'import' })))
      if (error) return NextResponse.json({ error: `הייבוא נעצר אחרי ${i} שורות`, added: i }, { status: 500 })
    }
    await logActivity(db, { userId: staff.userId, action: 'gilyonot_distributor_import', entityType: 'gilyonot_distributor', details: { added: fresh.length, exists, invalid: parsed.invalid.length, columns: parsed.columns } })
    return NextResponse.json({ ok: true, added: fresh.length, exists, invalid: parsed.invalid.slice(0, 50), invalidCount: parsed.invalid.length, columns: parsed.columns })
  }

  return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
}

// PATCH { id, fields: {...} } — עריכה · { id, status: 'removed' | 'active', reason? } — הסרה/החזרה
export async function PATCH(request: Request) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const id = typeof body?.id === 'string' && UUID_RE.test(body.id) ? body.id : null
  if (!body || !id) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  const { data: before } = await db.from('gilyonot_distributors').select(DISTRIBUTOR_COLS).eq('id', id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'המפיץ לא נמצא' }, { status: 404 })
  const now = new Date().toISOString()

  let update: Record<string, unknown>
  if (body.status === 'removed' || body.status === 'active') {
    update = body.status === 'removed'
      ? { status: 'removed', removed_at: now, removed_reason: cleanText(body.reason, 200) ?? 'הוסר במשרד' }
      : { status: 'active', removed_at: null, removed_reason: null }
  } else {
    const v = validateDistributor((body.fields ?? {}) as Record<string, unknown>)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    update = { ...v.value }
  }
  const { data, error } = await db.from('gilyonot_distributors').update({ ...update, updated_at: now }).eq('id', id).select(DISTRIBUTOR_COLS).single()
  if (error) return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })

  const changed = Object.fromEntries(Object.keys(update).filter(k => (before as Record<string, unknown>)[k] !== update[k]).map(k => [k, (before as Record<string, unknown>)[k]]))
  if (Object.keys(changed).length) {
    await db.from('gilyonot_distributor_events').insert({
      distributor_id: id, kind: 'admin_edit', channel: 'admin', status: 'done', handled_by: staff.userId, handled_at: now,
      old_value: changed, new_value: Object.fromEntries(Object.keys(changed).map(k => [k, update[k]])),
    })
  }
  await logActivity(db, { userId: staff.userId, action: 'gilyonot_distributor_edit', entityType: 'gilyonot_distributor', details: { id, changed: Object.keys(changed) } })
  return NextResponse.json({ ok: true, distributor: data })
}

// DELETE ?id= — מחיקה לצמיתות (כולל יומן הפניות). להסרה רגילה: PATCH status=removed.
export async function DELETE(request: Request) {
  const staff = await requirePermission('gilyonot', 'delete')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const id = new URL(request.url).searchParams.get('id') ?? ''
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  const { data, error } = await db.from('gilyonot_distributors').delete().eq('id', id).select('full_name')
  if (error) return NextResponse.json({ error: 'המחיקה נכשלה' }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'המפיץ לא נמצא' }, { status: 404 })
  await logActivity(db, { userId: staff.userId, action: 'gilyonot_distributor_delete', entityType: 'gilyonot_distributor', details: { id, name: data[0].full_name } })
  return NextResponse.json({ ok: true })
}
