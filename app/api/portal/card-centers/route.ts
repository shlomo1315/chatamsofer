import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// רשימת מוקדי חלוקת הכרטיסים לפורטל (טבלת card_centers היא staff-only ב-RLS,
// לכן נחשפת לפורטל דרך service-role — רק מוקדים פעילים, שם ועיר בלבד).
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ centers: [] })
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data } = await admin
    .from('card_centers')
    .select('id, name, city')
    .eq('is_active', true)
    .order('name')
  const centers = (data ?? []).map((c) => ({ id: c.id, name: c.name, city: c.city ?? null }))
  return NextResponse.json({ centers }, { headers: { 'Cache-Control': 'no-store' } })
}
