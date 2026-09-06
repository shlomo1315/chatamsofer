import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { normalizeName as norm } from '@/lib/lineageChainDiff'

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
  let nodeStatus: string | null = null
  let nodeSiblingDup = 0
  if (b.lineage_node_id) {
    const { data: n } = await admin.from('lineage_nodes')
      .select('name, status, parent_id').eq('id', b.lineage_node_id).maybeSingle()
    const nn = n as { name?: string; status?: string; parent_id?: string | null } | null
    nodeName = nn?.name ?? null
    nodeStatus = nn?.status ?? null
    // ⚠️ כפילות בעץ: אח בעל אותו שם תחת אותו אב — כמעט תמיד אותו אדם פעמיים.
    if (nn?.parent_id && nn.name) {
      const { data: sibs } = await admin.from('lineage_nodes')
        .select('id, name').eq('parent_id', nn.parent_id)
      const key = norm(nn.name)
      nodeSiblingDup = (sibs ?? []).filter(s =>
        norm((s as { name: string }).name) === key && (s as { id: string }).id !== b.lineage_node_id).length
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 האם קיימת כרטסת נוספת לאותו אדם?
  //
  // זו השאלה שמכריעה אם למחוק: רישום כפול נמחק בלב שקט, ואילו כרטסת יחידה
  // היא כל מה שיש על המשפחה. הבדיקה בשלוש שכבות — ת"ז (ודאי), טלפון (חזק),
  // ושם מלא (חלש, ולכן מסומן בנפרד: "שטרן משה" חוזר בעץ עשרות פעמים).
  // ─────────────────────────────────────────────────────────────────────────
  const digits = (s?: string | null) => String(s ?? '').replace(/\D/g, '')
  const myId = digits(b.id_number)
  const myPhone = digits(b.phone)
  const myName = norm([b.family_name, b.full_name].filter(Boolean).join(' '))

  const { rows: all } = await fetchAllRows<{
    id: string; full_name: string | null; family_name: string | null
    id_number: string | null; phone: string | null; city: string | null
    is_special: boolean | null; eligibility_status: string | null; created_at: string
  }>((from, to) =>
    admin.from('beneficiaries')
      .select('id, full_name, family_name, id_number, phone, city, is_special, eligibility_status, created_at')
      .range(from, to),
  )

  const dups = all
    .filter(o => o.id !== b.id)
    .map(o => {
      const oid = digits(o.id_number)
      const oph = digits(o.phone)
      const onm = norm([o.family_name, o.full_name].filter(Boolean).join(' '))
      let match: 'id' | 'phone' | 'name' | null = null
      if (myId && oid && myId === oid) match = 'id'
      else if (myPhone.length >= 9 && oph === myPhone) match = 'phone'
      else if (myName && onm === myName) match = 'name'
      if (!match) return null
      return {
        id: o.id,
        name: [o.family_name, o.full_name].filter(Boolean).join(' '),
        idNumber: o.id_number, phone: o.phone, city: o.city,
        isSpecial: o.is_special === true,
        status: o.eligibility_status,
        createdAt: o.created_at,
        match,
      }
    })
    .filter(Boolean)
    // ת"ז קודם — היא ההתאמה הוודאית.
    .sort((a, b2) => {
      const rank = { id: 0, phone: 1, name: 2 } as const
      return rank[a!.match] - rank[b2!.match]
    })

  return NextResponse.json({
    detail: {
      id: b.id,
      name: [b.family_name, b.full_name].filter(Boolean).join(' '),
      idNumber: b.id_number,
      phone: b.phone,
      city: b.city,
      status: b.eligibility_status,
      chain: Array.isArray(b.lineage_chain) ? b.lineage_chain : [],
      nodeName, nodeStatus, nodeSiblingDup,
      duplicates: dups.slice(0, 10),
    },
  })
}
