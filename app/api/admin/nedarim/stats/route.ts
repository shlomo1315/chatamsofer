import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { getNedarimCreds, getClientsTable, getClientCardFull, type NedarimCreds } from '@/lib/nedarim'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>

// פירוק תאריך נדרים (dd/mm/yyyy עם/בלי שעה) ל-Date
function parseNedarimDate(s: unknown): Date | null {
  if (!s) return null
  const m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return Number.isNaN(d.getTime()) ? null : d
}

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// עיבוד מקבילי מוגבל (pool) כדי לא להציף את שרתי נדרים
async function mapPool<T, R>(items: T[], limit: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return out
}

export async function GET() {
  if (!(await requireStaff())) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const creds = await getNedarimCreds()
  if (!creds) return NextResponse.json({ configured: false })

  let families: Json[] = []
  try {
    const t = await getClientsTable(creds as NedarimCreds)
    families = t.families
  } catch (e) {
    return NextResponse.json({ configured: true, error: e instanceof Error ? e.message : 'שגיאה' }, { status: 502 })
  }

  // משיכת כרטיס מלא לכל משפחה (טעינות + היסטוריה) — pool של 5
  const cards = await mapPool(families, 5, async (f) => {
    try { return { f, card: await getClientCardFull(creds as NedarimCreds, String(f.ClientId)) } }
    catch { return { f, card: null } }
  })

  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startWeek = new Date(startToday); startWeek.setDate(startToday.getDate() - ((startToday.getDay() + 7) % 7)) // ראשון
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  let totalLoaded = 0, totalRemaining = 0
  let usedTotal = 0, usedToday = 0, usedWeek = 0, usedMonth = 0
  let cntToday = 0, cntWeek = 0, cntMonth = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transactions: any[] = []

  for (const { f, card } of cards) {
    if (!card) continue
    totalRemaining += num(card.TotalFreeAmount)
    const tlushim: Json[] = Array.isArray(card.Tlushim) ? card.Tlushim : []
    for (const t of tlushim) totalLoaded += num(t.Amount)
    const history: Json[] = Array.isArray(card.History) ? card.History : []
    const famName = [card.FamilyName ?? f.FamilyName, card.FirstName ?? f.FirstName].filter(Boolean).join(' ')
    for (const h of history) {
      const amt = num(h.Amount)
      usedTotal += amt
      const d = parseNedarimDate(h.Date)
      if (d) {
        if (d >= startToday) { usedToday += amt; cntToday++ }
        if (d >= startWeek) { usedWeek += amt; cntWeek++ }
        if (d >= startMonth) { usedMonth += amt; cntMonth++ }
      }
      transactions.push({
        clientId: f.ClientId, familyName: famName,
        store: h.StoreName ?? '', date: h.Date ?? '', ts: d ? d.getTime() : 0,
        amount: amt, comments: h.Comments ?? '',
      })
    }
  }
  transactions.sort((a, b) => b.ts - a.ts)

  return NextResponse.json({
    configured: true,
    familiesCount: families.length,
    totalLoaded, totalRemaining, usedTotal,
    usedToday, usedWeek, usedMonth,
    cntToday, cntWeek, cntMonth,
    transactions,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
