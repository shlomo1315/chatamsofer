import { NextResponse, type NextRequest } from 'next/server'
import { getNedarimCreds, prikatTlush } from '@/lib/nedarim'
import { createServiceOrAnonClient as getAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// אימות הקריאה מול CRON_SECRET — דרך Authorization: Bearer <secret> או ?secret=<secret>
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if (request.headers.get('authorization') === `Bearer ${secret}`) return true
  return new URL(request.url).searchParams.get('secret') === secret
}

async function run(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 })

  const creds = getNedarimCreds()
  if (!creds) return NextResponse.json({ error: 'חיבור נדרים פלוס לא מוגדר' }, { status: 500 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  const today = new Date().toISOString().slice(0, 10) // yyyy-mm-dd

  // תיקים שהוטענו, יש להם מזהה טעינה, ועברו 6 שבועות מהלידה
  const { data: aids, error } = await admin
    .from('maternity_aids')
    .select('id, card_tlush_id, six_weeks_end')
    .eq('card_load_status', 'loaded')
    .not('card_tlush_id', 'is', null)
    .lte('six_weeks_end', today)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: { id: string; ok: boolean; message?: string }[] = []
  for (const aid of aids ?? []) {
    try {
      const r = await prikatTlush(creds, String(aid.card_tlush_id))
      if (r.ok) {
        await admin.from('maternity_aids').update({
          card_load_status: 'unloaded',
          card_unloaded_at: new Date().toISOString(),
          card_balance: 0,
          card_load_error: null,
        }).eq('id', aid.id)
        await admin.from('activity_log').insert({
          action: 'maternity_card_unloaded',
          entity_type: 'maternity_aid',
          entity_id: aid.id,
          details: { tlushId: aid.card_tlush_id, reason: 'פריקה אוטומטית בתום 6 שבועות', six_weeks_end: aid.six_weeks_end },
        })
        results.push({ id: aid.id, ok: true })
      } else {
        await admin.from('maternity_aids').update({ card_load_error: r.message }).eq('id', aid.id)
        results.push({ id: aid.id, ok: false, message: r.message })
      }
    } catch (e) {
      results.push({ id: aid.id, ok: false, message: e instanceof Error ? e.message : String(e) })
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results })
}

export async function GET(request: NextRequest) { return run(request) }
export async function POST(request: NextRequest) { return run(request) }
