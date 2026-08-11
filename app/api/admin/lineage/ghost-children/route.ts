import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { invalidateLineageCache } from '@/lib/lineageSync'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { findGhostChildren, isProvenDuplicate, type GhostNodeRow, type GhostBenRow } from '@/lib/ghostChildren'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// ─────────────────────────────────────────────────────────────────────────────
// סריקת צמתי-הרפאים — צמתים שנוצרו משדה הילדים של כרטסת ולא מאדם שנרשם.
//
// 🔴 קריאה בלבד. הנתיב אינו כותב דבר, גם לא סטטוס. הוא נועד להציג מספרים
// שאפשר לסמוך עליהם *לפני* שמחליטים מה לעשות איתם — הביצוע, אם וכאשר, ייכתב
// בנתיב נפרד עם אישור מפורש.
//
// הזיהוי והסיווג לשלוש הקבוצות נמצאים ב-lib/ghostChildren, מכוסים בבדיקות.
// כאן רק השליפה, ההרשאות, וקיצוץ התשובה לגודל שאפשר לשלוח לדפדפן.
// ─────────────────────────────────────────────────────────────────────────────

// תקרת שורות *לכל קבוצה* בתשובה. הספירה המלאה מוחזרת תמיד ואינה מקוצצת —
// המסך מציג "מוצגות 300 מתוך X" ולא מספר חלקי שנראה כמו הסך הכל.
const MAX_ROWS_PER_GROUP = 300

export async function GET() {
  if (!(await requirePermission('lineage', 'edit'))) return forbidden()

  // ⚠️ אבטחה, באותה מדיניות כמו /api/admin/lineage/health: המסך הזה בנוי כולו
  // סביב ת"ז ושמות משפחה — PII. 'lineage' ו-'beneficiaries' הן הרשאות נפרדות,
  // ואיש צוות עם הרשאת עריכת-עץ בלבד אינו אמור לראות ת"ז של משפחות. לכן
  // המספרים מוצגים לכולם, והפרטים המזהים רק למי שרשאי לצפות במשפחות.
  const canSeeBeneficiaries = !!(await requirePermission('beneficiaries', 'view'))

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // ⚠️ שליפה בדפים ולא .limit(): PostgREST חותך ב-1000 שורות בלי שגיאה, והתוצאה
  // הייתה מספר חלקי שנראה מלא — בדיוק מה שאסור במסך שנועד לאשר מספרים.
  // ⚠️ children נשלף במלואו, וזה השדה הכבד בבקשה. אין דרך לעקוף אותו: הוא
  // התנאי המזהה עצמו, והסינון עליו חייב לקרות אחרי ההצלבה מול הצמתים.
  const [nodes, bens] = await Promise.all([
    fetchAllRows<GhostNodeRow>((from, to) =>
      admin.from('lineage_nodes')
        .select('id, name, parent_id, generation, status, id_number').range(from, to)),
    fetchAllRows<GhostBenRow>((from, to) =>
      admin.from('beneficiaries')
        .select('id, full_name, family_name, spouse_name, id_number, spouse_id_number, lineage_node_id, children')
        .range(from, to)),
  ])
  if (nodes.error) return NextResponse.json({ error: `טעינת העץ נכשלה: ${nodes.error}` }, { status: 500 })
  if (bens.error) return NextResponse.json({ error: `טעינת הכרטסות נכשלה: ${bens.error}` }, { status: 500 })

  const scan = findGhostChildren(nodes.rows, bens.rows)

  // קיצוץ לכל קבוצה בנפרד — אחרת קבוצה גדולה אחת הייתה בולעת את המכסה
  // ומסתירה לגמרי את שתי האחרות.
  const perGroup = { no_card: 0, card_unlinked: 0, card_elsewhere: 0 }
  const rows = scan.rows
    .filter(r => ++perGroup[r.group] <= MAX_ROWS_PER_GROUP)
    // הסתרת PII למי שאינו רשאי לצפות במשפחות: הת"ז והמעברים לכרטסות יורדים,
    // שמות הצמתים נשארים — הם נתוני עץ, וזו ההרשאה שכבר יש לו. שם התאום הוא
    // שם צומת ולכן נשאר, מאותה סיבה בדיוק.
    .map(r => canSeeBeneficiaries ? r : {
      ...r,
      idNumber: '',
      parentBenId: '',
      parentBenName: '',
      childNameInCard: '',
      cardBenId: null,
      cardBenName: null,
    })

  // הצמתים המוגנים — מוחזרים כדי ש"למה הצומת הזה לא ברשימה" תהיה שאלה עם
  // תשובה, ולא רק מספר. מקוצצים באותה מכסה ועוברים אותו מיסוך.
  const protectedRows = scan.protectedRows
    .slice(0, MAX_ROWS_PER_GROUP)
    .map(r => canSeeBeneficiaries ? r : { ...r, idNumber: '' })

  return NextResponse.json({
    rows,
    counts: scan.counts,
    total: scan.total,
    skipped: scan.skipped,
    protectedRows,
    protectedTotal: scan.protectedRows.length,
    // כמה מתוך הרשימה הם עותקים מוכחים — כלומר כמה באמת ניתן להסיר.
    removableTotal: scan.rows.filter(isProvenDuplicate).length,
    scannedNodes: scan.scannedNodes,
    scannedBeneficiaries: scan.scannedBeneficiaries,
    truncated: scan.total > rows.length,
    maxRowsPerGroup: MAX_ROWS_PER_GROUP,
    restricted: !canSeeBeneficiaries,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// הסרת עותקים מוכחים.
//
// 🔴 מסירים *רק* צומת שהוכח שהאדם שלו כבר קיים בעץ — יש לו תאום, או שכרטסתו
// יושבת על צומת אחר. צומת בלי כרטסת ובלי תאום נשאר: הוא נוצר בכוונה כדי
// שהילד ימצא את עצמו כשיירשם, והסרתו תיצור בדיוק את הכפילות שהמנגנון מונע.
//
// ⚠️ ההסרה היא מחיקה ולא מיזוג, וזה בטוח דווקא בגלל הסייגים של הסריקה: צומת
// שנכנס לרשימה הוכח כחסר ילדים וחסר כרטסת. אין מה להעביר ממנו לאף מקום.
//
// 🔴 סריקה מחדש בשרת. מזהים מהלקוח הם בחירה ולא הוכחה — העץ זז בין הסריקה
// ללחיצה, וצומת שצבר בינתיים ילד או כרטסת נדחה כאן.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const staff = await requirePermission('lineage', 'edit')
  if (!staff) return forbidden()

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const wanted: string[] = Array.isArray(body?.nodeIds) ? body.nodeIds.map(String) : []
  if (!wanted.length) return NextResponse.json({ error: 'לא נבחרו צמתים' }, { status: 400 })

  const [nodes, bens] = await Promise.all([
    fetchAllRows<GhostNodeRow>((from, to) =>
      admin.from('lineage_nodes')
        .select('id, name, parent_id, generation, status, id_number').range(from, to)),
    fetchAllRows<GhostBenRow>((from, to) =>
      admin.from('beneficiaries')
        .select('id, full_name, family_name, spouse_name, id_number, spouse_id_number, lineage_node_id, children')
        .range(from, to)),
  ])
  if (nodes.error || bens.error) {
    return NextResponse.json({ error: 'טעינת הנתונים נכשלה' }, { status: 500 })
  }

  const scan = findGhostChildren(nodes.rows, bens.rows)
  const eligible = new Map(scan.rows.filter(isProvenDuplicate).map(r => [r.nodeId, r]))
  const targets = wanted.filter(id => eligible.has(id))
  const rejected = wanted.length - targets.length

  let removed = 0
  const failures: { name: string; reason: string }[] = []

  // ⚡ מחיקה במנות ולא שורה-אחר-שורה. מחיקה סדרתית של עשרות צמתים היא עשרות
  // סבבי רשת רצופים, ובמסך המקביל הדפדפן כבר ניתק אחרי 30 שניות והציג
  // "שגיאת רשת" בזמן שהשרת דווקא סיים — תיקון שנראה כאילו נכשל והצליח.
  //
  // ⚠️ בטוח *בזכות* הסייגים: כל צומת ברשימה הוכח כעלה בלי כרטסת. לכן אף צומת
  // ברשימה אינו האב של אחר, ואין שתי מחיקות שמשפיעות זו על תקפותה של זו.
  const CHUNK = 50
  for (let i = 0; i < targets.length; i += CHUNK) {
    const batch = targets.slice(i, i + CHUNK)
    const { error } = await admin.from('lineage_nodes').delete().in('id', batch)
    if (error) {
      for (const id of batch) failures.push({ name: eligible.get(id)!.nodeName, reason: error.message })
    } else {
      removed += batch.length
    }
  }

  if (removed) invalidateLineageCache()

  await logActivity(admin, {
    userId: staff.userId,
    action: 'lineage_ghost_duplicate_remove',
    entityType: 'lineage_node',
    details: { requested: wanted.length, removed, rejected, failed: failures.length },
  }).catch(() => {})

  console.log(`[ghost-children] הוסרו ${removed} עותקים · נדחו ${rejected} · כשלים ${failures.length}`)

  return NextResponse.json({
    removed, rejected,
    failures: failures.slice(0, 20),
    remaining: scan.rows.filter(isProvenDuplicate).length - removed,
  })
}
