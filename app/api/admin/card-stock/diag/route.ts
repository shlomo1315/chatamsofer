import { NextResponse } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { getStockBalance } from '@/lib/cardStock'
import { getNedarimCreds } from '@/lib/nedarim'

// ─────────────────────────────────────────────────────────────────────────────
// אבחון מלאי הכרטיסים — למה יולדת לא קיבלה כרטיס/שובר.
// מציג את המצב האמיתי ב-DB: מי בתור, באיזה סטטוס, והאם נדרים מוגדר.
// קריאה בלבד — לא משנה דבר.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

export async function GET() {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const balance = await getStockBalance(admin)
  const creds = await getNedarimCreds()

  // כל הלידות המאושרות שטרם נטענו — לא רק אלו שמסומנות awaiting_stock,
  // כדי לגלות יולדות שנתקעו בסטטוס אחר ולכן מעולם לא נכנסו לתור.
  const { data: aids, error } = await admin
    .from('maternity_aids')
    .select('id, status, card_status, card_voucher_status, card_load_status, card_tlush_id, card_center_id, updated_at, beneficiary:beneficiaries(family_name, full_name, spouse_name, email)')
    .eq('status', 'active')
    .order('updated_at', { ascending: true })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (aids ?? []).map(a => {
    const benRaw = (a as Record<string, unknown>).beneficiary
    const ben = (Array.isArray(benRaw) ? benRaw[0] : benRaw) as Record<string, string | null> | null
    const inQueue = a.card_status === 'awaiting_stock' || a.card_voucher_status === 'awaiting_stock'
    const loaded = a.card_load_status === 'loaded' || !!a.card_tlush_id
    return {
      id: a.id,
      name: [ben?.family_name, ben?.spouse_name || ben?.full_name].filter(Boolean).join(' ') || '—',
      email: ben?.email || '(אין מייל!)',
      card_status: a.card_status,
      card_voucher_status: a.card_voucher_status,
      card_load_status: a.card_load_status,
      hasTlush: !!a.card_tlush_id,
      inQueue,
      loaded,
      // ההסבר המעשי — למה היולדת לא מקבלת כרטיס
      diagnosis: loaded ? 'נטען — תקין'
        : inQueue ? (balance > 0 ? 'בתור ויש מלאי — אמור להיטען בהוספה הבאה' : 'בתור, אין מלאי')
        : 'לא בתור ולא נטען — לא ייטען לעולם ללא התערבות',
    }
  })

  return NextResponse.json({
    balance,
    nedarimConfigured: !!creds,
    inQueueCount: rows.filter(r => r.inQueue).length,
    stuckCount: rows.filter(r => !r.inQueue && !r.loaded).length,
    rows,
  })
}
