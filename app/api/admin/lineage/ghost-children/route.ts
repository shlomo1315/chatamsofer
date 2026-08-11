import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { findGhostChildren, type GhostNodeRow, type GhostBenRow } from '@/lib/ghostChildren'

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
    scannedNodes: scan.scannedNodes,
    scannedBeneficiaries: scan.scannedBeneficiaries,
    truncated: scan.total > rows.length,
    maxRowsPerGroup: MAX_ROWS_PER_GROUP,
    restricted: !canSeeBeneficiaries,
  })
}
