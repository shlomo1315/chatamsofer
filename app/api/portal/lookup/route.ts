import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const idParam = params.get('id')?.replace(/\D/g, '')
  const passportParam = params.get('passport')?.trim()

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const select = 'id, full_name, family_name, eligibility_status, is_active, phone, city, marital_status, required_docs, children, created_at'

  if (idParam) {
    if (idParam.length < 5) return NextResponse.json({ error: 'מספר תעודת זהות לא תקין' }, { status: 400 })

    // 1. Check main beneficiaries table
    const { data, error } = await admin.from('beneficiaries').select(select).eq('id_number', idParam).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (data) {
      // מסמכי זהות שכבר הועלו — כדי להציגם בעת כניסה חוזרת במקום לבקש העלאה מחדש
      const { data: docs } = await admin
        .from('documents')
        .select('doc_type, file_url, file_name, uploaded_at')
        .eq('beneficiary_id', data.id)
        .in('doc_type', ['id_husband', 'id_wife'])
        .order('uploaded_at', { ascending: false })
      const documents: Record<string, { url: string; name: string }> = {}
      for (const d of docs ?? []) {
        // שומרים רק את העדכני ביותר לכל סוג (כבר ממוין יורד)
        if (!documents[d.doc_type] && d.file_url) {
          documents[d.doc_type] = { url: d.file_url, name: d.file_name ?? 'מסמך' }
        }
      }
      return NextResponse.json({ found: true, beneficiary: data, documents })
    }

    // 2. Search inside children JSONB array
    const { data: rows, error: err2 } = await admin
      .from('beneficiaries')
      .select('id, full_name, family_name, children')
      .not('children', 'is', null)
    if (err2) return NextResponse.json({ error: err2.message }, { status: 500 })

    if (rows) {
      for (const row of rows) {
        const kids: Record<string, string>[] = Array.isArray(row.children) ? row.children : []
        const match = kids.find((k) => (k.id_number ?? '').replace(/\D/g, '') === idParam)
        if (match) {
          const parentName = [row.family_name, row.full_name].filter(Boolean).join(' ')
          return NextResponse.json({
            found: false,
            foundAsChild: true,
            parentName,
            childData: {
              name: match.name ?? '',
              id_number: idParam,
              birth_date: match.birth_date ?? '',
              gender: match.gender ?? '',
              marital_status: match.marital_status ?? '',
            },
          })
        }
      }
    }

    return NextResponse.json({ found: false })
  }

  if (passportParam) {
    if (passportParam.length < 5) return NextResponse.json({ error: 'מספר דרכון לא תקין' }, { status: 400 })
    const { data, error } = await admin.from('beneficiaries').select(select).ilike('passport_number', passportParam).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ found: false })
    return NextResponse.json({ found: true, beneficiary: data })
  }

  return NextResponse.json({ error: 'נא לספק מספר תעודת זהות או דרכון' }, { status: 400 })
}
