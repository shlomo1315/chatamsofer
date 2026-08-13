import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// ביקורת מלאי כרטיסים — לאן הלכו הכרטיסים.
//
// 🔴 השאלה שהכלי עונה עליה: "המלאי ירד ב-N — האם כל ניכוי מוצדק?"
//
// ⚠️ הסכנה שהוא נועד לחשוף: ניכוי כפול לאותו תיק. תיק שנוכה פעמיים אומר
// שכרטיס אחד נעלם בלי שאיש קיבל אותו — וזה בדיוק מה שאי אפשר לראות
// במאזן מצטבר, שמראה רק מספר אחד.
// ─────────────────────────────────────────────────────────────────────────────

interface Ledger {
  id: string
  delta: number
  reason: string
  aid_id: string | null
  note: string | null
  created_at: string
}

export async function GET() {
  if (!(await requirePermission('maternity', 'view'))) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { rows } = await fetchAllRows<Ledger>((from, to) => db
    .from('card_stock_ledger')
    .select('id, delta, reason, aid_id, note, created_at')
    .order('created_at', { ascending: false })
    .range(from, to))

  const balance = rows.reduce((s, r) => s + Number(r.delta ?? 0), 0)

  // ── ניכויים כפולים לאותו תיק ──
  // ⚠️ נספרים רק ניכויים (delta<0) שלא בוטלו בהחזרה: תיק שנוכה, נכשל,
  // והוחזר — ואז נוכה שוב בהצלחה — הוא תקין לחלוטין. רק *מאזן* שלילי
  // מעבר לכרטיס אחד מעיד על כפילות אמיתית.
  const byAid = new Map<string, { net: number; movements: Ledger[] }>()
  for (const r of rows) {
    if (!r.aid_id) continue
    if (!byAid.has(r.aid_id)) byAid.set(r.aid_id, { net: 0, movements: [] })
    const e = byAid.get(r.aid_id)!
    e.net += Number(r.delta ?? 0)
    e.movements.push(r)
  }

  const doubleCharged = [...byAid.entries()]
    .filter(([, v]) => v.net < -1)
    .map(([aidId, v]) => ({ aidId, net: v.net, movements: v.movements }))

  // שמות לתיקים החשודים, כדי שיהיה ברור על מי מדובר.
  const aidIds = doubleCharged.map(d => d.aidId)
  let names: Record<string, string> = {}
  if (aidIds.length) {
    const { data } = await db.from('maternity_aids')
      .select('id, card_load_status, card_tlush_id, beneficiary:beneficiaries(full_name, family_name)')
      .in('id', aidIds)
    names = Object.fromEntries((data ?? []).map(a => {
      const r = a as unknown as { id: string; beneficiary?: { full_name?: string; family_name?: string } | null }
      return [r.id, [r.beneficiary?.family_name, r.beneficiary?.full_name].filter(Boolean).join(' ') || r.id]
    }))
  }

  // ── 24 השעות האחרונות — מה זז לאחרונה ──
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000
  const recent = rows.filter(r => new Date(r.created_at).getTime() >= dayAgo)
  const recentOut = recent.filter(r => Number(r.delta) < 0)
  const recentIn = recent.filter(r => Number(r.delta) > 0)

  return NextResponse.json({
    balance,
    totalMovements: rows.length,
    last24h: {
      consumed: recentOut.length,
      returned: recentIn.length,
      net: recent.reduce((s, r) => s + Number(r.delta ?? 0), 0),
      movements: recent.slice(0, 60),
    },
    doubleCharged: doubleCharged.map(d => ({ ...d, name: names[d.aidId] ?? d.aidId })),
    healthy: doubleCharged.length === 0,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
