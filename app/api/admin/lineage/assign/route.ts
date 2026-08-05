import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// שיוך ידני של צאצא לצומת בעץ הדורות.
//
// במבנה הקיים הצאצא מצביע לצומת עלה יחיד (lineage_node_id), וכל שרשרת הדורות
// נגזרת ממנו כלפי מעלה (parent_id). לכן "עריכת השיוך" = בחירת צומת העלה,
// וה-endpoint מחשב מחדש את lineage_chain מהצומת החדש עד השורש.
//
// אינו משנה status של צמתים ואינו נוגע ב-lineage_manual — פעולה ידנית של אדמין.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // atGeneration — כשעורכים דור *מסוים* בשרשרת (בורר בצ'יפים): מחליפים רק את
  // הדורות עד הדור הזה (1..N) ושומרים את הדורות שמתחת (N+1+). כשלא מועבר
  // (בורר leaf מלא) — מחליפים את כל השרשרת מהצומת עד השורש (התנהגות מקורית).
  let body: { beneficiaryId?: string; nodeId?: string; atGeneration?: number }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { beneficiaryId, nodeId, atGeneration } = body
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה נרשם' }, { status: 400 })
  if (!nodeId) return NextResponse.json({ error: 'חסר מזהה צומת' }, { status: 400 })

  type Node = { id: string; name: string; parent_id: string | null; generation: number; relation: string | null; status: string }
  type ChainEntry = { generation: number; name: string; relation: string | null }

  // כל צמתי העץ — לבניית השרשרת מהצומת הנבחר עד השורש.
  // ⚠️ שליפה בדפים: .limit() לבדו לא עוקף את db-max-rows=1000 של PostgREST —
  // בעץ של אלפי צמתים הרשימה נחתכה בשקט ל-1000. ראו lib/fetchAllRows.
  const { rows: allNodes, error: nErr } = await fetchAllRows<Node>((from, to) =>
    db.from('lineage_nodes').select('id, name, parent_id, generation, relation, status').range(from, to),
  )
  if (nErr) return NextResponse.json({ error: 'טעינת עץ הדורות נכשלה' }, { status: 500 })

  const map = new Map<string, Node>(allNodes.map(n => [n.id, n]))
  const chosen = map.get(nodeId)
  if (!chosen) return NextResponse.json({ error: 'הצומת שנבחר אינו קיים בעץ' }, { status: 404 })

  // walk-up מהצומת שנבחר עד השורש — הדורות 1..(הדור של הצומת), עם הגנה מפני מעגל
  const upChain: ChainEntry[] = []
  const seen = new Set<string>()
  let cur: Node | undefined = chosen
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    upChain.unshift({ generation: cur.generation, name: cur.name, relation: cur.relation })
    cur = cur.parent_id ? map.get(cur.parent_id) : undefined
  }

  let chain: ChainEntry[] = upChain
  // עריכת דור מסוים: שומרים את הדורות שמתחת ל*דור שתוקן* (atGeneration), לא לפי
  // הדור של הצומת שנבחר.
  //
  // ⚠️ באג שתוקן: קודם ה-below נגזר מ-chosen.generation (הדור של הצומת החדש).
  // אם הצומת שנבחר לתיקון דור 3 היה בעצם בדור אחר בעץ (למשל 2), כל הדורות
  // 3,4,5… "נעלמו" — הם סוננו כי generation שלהם לא היה גדול מ-chosen.generation
  // השגוי. עכשיו הסינון מתבסס על atGeneration שהמשתמש ביקש לתקן: כל הדורות
  // *מעבר* לדור שתוקן נשמרים תמיד, בלי קשר לדור של הצומת החדש.
  const cutGen = typeof atGeneration === 'number' ? atGeneration : chosen.generation
  if (typeof atGeneration === 'number') {
    const { data: ben } = await db
      .from('beneficiaries').select('lineage_chain').eq('id', String(beneficiaryId)).maybeSingle()
    const existing: ChainEntry[] = Array.isArray(ben?.lineage_chain) ? (ben!.lineage_chain as ChainEntry[]) : []
    const below = existing.filter(e => e && typeof e.generation === 'number' && e.generation > cutGen)
    // ממזגים: השרשרת החדשה עד הצומת + הדורות הישנים שמתחת לדור שתוקן. אם השרשרת
    // החדשה מסתיימת לפני cutGen (הצומת רדוד), הדורות הישנים 1..cutGen שבין השניים
    // עדיין נשמרים כדי לא ליצור "חור" בשרשרת.
    const upMax = upChain.length ? Math.max(...upChain.map(e => e.generation)) : 0
    const gapFill = existing.filter(e => e && typeof e.generation === 'number' && e.generation > upMax && e.generation <= cutGen)
    chain = [...upChain, ...gapFill, ...below]
      .filter((e, i, arr) => arr.findIndex(x => x.generation === e.generation) === i)  // דור ייחודי
      .sort((a, b) => a.generation - b.generation)
  }

  // lineage_node_id: אם נשמרו דורות מתחת (הצומת אינו העלה) — משאירים את הקיים,
  // כי ה-leaf האמיתי עמוק יותר. אחרת הצומת שנבחר הוא העלה.
  const hasBelow = chain.some(e => e.generation > cutGen)
  const update: Record<string, unknown> = { lineage_chain: chain }
  if (!hasBelow) update.lineage_node_id = nodeId

  // ── החזרת סטטוס מ-deep_review ל-pending כשתוקנו 5 הדורות הראשונים ──
  // צאצא נכנס ל-deep_review כי נגע ב-5 הדורות הראשונים. ברגע שכל דור ≤5
  // בשרשרת החדשה תואם לצומת מאומת בעץ (verified) — הסטייה תוקנה, ולכן הסטטוס
  // חוזר אוטומטית ל-pending (ממתין לאישור ראשוני). לא נוגעים בסטטוסים אחרים.
  try {
    const { data: ben } = await db.from('beneficiaries').select('eligibility_status').eq('id', String(beneficiaryId)).maybeSingle()
    if (ben?.eligibility_status === 'deep_review') {
      const { namesMatch } = await import('@/lib/hebrewName')
      const nodesArr = allNodes
      // כל דור ≤5 (למעט דור 1 = החתם סופר, תמיד מאושר) חייב צומת verified תואם
      const early = chain.filter(e => e.generation > 1 && e.generation <= 5)
      // ⚠️ חייב לכסות את *כל* דורות 2–5 (לא רשימה חלקית): early.every על רשימה
      // חסרה מחזיר true בטעות ומוריד מ-deep_review משפחה שעדיין חריגה. דורשים
      // שכל דור 2..5 קיים בשרשרת *וגם* תואם לצומת verified.
      const coversAllEarly = [2, 3, 4, 5].every(g => early.some(e => e.generation === g))
      const allEarlyVerified = coversAllEarly && early.every(e =>
        nodesArr.some(n => n.status === 'verified' && n.generation === e.generation && namesMatch(n.name, e.name)),
      )
      if (allEarlyVerified) update.eligibility_status = 'pending'
    }
  } catch { /* בדיקת deep_review best-effort — לא חוסמת את השיוך */ }

  const { error: uErr } = await db
    .from('beneficiaries')
    .update(update)
    .eq('id', String(beneficiaryId))
  if (uErr) return NextResponse.json({ error: 'עדכון השיוך נכשל' }, { status: 500 })

  return NextResponse.json({ ok: true, chain, statusReverted: update.eligibility_status === 'pending' })
}
