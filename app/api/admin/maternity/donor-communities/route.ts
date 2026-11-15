import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { loadApprovedRows, loadCommunityMap } from '@/lib/donorReport'
import { mergeInto, normalizeCommunity, suggestGroups, unifyIdentical, UNKNOWN_COMMUNITY } from '@/lib/communityMerge'

export const dynamic = 'force-dynamic'

// ניהול איחוד קהילות בדוח הנדיב. המיפוי נשמר ב-donor_community_merges ולא משנה נתוני יולדות.

export async function GET() {
  const staff = await requirePermission('maternity', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  try {
    const raw = await loadApprovedRows(db, { raw: true })
    const counts = new Map<string, number>()
    for (const r of raw) counts.set(r.community, (counts.get(r.community) ?? 0) + 1)
    const unified = unifyIdentical([...counts.entries()].map(([name, count]) => ({ name, count })))
      .filter(i => i.name !== UNKNOWN_COMMUNITY)
    const map = await loadCommunityMap(db)

    // אחרי המיפוי: שם מאוחד → השמות שהתאחדו אליו
    const byTarget = new Map<string, { name: string; count: number }[]>()
    for (const u of unified) {
      const target = map[normalizeCommunity(u.name)] ?? u.name
      byTarget.set(target, [...(byTarget.get(target) ?? []), u])
    }
    const effective = [...byTarget.entries()]
      .map(([name, parts]) => ({ name, count: parts.reduce((s, p) => s + p.count, 0) }))
      .sort((a, b) => b.count - a.count)
    const merged = [...byTarget.entries()]
      .filter(([name, parts]) => parts.some(p => p.name !== name))
      .map(([name, parts]) => ({ name, parts: parts.sort((a, b) => b.count - a.count), total: parts.reduce((s, p) => s + p.count, 0) }))
    return NextResponse.json({ communities: effective, suggestions: suggestGroups(effective), merged })
  } catch (e) {
    console.error('[donor-communities]', e)
    return NextResponse.json({ error: 'טעינת הקהילות נכשלה' }, { status: 500 })
  }
}

// POST { names: string[], target: string } — מיזוג.
export async function POST(request: NextRequest) {
  const staff = await requirePermission('maternity', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const body = await request.json().catch(() => ({})) as { names?: unknown; target?: unknown }
  const names = Array.isArray(body.names) ? body.names.map(n => String(n).trim()).filter(Boolean) : []
  const target = typeof body.target === 'string' ? body.target.trim() : ''
  if (names.length < 2) return NextResponse.json({ error: 'יש לבחור לפחות שתי קהילות' }, { status: 400 })
  if (!target || target.length > 80) return NextResponse.json({ error: 'יש לבחור שם יעד (עד 80 תווים)' }, { status: 400 })
  if (target === UNKNOWN_COMMUNITY || names.includes(UNKNOWN_COMMUNITY)) return NextResponse.json({ error: 'אי אפשר למזג את "לא צוין"' }, { status: 400 })

  const old = await loadCommunityMap(db)
  const next = mergeInto(old, names, target)
  const changed = Object.entries(next).filter(([k, v]) => old[k] !== v)
  const { error } = await db.from('donor_community_merges').upsert(
    changed.map(([original_key, canonical]) => ({ original_key, canonical, created_by: staff.userId })),
    { onConflict: 'original_key' },
  )
  if (error) { console.error('[donor-communities]', error); return NextResponse.json({ error: 'המיזוג נכשל' }, { status: 500 }) }
  return NextResponse.json({ ok: true })
}

// DELETE { target } — ביטול מיזוג: מוחק את כל המיפויים לשם המאוחד.
export async function DELETE(request: NextRequest) {
  const staff = await requirePermission('maternity', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const body = await request.json().catch(() => ({})) as { target?: unknown }
  const target = typeof body.target === 'string' ? body.target.trim() : ''
  if (!target) return NextResponse.json({ error: 'חסר שם' }, { status: 400 })
  const { error } = await db.from('donor_community_merges').delete().eq('canonical', target)
  if (error) { console.error('[donor-communities]', error); return NextResponse.json({ error: 'הביטול נכשל' }, { status: 500 }) }
  return NextResponse.json({ ok: true })
}
