import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// צפייה מהירה בסדר הדורות של משפחה — לבדיקה מהירה מתוך מסכי העץ.
//
// ⚠️ מחזיר את השרשרת השמורה (lineage_chain) ולא מחשב אותה מחדש: זו בדיוק
// השרשרת שהמסכים האחרים מציגים, וחישוב נפרד היה יוצר תשובה שונה מהמסך.
//
// ⚠️ שדות מזהים מוחזרים במלואם — זהו נתיב ניהול מאומת (הרשאת lineage),
// והמנהל צריך את הת"ז והטלפון כדי להכריע אם זו המשפחה הנכונה.
// ─────────────────────────────────────────────────────────────────────────────

function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  if (!(await requirePermission('lineage', 'view'))) return forbidden()
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const id = (request.nextUrl.searchParams.get('id') ?? '').trim()
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const { data, error } = await admin.from('beneficiaries')
    .select('id, full_name, family_name, id_number, phone, city, eligibility_status, lineage_chain, lineage_node_id')
    .eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'המשפחה לא נמצאה' }, { status: 404 })

  const b = data as {
    id: string; full_name: string | null; family_name: string | null
    id_number: string | null; phone: string | null; city: string | null
    eligibility_status: string | null; lineage_chain: unknown; lineage_node_id: string | null
  }

  let nodeName: string | null = null
  if (b.lineage_node_id) {
    const { data: n } = await admin.from('lineage_nodes').select('name').eq('id', b.lineage_node_id).maybeSingle()
    nodeName = (n as { name?: string } | null)?.name ?? null
  }

  return NextResponse.json({
    detail: {
      id: b.id,
      name: [b.family_name, b.full_name].filter(Boolean).join(' '),
      idNumber: b.id_number,
      phone: b.phone,
      city: b.city,
      status: b.eligibility_status,
      chain: Array.isArray(b.lineage_chain) ? b.lineage_chain : [],
      nodeName,
    },
  })
}
