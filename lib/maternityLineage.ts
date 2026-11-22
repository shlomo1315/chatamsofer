// סדר הדורות של יולדת — חישוב משותף לכרטסת המלאה ולחלון התיק המהיר.
//
// 🔴 הוצא מ-app/admin/maternity/[id]/page.tsx (22.11.2026) כדי שהחלון המהיר
// יציג *בדיוק* את אותם צבעים כמו הכרטסת. שני חישובים נפרדים לאותה שאלה
// הציגו בעבר צבע אחר לאותו דור (ראו lineage-color-approved-file בזיכרון).
import { isSupabaseConfigured } from '@/lib/supabase/server'
import { pathToRoot, NODE_SELECT, type TreeNodeRow } from '@/lib/lineageSync'
import { isNodeVerified } from '@/lib/lineageDeviation'
import { genColorByRef } from '@/lib/lineageApprovedColor'
import type { ApprovedRefLookup } from '@/lib/lineageApprovedRef'
import { displayChain } from '@/lib/lineageDisplayChain'

// מטמון קצר-מועד למפת צמתי השושלת — נמנע מסריקת כל הטבלה בכל טעינת כרטסת.
// השושלת כמעט ואינה משתנה, ולכן TTL של 5 דקות מזרז מאוד טעינות חוזרות.
// generation + status נדרשים לצביעת הצ'יפים (ירוק=מאומת / אדום=סוטה / כתום=נוסף),
// בדיוק כמו בכרטסת הצאצא.
type LineageNodeLite = { id: string; name: string; parent_id: string | null; generation: number; status: string; relation?: string | null }

// ⚡ מטמון *משותף* (getCachedLineageTree) ולא מטמון פרטי לדף הזה.
//
// ⚠️ עד כה היה כאן מטמון נפרד משלו עם אותן שורות בדיוק (אותו NODE_SELECT)
// שכרטסת הצאצא כבר טוענת — כלומר כפל זיכרון על ~5000 צמתים, ובלי שתי
// התכונות שיש למטמון המשותף: single-flight (שתי כרטסות שנפתחות יחד סרקו
// את העץ פעמיים במקביל) ו-stale-while-revalidate (אחרי כל רישום ציבורי
// המטמון נפסל, והפתיחה הבאה נחסמה על סריקה מלאה במקום לקבל עותק מיושן מיד).
export async function getLineageMap(): Promise<Map<string, LineageNodeLite>> {
  // ⚠️ service client (ולא createClient מבוסס-הסשן): RLS על lineage_nodes חוסם
  // את המשתמש המחובר ומחזיר 0 שורות בשקט, וכל הצ'יפים נצבעים כתום. זהה לתיקון
  // ב-getAllLineageNodes בכרטסת הצאצא.
  const { getServiceClient } = await import('@/lib/apiAuth')
  const supabase = getServiceClient()
  if (!supabase) return new Map()
  const { getCachedLineageTree } = await import('@/lib/lineageSync')
  const rows = await getCachedLineageTree(async () => {
    // ⚠️ שליפה בדפים — .limit() לבדו נחתך ל-1000 (db-max-rows), והצ'יפים הציגו
    // עץ חלקי בעצים גדולים. ראו lib/fetchAllRows.
    const { fetchAllRows } = await import('@/lib/fetchAllRows')
    const { rows, error } = await fetchAllRows<TreeNodeRow>((from, to) =>
      supabase.from('lineage_nodes').select(NODE_SELECT).range(from, to),
    )
    if (error) throw new Error(error)
    return rows
  })
  return new Map((rows as unknown as LineageNodeLite[]).map(n => [n.id, n]))
}

export type GenStatus = 'verified' | 'pending' | 'rejected' | null
// מחשב את סטטוס הצומת התואם בעץ לכל דור ב-lineage_chain (verified=כחול /
// pending/אין=כתום / rejected=אדום). זהה ללוגיקה בכרטסת הצאצא.
export async function computeGenStatus(
  chain: { generation: number; name: string }[],
  nodeId?: string | null,
): Promise<Map<number, GenStatus>> {
  const out = new Map<number, GenStatus>()
  if (!isSupabaseConfigured()) return out
  const map = await getLineageMap()

  // ✅ מקור האמת: כשיש שיוך לצומת בעץ, הסטטוס נגזר מהמסלול לפי מזהי צמתים.
  // התאמת שמות (למטה) נשארת רק לשרשרת ידנית בלי שיוך — אחרת הבדל ניסוח בשם
  // ("רבי נתן יהודה סופר" מול "רבי נתן יהודה (נטע)") צובע דור מאושר באדום.
  const allNodes = [...map.values()]

  const path = pathToRoot(map as unknown as Map<string, TreeNodeRow>, nodeId)
  if (path.length) {
    // ✅ צבע לפי הצומת הספציפי במסלול של הצאצא — לא כלל-על שמעלה דור שלם לכחול
    // כי יש בו צומת verified אחר. צומת pending (כתום בעץ) נשאר כתום בצ'יפ, ומרגע
    // שמאשרים אותו בעץ הוא נהיה כחול מיד. זהה לכרטסת הצאצא.
    for (const n of path) {
      const status: GenStatus =
        isNodeVerified(n.status) ? 'verified'
        : n.status === 'rejected' ? 'rejected'
        : 'pending'
      out.set(n.generation, status)
    }
    return out
  }

  if (!chain.length) return out
  const nodes = allNodes
  // ⚠️ אותה לוגיקה בדיוק כמו בכרטסת הצאצא: קודם הליכה בעץ מהשורש (השרשרת
  // המוקלדת נושאת ניסוח מורכב שאינו שווה לשם הצומת), ואחר כך התאמת שמות שטוחה
  // למה שלא זוהה. שתי לוגיקות שונות לאותה שאלה היו מציגות צבע אחר באותו דור.
  const { resolveChainAgainstTree } = await import('@/lib/lineageResolve')
  for (const [gen, r] of resolveChainAgainstTree(nodes, chain)) out.set(gen, r.status)
  const { namesMatch } = await import('@/lib/hebrewName')
  for (const e of chain) {
    if (out.has(e.generation)) continue
    const matches = nodes.filter(n => n.generation === e.generation && namesMatch(n.name, e.name))
    const status: GenStatus = matches.find(n => isNodeVerified(n.status)) ? 'verified'
      : matches.find(n => n.status === 'rejected') ? 'rejected'
      : matches.length ? 'pending'
      : null
    out.set(e.generation, status)
  }
  // ✅ אין כלל-על שמעלה דור שלם לכחול — הצבע לפי הצומת התואם בלבד. זהה לכרטסת הצאצא.
  return out
}

// סדר הדורות — נתיב משויך השושלת מהשורש ועד הצומת הנבחר.
// ⚠️ אם ליולדת אין lineage_node_id (שיוך לעץ המאושר) אלא רק lineage_chain
// (שרשרת שהוקלדה בטופס) — משתמשים ב-chain המלא, כדי שיוצג *כל* סדר הדורות
// (חתם סופר דור 1 והלאה) ולא רק חלק. בדיוק כמו כרטיס הצאצאים.
export async function getLineagePath(
  nodeId?: string | null,
  chain?: { generation: number; name: string }[] | null,
): Promise<string[]> {
  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 (1) מה שהמשפחה בחרה — הקובץ המאושר הוא מקור האמת, לא העץ.
  //
  // ⚠️ עד כה העץ גבר, ואותו מוטב הוצג אחרת בשתי כרטסות: בצאצאים עשרה
  // דורות ירוקים לפי בחירתו, וכאן שמונה דורות שחלקם אדומים — כי העץ
  // חולק על הקובץ בדור של 37 שמות. עקשטיין (212404438) הוא בדיוק זה.
  //
  // ⚠️ תיקון העץ הוא שלב נפרד ואינו צריך לעכב אישור יולדות.
  // ─────────────────────────────────────────────────────────────────────────
  if (Array.isArray(chain) && chain.length) {
    const fromChain = [...chain]
      .filter(e => e && typeof e.name === 'string' && e.name.trim())
      .sort((a, b) => (a.generation ?? 0) - (b.generation ?? 0))
      .map(e => e.name.trim())
    if (fromChain.length) return fromChain
  }
  // (2) נפילה-לאחור: מסלול העץ — רק כשאין שרשרת שמורה כלל.
  if (nodeId && isSupabaseConfigured()) {
    const map = await getLineageMap()
    const path: string[] = []
    let cur = map.get(nodeId)
    let guard = 0
    while (cur && guard < 50) {
      path.unshift(cur.name)
      cur = cur.parent_id ? map.get(cur.parent_id) : undefined
      guard++
    }
    if (path.length) return path
  }
  return []
}


export const CHATAM_SOFER = 'מרן החתם סופר זי"ע'

export interface MaternityGen {
  generation: number
  name: string
  status: 'verified' | 'pending' | 'rejected' | null
  relation: 'son' | 'son_in_law' | null
  color: 'green' | 'orange' | 'red'
}

/**
 * השרשרת הצבועה — אותו כלל כמו בכרטסת הצאצא: הקובץ המאושר מכריע ב-5 הדורות
 * הראשונים, לא התווית שעל הצומת. דור 1 תמיד מרן החתם סופר, ירוק.
 */
export function buildMaternityGens(args: {
  typedChain: { generation: number; name: string; relation?: string | null }[]
  lineagePath: string[]
  lineageManual: string[]
  genStatus: Map<number, GenStatus>
  approvedRef: ApprovedRefLookup
}): MaternityGen[] {
  const { typedChain, lineagePath, lineageManual, genStatus, approvedRef } = args
  const chainSorted = [...typedChain]
    .filter(e => e && typeof e.name === 'string' && e.name.trim())
    .sort((a, b) => (a.generation ?? 0) - (b.generation ?? 0))
  const relOf = (g: number) => chainSorted.find(c => c.generation === g)?.relation ?? null
  const source = displayChain(
    chainSorted,
    lineagePath.map((name, i) => ({ generation: i + 1, name, relation: relOf(i + 1) })),
    lineageManual,
  )
  if (!source.length) return []
  const gens: MaternityGen[] = source.map(c => {
    const isRoot = c.generation === 1
    return {
      generation: c.generation,
      name: isRoot ? CHATAM_SOFER : c.name,
      status: isRoot ? 'verified' : (genStatus.get(c.generation) ?? null),
      relation: isRoot ? null : ((c.relation as 'son' | 'son_in_law' | null | undefined) ?? null),
      color: isRoot ? 'green' : genColorByRef(c.generation, c.name, genStatus.get(c.generation) ?? null, approvedRef),
    }
  })
  if (!gens.some(g => g.generation === 1)) {
    gens.unshift({ generation: 1, name: CHATAM_SOFER, status: 'verified', relation: null, color: 'green' })
  }
  return gens
}
