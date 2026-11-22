import { NextResponse, type NextRequest } from 'next/server'
import { unauthorized, getServiceClient, requirePermission } from '@/lib/apiAuth'
import { getDistRules, saveDistRules, normalizeRules } from '@/lib/holidayDistRules'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// כללי הרישום של חלוקה: "בטלפון בלבד", "חסימת בדיקה מעמיקה", אישור אוטומטי,
// "הימים והשעות פורסמו", ומספר הקו. ראו lib/holidayDistRules.ts.
//
// POST { action: 'open_all_centers' } — פותח לחלוקה את כל המוקדים הפעילים,
// כדי שבחירת המוקד בטלפון תציע אותם מהרגע הראשון.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('distributions', 'view')
  if (!staff) return unauthorized()
  const { id } = await ctx.params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const rules = await getDistRules(id)
  const [{ count: openCount }, { count: activeCount }, { count: deepCount }] = await Promise.all([
    db.from('holiday_center_openings').select('center_id', { count: 'exact', head: true }).eq('distribution_id', id),
    db.from('holiday_centers').select('id', { count: 'exact', head: true }).eq('is_active', true),
    db.from('beneficiaries').select('id', { count: 'exact', head: true }).eq('eligibility_status', 'deep_review'),
  ])
  return NextResponse.json({
    rules,
    defaultPhoneNumber: (process.env.TELEPHONY_MAIN_NUMBER || process.env.HOLIDAY_PHONE_NUMBER || '').trim(),
    centers: { open: openCount ?? 0, active: activeCount ?? 0 },
    deepReviewFamilies: deepCount ?? 0,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('distributions', 'edit')
  if (!staff) return unauthorized()
  const { id } = await ctx.params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { data: dist } = await db.from('distributions').select('id').eq('id', id).maybeSingle()
  if (!dist) return NextResponse.json({ error: 'החלוקה לא נמצאה' }, { status: 404 })

  if (body.action === 'open_all_centers') {
    const { data: centers } = await db.from('holiday_centers').select('id').eq('is_active', true)
    const rows = ((centers ?? []) as { id: string }[]).map(c => ({ distribution_id: id, center_id: c.id }))
    if (!rows.length) return NextResponse.json({ error: 'אין מוקדים פעילים' }, { status: 400 })
    // ⚠️ ignoreDuplicates: מוקד שכבר פתוח (ואולי כבר מחלק) לא יאופס.
    const { error } = await db.from('holiday_center_openings')
      .upsert(rows, { onConflict: 'distribution_id,center_id', ignoreDuplicates: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    console.log(`[dist-rules] open_all_centers dist=${id} centers=${rows.length} by=${staff.userId ?? "?"}`)
    return NextResponse.json({ ok: true, opened: rows.length })
  }

  const patch = normalizeRules({ ...(await getDistRules(id)), ...(body.rules as object ?? {}) })
  const saved = await saveDistRules(id, patch)
  if (!saved) return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  console.log(`[dist-rules] saved dist=${id} ${JSON.stringify(saved)} by=${staff.userId ?? "?"}`)
  return NextResponse.json({ ok: true, rules: saved })
}
