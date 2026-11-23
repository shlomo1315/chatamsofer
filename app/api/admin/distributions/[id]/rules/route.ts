import { NextResponse, type NextRequest } from 'next/server'
import { unauthorized, getServiceClient, requirePermission } from '@/lib/apiAuth'
import { getDistRules, saveDistRules, normalizeRules, phaseGates, PHASES, type DistPhase } from '@/lib/holidayDistRules'
import { pickupPhasePatch } from '@/lib/centerPickupPhase'

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
  const [{ count: openCount }, { count: activeCount }, { count: deepCount }, distRes, openRowsRes, recCountRes, noCenterRes, approvedRes] = await Promise.all([
    db.from('holiday_center_openings').select('center_id', { count: 'exact', head: true }).eq('distribution_id', id),
    db.from('holiday_centers').select('id', { count: 'exact', head: true }).eq('is_active', true),
    db.from('beneficiaries').select('id', { count: 'exact', head: true }).eq('eligibility_status', 'deep_review'),
    db.from('distributions').select('name, year, amount_per_family, registration_open, centers_open, pickup_open, status').eq('id', id).maybeSingle(),
    db.from('holiday_center_openings').select('center:holiday_centers(id, city, name, address, hours, is_active)').eq('distribution_id', id),
    db.from('distribution_recipients').select('id', { count: 'exact', head: true }).eq('distribution_id', id),
    db.from('distribution_recipients').select('id', { count: 'exact', head: true }).eq('distribution_id', id).is('center_id', null),
    db.from('distribution_recipients').select('id', { count: 'exact', head: true }).eq('distribution_id', id).eq('approval_status', 'approved'),
  ])
  // ⚠️ join של Supabase = מערך או אובייקט — מנורמל לאובייקט אחד.
  type C = { id: string; city: string | null; name: string | null; address: string | null; hours: string | null; is_active: boolean | null }
  const openCenters = ((openRowsRes.data ?? []) as { center: C | C[] | null }[])
    .map(r => (Array.isArray(r.center) ? r.center[0] : r.center))
    .filter((c): c is C => !!c && c.is_active !== false)
  const missing = openCenters.filter(c => !(c.address ?? '').trim() || !(c.hours ?? '').trim())
  return NextResponse.json({
    rules,
    defaultPhoneNumber: (process.env.TECHNOLINE_MAIN_NUMBER || process.env.HOLIDAY_PHONE_NUMBER || '').trim(),
    centers: { open: openCount ?? 0, active: activeCount ?? 0 },
    deepReviewFamilies: deepCount ?? 0,
    distribution: distRes.data ?? null,
    counts: { registered: recCountRes.count ?? 0, noCenter: noCenterRes.count ?? 0, approved: approvedRes.count ?? 0 },
    centersMissing: missing.map(c => ({ id: c.id, label: [c.city, c.name].filter(Boolean).join(' — '), address: !!(c.address ?? '').trim(), hours: !!(c.hours ?? '').trim() })),
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

  // 🔴 מעבר שלב — שומר את השלב ומיישר את שלושת השערים במסד, כך שכל ערוץ
  // (אתר, נדרים, קו) רואה אותו מצב. מעבר ל"החלוקה פתוחה" מתחיל חלוקה בכל
  // המוקדים שעוד לא התחילו (מוקד שהסתיים נשאר סגור).
  if (body.action === 'set_phase') {
    const phase = body.phase as DistPhase
    if (!PHASES.includes(phase)) return NextResponse.json({ error: 'שלב לא תקין' }, { status: 400 })
    const { error: gErr } = await db.from('distributions').update(phaseGates(phase)).eq('id', id)
    if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })
    if (phase === 'distribution') {
      const { error: pErr } = await db.from('holiday_center_openings')
        .update(pickupPhasePatch('active'))
        .eq('distribution_id', id).is('pickup_open_at', null).is('pickup_ended_at', null)
      if (pErr) console.error('[dist-rules] start pickup failed:', pErr.message)
    }
    const saved = await saveDistRules(id, { phase, phoneOnly: true })
    if (!saved) return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
    console.log(`[dist-rules] phase dist=${id} -> ${phase} by=${staff.userId ?? "?"}`)
    return NextResponse.json({ ok: true, rules: saved })
  }

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
