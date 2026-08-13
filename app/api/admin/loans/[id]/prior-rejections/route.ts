import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// דחיות קודמות של אותה משפחה.
//
// 🔴 הצורך: משפחה שנדחתה מגישה שוב, והמזכירות פותחת את הבקשה החדשה בלי
// לדעת שכבר נדחתה ובלי לדעת למה. היא מטפלת בה מאפס — ולעיתים מאשרת בקשה
// שנדחתה בכוונה מסיבה שעדיין תקפה.
//
// ⚠️ מוחזרות רק דחיות של בקשות *אחרות*: הבקשה הנוכחית מוחרגת, אחרת בקשה
// שנדחתה זה עתה הייתה מתריעה על עצמה בכל פתיחה.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePermission('loans', 'view'))) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { id } = await params

  const { data: current } = await db.from('loans')
    .select('beneficiary_id').eq('id', id).maybeSingle()
  const benId = (current as { beneficiary_id?: string } | null)?.beneficiary_id
  if (!benId) return NextResponse.json({ rejections: [] })

  // ⚠️ נשלף גם amount וגם approved_amount: דחייה יכולה לקרות אחרי שכבר
  // נקבע סכום מאושר, ואז הסכום המבוקש לבדו אינו מספר את הסיפור.
  const { data } = await db.from('loans')
    .select('id, amount, approved_amount, purpose, purpose_details, rejection_reason, rejected_at, created_at')
    .eq('beneficiary_id', benId)
    .eq('status', 'rejected')
    .neq('id', id)
    .order('rejected_at', { ascending: false, nullsFirst: false })
    .limit(5)

  return NextResponse.json({
    rejections: (data ?? []).map(r => {
      const row = r as {
        id: string; amount?: number | null; approved_amount?: number | null
        purpose?: string | null; purpose_details?: string | null
        rejection_reason?: string | null; rejected_at?: string | null; created_at?: string | null
      }
      return {
        id: row.id,
        amount: Number(row.amount ?? 0) || 0,
        purpose: row.purpose ?? null,
        purposeDetails: row.purpose_details ?? null,
        reason: row.rejection_reason ?? null,
        // ⚠️ נפילה-לאחור ל-created_at: rejected_at התווסף רק עכשיו, ולדחיות
        // ישנות הוא ריק. בלי הנפילה ההתראה הייתה מציגה "בתאריך —".
        at: row.rejected_at ?? row.created_at ?? null,
      }
    }),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
