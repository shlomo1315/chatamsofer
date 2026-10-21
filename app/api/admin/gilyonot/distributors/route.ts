import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { MAX_IMPORT_FILE_BYTES, decodeTextFile, importFileKind, xlsxToImportText, xlsxToSheets } from '@/lib/gilyonotImportFile'
import { buildBookletImport, planBookletWrite, type ExistingDistributor, type Sheet } from '@/lib/gilyonotDistributorBooklet'
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
async function fileBody(form: FormData | null): Promise<Record<string, unknown> | NextResponse> {
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

// קובץ אחד מתוך הטופס → גיליונות (xlsx: כל הגיליונות, CSV: גיליון אחד בשם הקובץ)
async function readSheets(form: FormData, field: string): Promise<Sheet[] | string | null> {
  const file = form.get(field)
  if (!(file instanceof File) || !file.size) return null
  const kind = importFileKind(file.name)
  if (!kind) return 'אפשר להעלות קובץ Excel (xlsx) או CSV'
  if (file.size > MAX_IMPORT_FILE_BYTES) return 'הקובץ גדול מדי (עד 5MB)'
  const buf = await file.arrayBuffer()
  try {
    return kind === 'xlsx' ? await xlsxToSheets(buf) : [{ name: file.name.replace(/\.[^.]+$/, ''), rows: parseCsv(decodeTextFile(buf)) }]
  } catch {
    return `לא הצלחנו לקרוא את ${file.name}. שמרו אותו כ-xlsx או CSV ונסו שוב.`
  }
}

// חוברת ההרשמה + קובץ המסלולים (multipart: booklet, routes, commit).
// בלי commit — תצוגה מקדימה בלבד, שום דבר לא נכתב. עם commit=1 — חדשים נכנסים, וקיימים מקבלים מסלול ושדות שהיו ריקים.
async function bookletImport(form: FormData, db: NonNullable<ReturnType<typeof getServiceClient>>, userId: string) {
  const booklet = await readSheets(form, 'booklet')
  if (!booklet) return NextResponse.json({ error: 'בחרו את קובץ החוברת' }, { status: 400 })
  if (typeof booklet === 'string') return NextResponse.json({ error: booklet }, { status: 400 })
  const routes = await readSheets(form, 'routes')
  if (typeof routes === 'string') return NextResponse.json({ error: routes }, { status: 400 })
  const first = booklet.find(s => s.rows.length > 1)
  if (!first) return NextResponse.json({ error: 'קובץ החוברת ריק' }, { status: 400 })
  const built = buildBookletImport(first.rows, routes ?? [])
  if (built.error) return NextResponse.json({ error: built.error }, { status: 400 })
  if (built.rows.length > MAX_IMPORT_DISTRIBUTORS) return NextResponse.json({ error: `אפשר לייבא עד ${MAX_IMPORT_DISTRIBUTORS.toLocaleString('he-IL')} מפיצים בפעם אחת` }, { status: 400 })

  const existing: ExistingDistributor[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from('gilyonot_distributors')
      .select('id, full_name, phone, phone2, email, id_number, city, address, synagogue, quantity, route, notes').order('id').range(offset, offset + 999)
    if (error) return NextResponse.json({ error: 'טעינת המפיצים הקיימים נכשלה. ייתכן שהמיגרציה 20261020_gilyonot_distributors_route.sql עוד לא הורצה.' }, { status: 500 })
    existing.push(...((data ?? []) as ExistingDistributor[]))
    if ((data ?? []).length < 1000) break
  }
  const plan = planBookletWrite(existing, built.rows)
  const summary = { report: built.report, inserts: plan.inserts.length, updates: plan.updates.length, unchanged: plan.unchanged }
  if (form.get('commit') !== '1') return NextResponse.json({ ok: true, preview: true, ...summary })

  for (let i = 0; i < plan.inserts.length; i += CHUNK) {
    const { error } = await db.from('gilyonot_distributors').insert(plan.inserts.slice(i, i + CHUNK).map(r => ({ ...r, source: 'import' })))
    if (error) return NextResponse.json({ error: `הייבוא נעצר אחרי ${i} מפיצים חדשים. אפשר להריץ שוב: מי שכבר נכנס לא יוכפל.` }, { status: 500 })
  }
  let updated = 0
  for (const u of plan.updates) {
    const { error } = await db.from('gilyonot_distributors').update({ ...u.patch, updated_at: new Date().toISOString() }).eq('id', u.id)
    if (error) return NextResponse.json({ error: `העדכון נעצר אחרי ${updated} מפיצים קיימים (${u.name}). אפשר להריץ שוב.`, added: plan.inserts.length, updated }, { status: 500 })
    updated++
  }
  const r = built.report
  await logActivity(db, { userId, action: 'gilyonot_distributor_booklet_import', entityType: 'gilyonot_distributor', details: {
    added: plan.inserts.length, updated, unchanged: plan.unchanged, registrations: r.registrations, skipped: r.skipped.length, withRoute: r.withRoute, routeUnmatched: r.route.unmatched.length,
  } })
  return NextResponse.json({ ok: true, preview: false, ...summary, added: plan.inserts.length, updated })
}

// POST { mode: 'add', ...שדות } | { mode: 'import', text } | multipart עם קובץ (file) | multipart mode=booklet
export async function POST(request: Request) {
  const staff = await requirePermission('gilyonot', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()
  const isFile = (request.headers.get('content-type') ?? '').startsWith('multipart/form-data')
  const form = isFile ? await request.formData().catch(() => null) : null
  if (form?.get('mode') === 'booklet') return bookletImport(form, db, staff.userId)
  const body = isFile ? await fileBody(form) : await request.json().catch(() => null) as Record<string, unknown> | null
  if (body instanceof NextResponse) return body
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  if (body.mode === 'add') {
    const v = validateDistributor(body, { requirePhone: true })
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
    const v = validateDistributor((body.fields ?? {}) as Record<string, unknown>, { requirePhone: true })
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
