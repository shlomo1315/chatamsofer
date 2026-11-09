import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/apiAuth'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { idNumberVariants, isDeleteConfirmed } from '@/lib/portalDeletion'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

// מחיקה עצמית מהאיגוד ע"י הנרשם. 🔒 הזהות נקבעת רק מהסשן החתום בשרת (לא מהגוף),
// והאישור (סימון + הקלדת "מחיקה") נבדק גם כאן, לא רק בדפדפן.
// ת"ז הבעל והאישה נרשמות ב-removed_members לפני המחיקה (נכשל-סגור) כדי שלא יוכלו להירשם שוב.
export async function POST(request: NextRequest) {
  const id = getPortalBeneficiaryId(request)
  if (!id) return NextResponse.json({ error: 'נדרש אימות מחדש — נא לבצע כניסה מחדש' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  if (!isDeleteConfirmed(body)) return NextResponse.json({ error: 'יש לאשר ולהקליד "מחיקה"' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: ben } = await admin.from('beneficiaries')
    .select('id_number, spouse_id_number, email, family_name, lineage_node_id').eq('id', id).maybeSingle()
  if (!ben) return NextResponse.json({ error: 'הרשומה לא נמצאה' }, { status: 404 })
  const b = ben as { id_number?: string | null; spouse_id_number?: string | null; email?: string | null; family_name?: string | null; lineage_node_id?: string | null }

  const ids = [...idNumberVariants(b.id_number), ...idNumberVariants(b.spouse_id_number)]
  if (ids.length > 0) {
    const { error: blockErr } = await admin.from('removed_members')
      .upsert(ids.map(id_number => ({ id_number })), { onConflict: 'id_number' })
    if (blockErr) {
      console.error('[portal-delete-account] removed_members:', blockErr.message)
      return NextResponse.json({ error: 'לא הצלחנו להשלים את המחיקה. נסו שוב או פנו למזכירות.' }, { status: 500 })
    }
  }

  for (const table of ['documents', 'maternity_aids', 'loans', 'financial_aid_requests', 'widow_support_payments', 'widow_requests']) {
    const { error } = await admin.from(table).delete().eq('beneficiary_id', id)
    if (error && error.code !== '42P01') console.error(`[portal-delete-account] ${table}:`, error.message)
  }

  const { error } = await admin.from('beneficiaries').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'לא הצלחנו להשלים את המחיקה. נסו שוב או פנו למזכירות.' }, { status: 500 })

  if (b.lineage_node_id) {
    const { count } = await admin.from('lineage_nodes').select('id', { count: 'exact', head: true }).eq('parent_id', b.lineage_node_id)
    if ((count ?? 0) === 0) await admin.from('lineage_nodes').delete().eq('id', b.lineage_node_id)
  }

  if (b.email) {
    await sendEmail({
      to: b.email,
      subject: 'הפרטים נמחקו מהאיגוד',
      html: `<div dir="rtl" style="font-family:Heebo,Arial,sans-serif">שלום,<br/>לבקשתכם, פרטי משפחת ${b.family_name ?? ''} נמחקו מהמאגר. לא ניתן להירשם מחדש.</div>`,
    }).catch(() => undefined)
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set('pb_session', '', { httpOnly: true, sameSite: 'lax', maxAge: 0, path: '/' })
  return res
}
