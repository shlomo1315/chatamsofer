import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { format } from 'date-fns'
import {
  getNedarimCreds,
  findClientByZeout,
  saveClientCard,
  addTlush,
  getClientCard,
} from '@/lib/nedarim'

export const dynamic = 'force-dynamic'

function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// מחזיר את המשתמש המחובר (איש מערכת) או null
async function getStaffUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

async function logActivity(
  admin: SupabaseClient,
  action: string,
  entityId: string,
  details: Record<string, unknown>,
  userId?: string | null,
) {
  try {
    await admin.from('activity_log').insert({
      user_id: userId ?? null,
      action,
      entity_type: 'maternity_aid',
      entity_id: entityId,
      details,
    })
  } catch { /* כשל ברישום לוג לא חוסם את הפעולה */ }
}

export async function POST(request: NextRequest) {
  const user = await getStaffUser()
  if (!user) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  const creds = getNedarimCreds()
  if (!creds) {
    return NextResponse.json({ error: 'חיבור נדרים פלוס לא מוגדר (NEDARIM_MOSAD_ID / NEDARIM_API_PASSWORD)' }, { status: 500 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'Supabase לא מוגדר' }, { status: 500 })

  let body: { aidId?: string; amount?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  if (!body.aidId) return NextResponse.json({ error: 'חסר מזהה תיק' }, { status: 400 })

  // שליפת התיק
  const { data: aid, error: aidErr } = await admin
    .from('maternity_aids')
    .select('id, beneficiary_id, status, card_balance, card_expires_at, weekly_amount, total_weeks')
    .eq('id', body.aidId)
    .maybeSingle()
  if (aidErr || !aid) return NextResponse.json({ error: 'התיק לא נמצא' }, { status: 404 })

  // הטענה מותרת רק לתיק מאושר (ולא לתיק שממתין לאישור)
  if (aid.status !== 'active') {
    return NextResponse.json({ error: 'ניתן להטעין כרטיס רק לתיק יולדת מאושר' }, { status: 400 })
  }

  // סכום: מהבקשה, או חישוב אוטומטי (שבועי × מספר שבועות)
  const amount = Number(
    body.amount ?? (Number(aid.weekly_amount) || 0) * (Number(aid.total_weeks) || 0)
  )
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: 'סכום הטענה לא תקין' }, { status: 400 })
  }

  // פרטי המשפחה
  const { data: b, error: bErr } = await admin
    .from('beneficiaries')
    .select('id, full_name, family_name, id_number, address, city, phone, phone2, email, nedarim_id')
    .eq('id', aid.beneficiary_id)
    .maybeSingle()
  if (bErr || !b) return NextResponse.json({ error: 'המשפחה לא נמצאה' }, { status: 404 })

  // 1) לוודא שהמשפחה קיימת בנדרים — לפי ת.ז. אם אין מזהה שמור; אם לא קיימת — להקים אותה
  let clientId = b.nedarim_id ? String(b.nedarim_id) : null
  let familyCreated = false
  try {
    if (!clientId && b.id_number) {
      clientId = await findClientByZeout(creds, String(b.id_number))
    }
    if (!clientId) {
      clientId = await saveClientCard(creds, b)
      familyCreated = true
    }
    if (clientId && clientId !== b.nedarim_id) {
      await admin.from('beneficiaries').update({ nedarim_id: clientId }).eq('id', b.id)
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
  if (!clientId) return NextResponse.json({ error: 'לא ניתן לאתר או להקים את המשפחה בנדרים' }, { status: 502 })

  // 2) הטענה
  await admin.from('maternity_aids')
    .update({ card_load_status: 'pending', card_load_amount: amount, card_load_error: null })
    .eq('id', aid.id)

  const expiration = aid.card_expires_at ? format(new Date(aid.card_expires_at), 'dd/MM/yyyy') : undefined

  let result: Awaited<ReturnType<typeof addTlush>>
  try {
    result = await addTlush(creds, clientId, amount, expiration, 'הטענת כרטיס יולדת ממערכת היכל החתם סופר')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await admin.from('maternity_aids').update({ card_load_status: 'failed', card_load_error: msg }).eq('id', aid.id)
    return NextResponse.json({ error: msg, familyCreated, clientId }, { status: 502 })
  }

  if (!result.ok) {
    await admin.from('maternity_aids').update({ card_load_status: 'failed', card_load_error: result.message }).eq('id', aid.id)
    await logActivity(admin, 'maternity_card_load_failed', aid.id, { amount, clientId, message: result.message }, user.id)
    return NextResponse.json({ ok: false, error: result.message || 'ההטענה נכשלה', familyCreated, clientId })
  }

  // רענון יתרה מנדרים (נופל בשקט לאומדן אם נכשל)
  let newBalance = (Number(aid.card_balance) || 0) + amount
  try {
    const card = await getClientCard(creds, clientId)
    if (card?.totalFreeAmount != null) newBalance = card.totalFreeAmount
  } catch { /* שמירה על האומדן */ }

  await admin.from('maternity_aids').update({
    card_load_status: 'loaded',
    card_tlush_id: result.tlushId,
    card_load_amount: amount,
    card_loaded_at: new Date().toISOString(),
    card_balance: newBalance,
    card_load_error: null,
  }).eq('id', aid.id)

  await logActivity(admin, 'maternity_card_loaded', aid.id, { amount, clientId, tlushId: result.tlushId, familyCreated }, user.id)

  return NextResponse.json({ ok: true, familyCreated, clientId, tlushId: result.tlushId, balance: newBalance })
}
