import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { mergeWithCascade, pickKeepId, recalcGenerations } from '@/lib/lineageMerge'
import { invalidateLineageCache } from '@/lib/lineageSync'
import { logActivity } from '@/lib/activityLog'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { findSafeMergeGroups, exactNameKey, type SafeNode } from '@/lib/safeMergeGroups'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// מיזוג בטוח: רק שם זהה *בדיוק*, תחת אותו אב, באותו דור.
//
// נפרד מהמיזוג הרגיל ולא מחליף אותו. הרגיל מזהה גם וריאציות כתיב ותארים, ולכן
// מחייב עין אנושית על כל אשכול (אשכול מקורב אחד כבר איחד שלושה אנשים שונים).
// כאן אין פרשנות — או שהמחרוזת זהה או שלא — ולכן אפשר להריץ על מאות קבוצות.
//
// ⚠️ בלי מפל, בשום כיוון:
//  • cascadeUp מזג אבות — החלטה שאינה נובעת מהכלל הבטוח.
//  • cascadeDown משתמש ב-autoMergeKey שמסיר תארים, כלומר מקורב יותר מהכלל כאן.
// המסלול הזה עושה דבר אחד: מקפל כל קבוצה זהה לצומת אחד. שום דבר מעבר.
//
// GET  — תצוגה מקדימה: הקבוצות, כמה צמתים ייעלמו, וכמה ילדים/משפחות יזוזו.
// POST — מבצע. batchId אחד לכל ההרצה, כך שביטול אחד מחזיר את הכל.
// ─────────────────────────────────────────────────────────────────────────────

type Row = SafeNode & { id_number?: string | null }

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// ⚠️ withBeneficiaries: ספירת המשפחות דרושה רק לתצוגה המקדימה. ב-POST היא
// הוסיפה שבעה סבבי רשת לכל מנה — בלי להשפיע על המיזוג עצמו — וכל שנייה שם
// נחסכת ממש מהתקרה שהפילה את הבקשה.
async function loadTree(
  admin: NonNullable<ReturnType<typeof getAdminClient>>,
  opts: { withBeneficiaries?: boolean } = {},
) {
  const empty = {
    groups: [] as ReturnType<typeof findSafeMergeGroups>,
    childCount: new Map<string, number>(), nameById: new Map<string, string>(),
    benCount: new Map<string, number>(), rootId: null as string | null,
  }
  const nodes = await fetchAllRows<Row>((from, to) =>
    admin.from('lineage_nodes').select('id, name, parent_id, generation, status').range(from, to))
  if (nodes.error) return { error: nodes.error, ...empty }

  const childCount = new Map<string, number>()
  for (const n of nodes.rows) {
    if (n.parent_id) childCount.set(n.parent_id, (childCount.get(n.parent_id) ?? 0) + 1)
  }
  const nameById = new Map(nodes.rows.map(n => [n.id, n.name]))

  const benCount = new Map<string, number>()
  if (opts.withBeneficiaries) {
    const bens = await fetchAllRows<{ lineage_node_id: string | null }>((from, to) =>
      admin.from('beneficiaries').select('lineage_node_id').not('lineage_node_id', 'is', null).range(from, to))
    for (const b of bens.rows) {
      if (b.lineage_node_id) benCount.set(b.lineage_node_id, (benCount.get(b.lineage_node_id) ?? 0) + 1)
    }
  }

  const rootId = nodes.rows.find(n => !n.parent_id)?.id ?? null
  return { error: null, groups: findSafeMergeGroups(nodes.rows), childCount, nameById, benCount, rootId }
}

export async function GET() {
  if (!(await requirePermission('lineage', 'edit'))) return forbidden()
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const { error, groups, childCount, nameById, benCount } = await loadTree(admin, { withBeneficiaries: true })
  if (error) return NextResponse.json({ error }, { status: 500 })

  const sum = (ids: string[], m: Map<string, number>) => ids.reduce((t, id) => t + (m.get(id) ?? 0), 0)

  // 🔴 פילוח לפי דור — לא קישוט.
  //
  // מספר הקבוצות לבדו אינו אומר אם המצב תקין. אותו סך הכל יכול להיות "כפילויות
  // היסטוריות באבות הקדמונים", שזה בדיוק מה שהמיזוג נועד לנקות, או "ההשלמה
  // האחרונה יצרה עותק לכל נרשם", שזו תקלה שאסור למזג מעליה אלא לתקן במקור.
  // הדורות העמוקים הם דורות הנרשמים; הרדודים הם האבות. הפילוח מפריד ביניהם.
  //
  // הטבלה ממוינת לפי דור, ולכן העמודים הראשונים לעולם אינם מייצגים את הפיזור.
  const perGen = new Map<number, { groups: number; copies: number }>()
  for (const g of groups) {
    const cur = perGen.get(g[0].generation) ?? { groups: 0, copies: 0 }
    cur.groups++
    cur.copies += g.length - 1
    perGen.set(g[0].generation, cur)
  }
  const byGeneration = [...perGen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([generation, v]) => ({ generation, ...v }))

  return NextResponse.json({
    byGeneration,
    stats: {
      groups: groups.length,
      nodesInGroups: groups.reduce((t, g) => t + g.length, 0),
      nodesRemoved: groups.reduce((t, g) => t + g.length - 1, 0),
      childrenMoved: groups.reduce((t, g) => t + sum(g.map(x => x.id), childCount), 0),
      familiesMoved: groups.reduce((t, g) => t + sum(g.map(x => x.id), benCount), 0),
    },
    groups: groups.slice(0, 400).map(g => ({
      name: exactNameKey(g[0].name),
      generation: g[0].generation,
      parentName: g[0].parent_id ? (nameById.get(g[0].parent_id) ?? '—') : 'שורש',
      copies: g.length,
      children: sum(g.map(x => x.id), childCount),
      families: sum(g.map(x => x.id), benCount),
    })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()
  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  const { error, groups, childCount, rootId } = await loadTree(admin)
  if (error) return NextResponse.json({ error }, { status: 500 })
  if (!groups.length) {
    return NextResponse.json({
      merged: 0, removed: 0, children: 0, families: 0, remaining: 0,
      failed: 0, failures: [], summary: 'לא נמצאו קבוצות בטוחות למיזוג.',
    })
  }

  // 🔴 מנה חסומה בגודלה, וברירת מחדל של 150.
  //
  // הרצה על כל 1,501 הקבוצות לא חזרה בכלל: כל מיזוג הוא כמה פניות למסד, וסדרה
  // של אלף וחצי חורגת מתקרת הזמן של הנתיב. גרוע מזה — פריסה חדשה באמצע הורגת
  // את הקונטיינר, והבקשה נקטעת בלי שום סימן במסך. מנה קטנה חוזרת תמיד בזמן,
  // והלקוח חוזר עליה עד הסוף.
  // 🔴 25, לא 100.
  //
  // מנה של 100 רצה 125 שניות והחיבור נסגר עליה (499, "client has closed the
  // request"). המדידה: ~10 שניות קבועות לטעינת העץ בתחילת המנה, ועוד כשנייה
  // לכל מיזוג — חמש פניות ל-Supabase בכל אחד, בהשהיה של מאתיים מילישניות.
  // מנה קטנה חוזרת בפחות מחצי דקה, והלולאה בלקוח סוגרת את הפער.
  const asked = Number(request.nextUrl.searchParams.get('limit') ?? 0)
  const batch = Math.min(Math.max(asked || 25, 1), 200)

  // ⚠️ batchId משותף לכל המנות, ומגיע מהלקוח: מיזוג הוא פעולה אחת מבחינת
  // המשתמש, וביטול צריך להחזיר את כולה. חלוקה למנות לא הייתה מצדיקה איבוד
  // של התכונה הזאת — עשר מנות עם עשרה מזהים היו דורשות עשרה ביטולים.
  const askedBatchId = request.nextUrl.searchParams.get('batch') ?? ''
  const batchId = UUID_RE.test(askedBatchId) ? askedBatchId : randomUUID()

  const targets = groups.slice(0, batch)
  let merged = 0, removed = 0, children = 0, families = 0
  const failures: { name: string; reason: string }[] = []

  // ⚠️ סדרתי: כל מיזוג משנה את העץ (הורות של ילדים מוסבת), ושתי הרצות מקבילות
  // על אותו אב היו קוראות מצב מיושן.
  for (const group of targets) {
    const keepId = pickKeepId(
      group.map(g => ({ id: g.id, name: g.name, parent_id: g.parent_id, generation: g.generation, status: g.status ?? null })),
      childCount,
    )
    const mergeIds = group.map(g => g.id).filter(id => id !== keepId)
    if (!mergeIds.length) continue
    try {
      const res = await mergeWithCascade(admin, {
        keepId, mergeIds, batchId,
        // כל השמות בקבוצה זהים — אין שם לבחור, וזו כל הסיבה שזה בטוח.
        names: {},
        userId: staff.userId,
        cascadeDown: false, cascadeUp: false, cascadeUpApprox: false,
        // ⚠️ ראו ההערה ב-mergeWithCascade: חישוב הדורות סורק את כל הטבלה, והוא
        // רץ פעם אחת בסוף המנה במקום 150 פעם בתוכה. במיזוג בטוח הדורות ממילא
        // אינם משתנים — כל הקבוצה חולקת אב ודור, והצומת שנשאר אינו זז.
        skipRecalc: true,
      })
      merged++
      removed += mergeIds.length
      children += res.reassignedChildren ?? 0
      families += res.reassignedBeneficiaries ?? 0
    } catch (e) {
      failures.push({ name: exactNameKey(group[0].name), reason: e instanceof Error ? e.message : String(e) })
    }
  }

  // ⚠️ נמדד מול הקבוצות שנסרקו בתחילת המנה הזאת. מיזוג יוצר קבוצות *חדשות*
  // דור אחד למטה (ילדים שמתאחדים תחת הורה אחד), ואלה יתגלו רק בסריקה הבאה —
  // ולכן remaining=0 אינו מבטיח שהעץ נקי, אלא רק שהסבב הנוכחי הושלם.
  const remaining = Math.max(0, groups.length - targets.length)

  // ⚠️ רק במנה האחרונה. חישוב הדורות סורק את כל הטבלה — עשר שניות — ובמיזוג
  // בטוח הדורות ממילא אינם משתנים (כל הקבוצה חולקת אב ודור). הרצתו בכל מנה
  // הייתה מוסיפה עשר דקות של המתנה טהורה על פני חמישים מנות, ומחזירה את
  // הבקשות לקצה תקרת הזמן שהפילה אותן.
  if (rootId && remaining === 0 && merged) {
    await recalcGenerations(admin, rootId).catch(e =>
      console.error('[safe-merge] חישוב דורות נכשל:', e instanceof Error ? e.message : e))
  }

  invalidateLineageCache()

  await logActivity(admin, {
    userId: staff.userId,
    action: 'lineage_safe_merge_bulk',
    entityType: 'lineage_node',
    details: { batchId, groups: merged, removed, children, families, failed: failures.length, remaining },
  }).catch(() => {})

  console.log(`[safe-merge] ${merged} קבוצות · הוסרו ${removed} צמתים · ${children} ילדים · ${families} משפחות · כשלים ${failures.length} · נותרו ${remaining}`)
  return NextResponse.json({
    merged, removed, children, families, batchId, remaining,
    failed: failures.length, failures: failures.slice(0, 20),
    summary: `מוזגו ${merged} קבוצות · הוסרו ${removed} עותקים כפולים` +
      (children ? ` · ${children} ילדים הועברו` : '') +
      (families ? ` · ${families} משפחות הועברו` : '') +
      (failures.length ? ` · ${failures.length} נכשלו` : ''),
  })
}
