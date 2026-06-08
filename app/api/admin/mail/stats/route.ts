import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  const range = request.nextUrl.searchParams.get('range') ?? '7' // days
  const days = Math.min(parseInt(range) || 7, 90)
  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  const client = getClient()
  if (!client) return NextResponse.json({ error: 'server error' }, { status: 500 })

  // Fetch all events in range
  const { data: events, error } = await client
    .from('mail_events')
    .select('id,message_id,event_type,user_id,label_ids,from_email,created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = events ?? []

  // Totals
  const total   = rows.length
  const read    = rows.filter(r => r.event_type === 'read').length
  const handled = rows.filter(r => r.event_type === 'handled').length
  const replied = rows.filter(r => ['replied','auto_replied'].includes(r.event_type)).length

  // Unique messages read but not handled
  const readIds    = new Set(rows.filter(r => r.event_type === 'read').map(r => r.message_id))
  const handledIds = new Set(rows.filter(r => r.event_type === 'handled').map(r => r.message_id))
  const unhandled  = [...readIds].filter(id => !handledIds.has(id)).length

  // Per-day breakdown (for chart)
  const byDay: Record<string, { read: number; handled: number; replied: number }> = {}
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86_400_000)
    const key = d.toISOString().slice(0, 10)
    byDay[key] = { read: 0, handled: 0, replied: 0 }
  }
  for (const r of rows) {
    const key = r.created_at.slice(0, 10)
    if (!byDay[key]) continue
    if (r.event_type === 'read') byDay[key].read++
    else if (r.event_type === 'handled') byDay[key].handled++
    else if (['replied','auto_replied'].includes(r.event_type)) byDay[key].replied++
  }
  const dailyChart = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }))

  // Per-label breakdown
  const labelMap: Record<string, { read: number; handled: number }> = {}
  for (const r of rows) {
    for (const lid of (r.label_ids ?? [])) {
      if (!labelMap[lid]) labelMap[lid] = { read: 0, handled: 0 }
      if (r.event_type === 'read') labelMap[lid].read++
      if (r.event_type === 'handled') labelMap[lid].handled++
    }
  }

  // Per-user breakdown
  const userMap: Record<string, { read: number; handled: number }> = {}
  for (const r of rows) {
    const uid = r.user_id ?? 'unknown'
    if (!userMap[uid]) userMap[uid] = { read: 0, handled: 0 }
    if (r.event_type === 'read') userMap[uid].read++
    if (r.event_type === 'handled') userMap[uid].handled++
  }

  // Fetch user names for user map
  const userIds = Object.keys(userMap).filter(id => id !== 'unknown')
  let userNames: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await client
      .from('profiles')
      .select('id,full_name')
      .in('id', userIds)
    for (const p of profiles ?? []) userNames[p.id] = p.full_name
  }

  const byUser = Object.entries(userMap).map(([uid, v]) => ({
    user_id: uid,
    name: userNames[uid] ?? (uid === 'unknown' ? 'לא ידוע' : uid),
    ...v,
  })).sort((a, b) => (b.read + b.handled) - (a.read + a.handled))

  return NextResponse.json({
    range: days,
    totals: { total, read, handled, replied, unhandled },
    dailyChart,
    byLabel: labelMap,
    byUser,
  })
}
