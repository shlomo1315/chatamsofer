import { NextResponse } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
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

// פירוק מספר עמיד — מנקה פסיקים / ₪ / רווחים / NBSP וכו'
const num = (v: unknown) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const cleaned = String(v ?? '').replace(/[^\d.\-]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}

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
  let tableTotal = 0 // הסכום הכללי המוטען בכל הכרטיסים — ישירות מ-GetClient_Table
  let tableMeta: Record<string, unknown> = {}
  try {
    const t = await getClientsTable(creds as NedarimCreds)
    families = t.families
    tableTotal = num(t.total)
    tableMeta = t.meta ?? {}
  } catch (e) {
    return NextResponse.json({ configured: true, error: e instanceof Error ? e.message : 'שגיאה' }, { status: 502 })
  }

  // איתור "ארנק כללי" (יתרת המוסד) מתוך שדות התגובה — שדה לא מתועד שעשוי להופיע בשמות שונים
  let generalWallet: number | null = null
  let generalWalletKey: string | null = null
  for (const [k, v] of Object.entries(tableMeta)) {
    if (['Total', 'Result', 'Message'].includes(k)) continue
    if (/arnak|wallet|ארנק|mosad.*bal|bal.*mosad|credit|kupa|itra|yitra|balance|יתר/i.test(k)) {
      const n = num(v)
      if (Number.isFinite(n) && n !== 0) { generalWallet = n; generalWalletKey = k; break }
    }
  }
  // סכום היתרות לפי עמודת Ytra בטבלת המשפחות (קריאה אחת אמינה)
  const sumYtra = families.reduce((s, f) => s + num(f.Ytra), 0)

  // משיכת כרטיס מלא לכל משפחה (טעינות + היסטוריה) — pool של 5
  const cards = await mapPool(families, 5, async (f) => {
    try { return { f, card: await getClientCardFull(creds as NedarimCreds, String(f.ClientId)) } }
    catch { return { f, card: null } }
  })

  // מפת ת.ז → תאריך פריקה (6 שבועות מהלידה) מתוך תיקי היולדות הפעילים
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unloadByZeout: Record<string, { unloadDate: string; daysRemaining: number }> = {}
  try {
    const admin = getServiceClient()
    if (admin) {
      const { data: aids } = await admin
        .from('maternity_aids')
        .select('birth_date, six_weeks_end, status, beneficiary:beneficiaries(id_number)')
        .eq('status', 'active')
      const today0 = new Date(); today0.setHours(0, 0, 0, 0)
      for (const a of (aids ?? []) as Json[]) {
        const zeout = String(a.beneficiary?.id_number ?? '').trim()
        if (!zeout) continue
        let end: Date | null = a.six_weeks_end ? new Date(a.six_weeks_end) : null
        if (!end && a.birth_date) { end = new Date(a.birth_date); end.setDate(end.getDate() + 42) }
        if (!end || Number.isNaN(end.getTime())) continue
        const days = Math.ceil((end.getTime() - today0.getTime()) / 86400000)
        unloadByZeout[zeout] = { unloadDate: end.toISOString().slice(0, 10), daysRemaining: days }
      }
    }
  } catch { /* מפת פריקה היא תוספת — כשל לא חוסם את הסטטיסטיקות */ }

  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startWeek = new Date(startToday); startWeek.setDate(startToday.getDate() - ((startToday.getDay() + 7) % 7)) // ראשון
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  let totalLoaded = 0, remainingFromCards = 0
  let usedTotal = 0, usedToday = 0, usedWeek = 0, usedMonth = 0
  let cntToday = 0, cntWeek = 0, cntMonth = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transactions: any[] = []

  for (const { f, card } of cards) {
    if (!card) continue
    remainingFromCards += num(card.TotalFreeAmount)
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

  // יתרה כללית — מקור אמת: Total מטבלת המשפחות, אחרת סכום Ytra, אחרת מהכרטיסים
  const totalRemaining = tableTotal || sumYtra || remainingFromCards
  // נטען אי-פעם — אם לא הצלחנו לסכום טעינות, נשתמש לפחות ביתרה הנוכחית + הניצול
  const loadedFinal = totalLoaded || (totalRemaining + usedTotal)

  return NextResponse.json({
    configured: true,
    familiesCount: families.length,
    totalLoaded: loadedFinal,
    totalRemaining,
    tableTotal,
    sumYtra,
    generalWallet,        // יתרת ארנק המוסד הכללי (אם נמצאה בתגובת ה-API)
    generalWalletKey,     // שם השדה שזוהה (לאבחון)
    tableMeta,            // כל שדות התגובה ברמה העליונה (לאבחון — לאיתור שם השדה הנכון)
    usedTotal,
    usedToday, usedWeek, usedMonth,
    cntToday, cntWeek, cntMonth,
    transactions,
    unloadByZeout,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
