import { NextResponse } from 'next/server'
import { getServiceClient, requirePermission } from '@/lib/apiAuth'
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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 08.10: פתיחת המסך עצרה את כל פעולות הכרטיסים ל-15 דקות.
//
// המסך משך כרטיס מלא לכל משפחה (מאות פניות, 5 במקביל) בכל פתיחה, עם מטמון
// של 90 שניות בלבד. 80 פניות בדקה הפעילו את השומר (lib/nedarimGuard), והוא
// השהה את ערוץ הכרטיסים — כולל שיוך כרטיסים בטלפון ליולדות ולחגים.
//
// עכשיו: הסטטיסטיקות נשמרות במסד (app_settings) ומוצגות מיד; רענון רץ ברקע
// לכל היותר פעם בשעה, טורי, בקצב של ≤40 פניות בדקה (חצי מתקרת השומר),
// ונעצר מיד אם השומר עוצר — במקום להמשיך לפנות לערוץ חסום.
// ─────────────────────────────────────────────────────────────────────────────
const CACHE_KEY = 'nedarim_card_stats_cache'
const MAX_AGE_MS = 60 * 60_000
const GAP_MS = 1_500
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let refreshing: Promise<void> | null = null

/** האם השגיאה היא עצירה של השומר — אז אין טעם להמשיך. */
const isGuardStop = (e: unknown) => /נעצרו זמנית|הושהה/.test(e instanceof Error ? e.message : String(e))

// אגרגציית נתוני נדרים (רשימת המשפחות + כרטיס מלא לכל משפחה) — כבדה: פנייה
// לכל משפחה. ⚠️ רצה רק ברקע (refreshInBackground), לעולם לא בתוך הבקשה.
async function computeStats() {
  const creds = await getNedarimCreds()
  if (!creds) return null

  const t = await getClientsTable(creds as NedarimCreds)
  const families: Json[] = t.families
  const tableTotal = num(t.total) // הסכום הכללי המוטען בכל הכרטיסים — ישירות מ-GetClient_Table
  const tableMeta: Record<string, unknown> = t.meta ?? {}

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

  // משיכת כרטיס מלא לכל משפחה (טעינות + היסטוריה) — טורי ובקצב מבוקר.
  const cards: { f: Json; card: Json | null }[] = []
  for (const f of families) {
    try {
      cards.push({ f, card: await getClientCardFull(creds as NedarimCreds, String(f.ClientId)) })
    } catch (e) {
      // 🔴 השומר עצר — לא שומרים תוצאה חלקית ולא ממשיכים לפנות.
      if (isGuardStop(e)) throw e
      cards.push({ f, card: null })
    }
    await sleep(GAP_MS)
  }

  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startWeek = new Date(startToday); startWeek.setDate(startToday.getDate() - ((startToday.getDay() + 7) % 7)) // ראשון
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  let remainingFromCards = 0
  let usedTotal = 0, usedToday = 0, usedWeek = 0, usedMonth = 0
  let cntToday = 0, cntWeek = 0, cntMonth = 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transactions: any[] = []
  // מספר הכרטיס המגנטי הפעיל לכל משפחה (לפי ClientId) — להצגה בטבלה
  const cardByClientId: Record<string, string> = {}

  for (const { f, card } of cards) {
    if (!card) continue
    const activeCard = (Array.isArray(card.Cards) ? card.Cards : []).find((c: Json) => !c.RemovedDate)
    const cardNum = activeCard ? String(activeCard.CardNumber ?? activeCard.MagneticCard ?? '').trim() : ''
    if (cardNum) cardByClientId[String(f.ClientId)] = cardNum
    remainingFromCards += num(card.TotalFreeAmount)
    const history: Json[] = Array.isArray(card.History) ? card.History : []
    const famName = [card.FamilyName ?? f.FamilyName, card.FirstName ?? f.FirstName].filter(Boolean).join(' ')
    for (const h of history) {
      // היסטוריית עסקאות = רק קניות בבית עסק (יש שם חנות) — לא טעינות/פריקות
      const store = String(h.StoreName ?? h.Store ?? '').trim()
      if (!store) continue
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
        store, date: h.Date ?? '', ts: d ? d.getTime() : 0,
        amount: amt, comments: h.Comments ?? '',
      })
    }
  }
  transactions.sort((a, b) => b.ts - a.ts)

  // יתרה כללית — מקור אמת: Total מטבלת המשפחות, אחרת סכום Ytra, אחרת מהכרטיסים
  const totalRemaining = tableTotal || sumYtra || remainingFromCards
  // "סה״כ מוטען בארנקים" = הסכום הזמין כעת בפועל בכל הכרטיסים.
  // ⚠️ ללא נפילה-לאחור לסכום הטעינות ההיסטוריות: כשפורקים כסף מהמשפחות
  // היתרה יורדת ל-0 אך הסכום ההיסטורי נשאר — והמסך הציג "7,200 ₪" כאילו
  // הכסף עדיין שם. 0 הוא ערך תקין.
  const loadedFinal = remainingFromCards

  return {
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
    cardByClientId,
  }
}

type Stats = NonNullable<Awaited<ReturnType<typeof computeStats>>>

async function readCache(): Promise<{ at: number; stats: Stats } | null> {
  const db = getServiceClient()
  if (!db) return null
  const { data } = await db.from('app_settings').select('value').eq('key', CACHE_KEY).maybeSingle()
  try { return data?.value ? JSON.parse(String(data.value)) : null } catch { return null }
}

/** רענון ברקע — אחד בכל פעם (single-flight). ⚠️ לעולם לא בתוך הבקשה. */
function refreshInBackground() {
  if (refreshing) return
  refreshing = (async () => {
    const stats = await computeStats()
    const db = getServiceClient()
    if (!stats || !db) return
    // ⚠️ app_settings.value היא text — חובה stringify.
    await db.from('app_settings').upsert(
      { key: CACHE_KEY, value: JSON.stringify({ at: Date.now(), stats }) }, { onConflict: 'key' },
    )
    console.log(`[nedarim/stats] רוענן · ${stats.familiesCount} משפחות`)
  })()
    .catch(e => console.error('[nedarim/stats] הרענון נעצר:', e instanceof Error ? e.message : e))
    .finally(() => { refreshing = null })
}

// מפת ת.ז → פרטי פריקה (תאריך סיום הזכאות) מתוך תיקי היולדות הפעילים — נטענת חי (Supabase),
// כדי שספירת הימים לפריקה תישאר מדויקת ולא תלויה במטמון נדרים.
type UnloadInfo = {
  unloadDate: string; daysRemaining: number
  aidId?: string; birthDate?: string; sixWeeksEnd?: string
  extended?: boolean; reason?: string; centerName?: string
}
async function getUnloadByZeout(): Promise<Record<string, UnloadInfo>> {
  const unloadByZeout: Record<string, UnloadInfo> = {}
  try {
    const admin = getServiceClient()
    if (admin) {
      const { data: aids } = await admin
        .from('maternity_aids')
        .select('id, birth_date, six_weeks_end, status, eligibility_extended, eligibility_extension_reason, beneficiary:beneficiaries(id_number), card_center:card_centers(name)')
        .eq('status', 'active')
      const today0 = new Date(); today0.setHours(0, 0, 0, 0)
      for (const a of (aids ?? []) as Json[]) {
        const zeout = String(a.beneficiary?.id_number ?? '').trim()
        if (!zeout) continue
        let end: Date | null = a.six_weeks_end ? new Date(a.six_weeks_end) : null
        if (!end && a.birth_date) { end = new Date(a.birth_date); end.setDate(end.getDate() + 42) }
        if (!end || Number.isNaN(end.getTime())) continue
        const days = Math.ceil((end.getTime() - today0.getTime()) / 86400000)
        unloadByZeout[zeout] = {
          unloadDate: end.toISOString().slice(0, 10),
          daysRemaining: days,
          aidId: a.id,
          birthDate: a.birth_date ?? undefined,
          sixWeeksEnd: a.six_weeks_end ?? undefined,
          extended: !!a.eligibility_extended,
          reason: a.eligibility_extension_reason ?? undefined,
          centerName: a.card_center?.name ?? undefined,
        }
      }
    }
  } catch { /* מפת פריקה היא תוספת — כשל לא חוסם את הסטטיסטיקות */ }
  return unloadByZeout
}

export async function GET() {
  if (!(await requirePermission('maternity_cards', 'view'))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const creds = await getNedarimCreds()
  if (!creds) return NextResponse.json({ configured: false })

  // ⚡ מהמסד, מיד. רענון ברקע רק כשהנתונים ישנים משעה (או חסרים).
  const cached = await readCache()
  if (!cached || Date.now() - cached.at > MAX_AGE_MS) refreshInBackground()
  const stats: Partial<Stats> = cached?.stats ?? {
    familiesCount: 0, totalLoaded: 0, totalRemaining: 0, tableTotal: 0, sumYtra: 0,
    generalWallet: null, generalWalletKey: null, tableMeta: {},
    usedTotal: 0, usedToday: 0, usedWeek: 0, usedMonth: 0, cntToday: 0, cntWeek: 0, cntMonth: 0,
    transactions: [], cardByClientId: {},
  }

  // ספירת ימים לפריקה — חי, לא ממטמון
  const unloadByZeout = await getUnloadByZeout()

  return NextResponse.json(
    { configured: true, ...stats, unloadByZeout, refreshedAt: cached?.at ?? null, refreshing: !!refreshing },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
