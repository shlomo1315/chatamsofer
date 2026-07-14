import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient } from '@/lib/apiAuth'
import { signedDocUrl } from '@/lib/docUrl'

// סיכום המשפחה שמאחורי בקשת ההלוואה — כדי שההחלטה תתקבל עם כל התמונה,
// בלי לצאת מהמסך: פרטים אישיים, ילדים, סדר הדורות, צילומי ת"ז,
// והיסטוריית ההלוואות הקודמות של אותה משפחה.

export const dynamic = 'force-dynamic'

interface Child {
  name?: string | null
  birth_date?: string | null
  marital_status?: string | null
  is_married?: boolean | null
}

/** גיל מתאריך לידה. null אם אין תאריך. */
function ageOf(d?: string | null): number | null {
  if (!d) return null
  const b = new Date(d)
  if (isNaN(b.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age >= 0 && age < 130 ? age : null
}

/** האם הילד נשוי — לפי כל אחד מהשדות האפשריים בטופס. */
function isMarried(c: Child): boolean {
  if (c.is_married === true) return true
  const s = (c.marital_status ?? '').trim()
  return s === 'נשוי' || s === 'נשואה' || s === 'נשואים'
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('loans', 'view')
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: loan } = await db
    .from('loans')
    .select('id, beneficiary_id')
    .eq('id', id)
    .maybeSingle()

  if (!loan?.beneficiary_id) {
    return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })
  }

  const benId = String(loan.beneficiary_id)

  const [benRes, loansRes, docsRes] = await Promise.all([
    db.from('beneficiaries')
      .select('id, family_name, full_name, spouse_name, id_number, spouse_id_number, birth_date, spouse_birth_date, phone, email, city, address, marital_status, children, children_count, lineage_node_id, lineage_chain, eligibility_status')
      .eq('id', benId)
      .maybeSingle(),

    // כל ההלוואות של המשפחה — כולל הנוכחית, כדי שיראו את התמונה המלאה
    db.from('loans')
      .select('id, amount, approved_amount, installments, purpose, status, disbursed_at, created_at')
      .eq('beneficiary_id', benId)
      .order('created_at', { ascending: false }),

    // צילומי ת"ז
    db.from('documents')
      .select('id, doc_type, file_name, file_url')
      .eq('beneficiary_id', benId)
      .in('doc_type', ['id_husband', 'id_wife']),
  ])

  const b = benRes.data
  if (!b) return NextResponse.json({ error: 'המשפחה לא נמצאה' }, { status: 404 })

  const children = (Array.isArray(b.children) ? b.children : []) as Child[]
  const married = children.filter(isMarried).length

  // סדר הדורות — שרשרת היוחסין, אם נשמרה
  let lineage: string[] = []
  if (Array.isArray(b.lineage_chain)) {
    lineage = (b.lineage_chain as { name?: string }[])
      .map(n => String(n?.name ?? '').trim())
      .filter(Boolean)
  }
  if (!lineage.length && b.lineage_node_id) {
    const { data: node } = await db.from('lineage_nodes')
      .select('name').eq('id', b.lineage_node_id).maybeSingle()
    if (node?.name) lineage = [String(node.name)]
  }

  // צילומי ת"ז — קישורים חתומים לצפייה
  const idDocs = await Promise.all(
    (docsRes.data ?? []).map(async d => ({
      type: d.doc_type === 'id_husband' ? 'ת"ז הבעל' : 'ת"ז האשה',
      name: d.file_name,
      url: await signedDocUrl(db, String(d.file_url)).catch(() => null),
    })),
  )

  // היסטוריית ההלוואות — בלי הבקשה הנוכחית
  const all = loansRes.data ?? []
  const history = all.filter(l => String(l.id) !== id)
  const approved = history.filter(l => ['approved', 'active', 'completed'].includes(String(l.status)))
  const totalApproved = approved.reduce(
    (sum, l) => sum + Number(l.approved_amount ?? l.amount ?? 0), 0,
  )

  return NextResponse.json({
    beneficiary: {
      id: b.id,
      familyName: b.family_name,
      husbandName: b.full_name,
      husbandAge: ageOf(b.birth_date),
      husbandId: b.id_number,
      wifeName: b.spouse_name,
      wifeAge: ageOf(b.spouse_birth_date),
      wifeId: b.spouse_id_number,
      phone: b.phone,
      email: b.email,
      city: b.city,
      address: b.address,
      maritalStatus: b.marital_status,
      eligibilityStatus: b.eligibility_status,
    },
    children: {
      // children_count הוא מה שהמשתמש הצהיר; המערך הוא מה שמילא בפועל.
      // מציגים את הגדול — כדי לא להציג פחות ממה שיש.
      total: Math.max(children.length, Number(b.children_count ?? 0)),
      married,
      atHome: Math.max(children.length - married, 0),
    },
    lineage,
    idDocs: idDocs.filter(d => d.url),
    loanHistory: {
      count: history.length,
      approvedCount: approved.length,
      totalApproved,
      loans: history.slice(0, 10),
    },
  })
}
