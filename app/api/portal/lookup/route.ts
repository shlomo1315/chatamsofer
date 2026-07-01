import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { maskEmail } from '@/lib/phone'
import { resolveBeneficiaryByEnteredId } from '@/lib/portalBeneficiary'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  // הגבלת קצב — בולמת ניסיונות אנומרציה של תעודות זהות
  if (!rateLimit(`lookup:${clientIp(request)}`, 30, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסה שוב בעוד מספר דקות.' }, { status: 429 })
  }

  const params = request.nextUrl.searchParams
  const idParam = params.get('id')?.replace(/\D/g, '')
  const passportParam = params.get('passport')?.trim()

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // שלב הזיהוי מחזיר אך ורק האם המוטב רשום ומצב הסיסמה — ללא PII.
  // פרטי המוטב נמסרים רק לאחר אימות סיסמה (auth/login או auth/set-password).
  const gateSelect = 'id, email, portal_password_hash'

  if (idParam) {
    if (idParam.length < 5) return NextResponse.json({ error: 'מספר תעודת זהות לא תקין' }, { status: 400 })

    // 1. Check main beneficiaries table — לפי ת"ז הרשומה או ת"ז האישה (נשואים)
    const data = await resolveBeneficiaryByEnteredId<{ id: string; email: string | null; portal_password_hash: string | null }>(admin, idParam, gateSelect)
    if (data) {
      const hasPassword = !!data.portal_password_hash
      return NextResponse.json({
        found: true,
        needsPassword: hasPassword,
        needsSetup: !hasPassword,
        hasEmail: !!data.email,
        emailHint: maskEmail(data.email),
      })
    }

    // 2. Search inside children JSONB array
    const { data: rows, error: err2 } = await admin
      .from('beneficiaries')
      .select('id, full_name, family_name, children, lineage_node_id, lineage_chain')
      .not('children', 'is', null)
    if (err2) { console.error('[lookup] db error:', err2.message); return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 }) }

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
            // ייחוס ההורה — לשיוך אוטומטי של הילד בסדר הדורות
            parentLineage: {
              parentName,
              lineage_node_id: row.lineage_node_id ?? null,
              lineage_chain: Array.isArray(row.lineage_chain) ? row.lineage_chain : null,
            },
          })
        }
      }
    }

    return NextResponse.json({ found: false })
  }

  if (passportParam) {
    if (passportParam.length < 5) return NextResponse.json({ error: 'מספר דרכון לא תקין' }, { status: 400 })
    // חסימת תווי ג'וקר של ilike (% _) — מנע סריקה כמו passport=% שמחזירה מוטב שרירותי + סשן
    if (/[%_]/.test(passportParam)) return NextResponse.json({ error: 'מספר דרכון לא תקין' }, { status: 400 })
    const { data, error } = await admin.from('beneficiaries').select(gateSelect).eq('id_number', passportParam).maybeSingle()
    if (error) { console.error('[lookup] db error:', error.message); return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 }) }
    if (!data) return NextResponse.json({ found: false })
    const hasPassword = !!data.portal_password_hash
    return NextResponse.json({
      found: true,
      needsPassword: hasPassword,
      needsSetup: !hasPassword,
      hasEmail: !!data.email,
      emailHint: maskEmail(data.email),
    })
  }

  return NextResponse.json({ error: 'נא לספק מספר תעודת זהות או דרכון' }, { status: 400 })
}
