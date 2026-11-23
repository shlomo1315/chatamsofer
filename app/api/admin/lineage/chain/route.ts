import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { sanitizeEditedChain } from '@/lib/lineageChainEdit'
import { saveChainByStaff } from '@/lib/lineageChainSave'
import { lineageSaveDeps } from '@/lib/lineageChainSaveDeps'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// עריכה מלאה של סדר הדורות מהכרטסת (מוטב / יולדת) — מזכירות ומנהל.
//
// POST { beneficiaryId, chain: [{generation, name, relation}] }
// 🔴 השרשרת מאומתת ומוחלת דרך העץ (lib/lineageChainSave) — לא נדרסת בסנכרון
// ולא יוצרת כפילויות.
// ─────────────────────────────────────────────────────────────────────────────

function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  const treeEditor = await requirePermission('lineage', 'edit')
  const staff = treeEditor
    ?? await requirePermission('beneficiaries', 'edit')
    ?? await requirePermission('maternity', 'edit')
  if (!staff) return forbidden()
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  let body: { beneficiaryId?: unknown; chain?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const beneficiaryId = typeof body.beneficiaryId === 'string' ? body.beneficiaryId : ''
  if (!/^[0-9a-f-]{36}$/i.test(beneficiaryId)) return NextResponse.json({ error: 'כרטסת לא תקינה' }, { status: 400 })

  const clean = sanitizeEditedChain(body.chain)
  if (!clean.ok) return NextResponse.json({ error: clean.error }, { status: 400 })

  const res = await saveChainByStaff(admin, lineageSaveDeps, beneficiaryId, clean.chain, staff.userId, { canEditTree: !!treeEditor })
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 409 })
  return NextResponse.json(res)
}
