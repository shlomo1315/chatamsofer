// ─────────────────────────────────────────────────────────────────────────────
// צמתי-רפאים: צמתים שנולדו משדה הילדים של כרטסת, ולא מאדם שנרשם.
//
// מאיפה הם מגיעים: כשמשפחה מאושרת, lib/lineageFamilyChildren יוצר צומת בעץ
// לכל ילד שהוזן בשדה הילדים של הכרטסת — עם הת"ז שלו, תחת צומת המשפחה. זה
// נעשה בכוונה (כדי שהילד ימצא את עצמו כשיבוא להירשם, במקום ליצור כפילות),
// אבל התוצאה היא צומת שמייצג *שורה בטופס* ולא אדם שנבדק: השם הוא מה שההורה
// הקליד — לרוב שם פרטי בלבד, בלי שם משפחה ובלי ניסוח — ואיש לא אימת אותו.
//
// הזיהוי כאן הוא צירוף של שלושה תנאים, וכולם נדרשים:
//   1. לצומת יש ת"ז.
//   2. אין כרטסת המקושרת אליו.
//   3. אותה ת"ז מופיעה בשדה הילדים של כרטסת ההורה שלו.
//
// תנאי 3 הוא מה שמבדיל בין "צומת שטרם נרשם" לבין צומת שנוצר אוטומטית: בלעדיו
// היינו סופרים גם כל צומת היסטורי או ידני שאין לו כרטסת.
//
// 🔴 שני סייגים שאין לעבור עליהם, והם *לא* אופטימיזציה אלא הגנה:
//   • צומת שיש לו ילדים בעץ — לא נוגעים. מתחתיו תלוי ענף שלם, וכל טיפול בו
//     מנתק צאצאים אמיתיים.
//   • צומת שיש לו כרטסת — לא נוגעים. הוא כבר אדם רשום במערכת, גם אם הת"ז
//     שלו מופיעה במקביל בשדה הילדים של הוריו (וזה המצב הנפוץ אחרי שהילד
//     נרשם בעצמו).
// שני הסייגים נאכפים כאן, בשכבת הזיהוי, ולא בממשק — כך שאף קורא של המודול
// לא יכול לקבל בטעות רשימה שכוללת אותם.
//
// המודול טהור: מקבל שורות ומחזיר סיווג. אין בו גישה לבסיס הנתונים ואין בו
// שום פעולת כתיבה — הוא משמש מסך אבחון בקריאה בלבד.
// ─────────────────────────────────────────────────────────────────────────────

export interface GhostNodeRow {
  id: string
  name: string
  parent_id: string | null
  generation: number
  status: string | null
  id_number: string | null
}

export interface GhostBenRow {
  id: string
  full_name: string | null
  family_name: string | null
  spouse_name: string | null
  id_number: string | null
  spouse_id_number: string | null
  lineage_node_id: string | null
  /** מערך הילדים כפי שנשמר בכרטסת (jsonb). כל צורה אחרת מתעלמים ממנה. */
  children: unknown
}

/**
 * שלוש הקבוצות — לפי *איפה הכרטסת של אותה ת"ז*. הפילוח הזה נבחר מפני שהוא
 * מה שקובע את הטיפול: לכל קבוצה פעולה אחרת לגמרי, והן מכסות את כל המקרים.
 *
 *  no_card        — אין במערכת שום כרטסת עם הת"ז הזו. הילד לא נרשם מעולם,
 *                   והצומת הוא הד של שורה בטופס של ההורה.
 *  card_unlinked  — יש כרטסת עם הת"ז הזו, והיא אינה משויכת לשום צומת.
 *                   כאן יש מה להציל: הכרטסת אמורה לשבת על הצומת הזה.
 *  card_elsewhere — יש כרטסת עם הת"ז הזו, והיא כבר משויכת לצומת אחר.
 *                   כלומר האדם קיים בעץ פעמיים, והצומת הזה הוא העותק המיותר.
 */
export type GhostGroup = 'no_card' | 'card_unlinked' | 'card_elsewhere'

export interface GhostRow {
  nodeId: string
  nodeName: string
  generation: number
  status: string | null
  idNumber: string
  group: GhostGroup
  /** צומת ההורה — זה שהכרטסת שלו מכילה את הת"ז בשדה הילדים. */
  parentNodeId: string
  parentNodeName: string
  /** הכרטסת שבשדה הילדים שלה נמצאה הת"ז. */
  parentBenId: string
  parentBenName: string
  /** השם כפי שנכתב בשדה הילדים — לרוב שונה משם הצומת, וזו הראיה למקור. */
  childNameInCard: string
  /** הכרטסת של הת"ז עצמה — רק בקבוצות card_unlinked / card_elsewhere. */
  cardBenId: string | null
  cardBenName: string | null
  /** הצומת שאליו הכרטסת הזו כבר משויכת — רק ב-card_elsewhere. */
  cardNodeId: string | null
}

export interface GhostScan {
  rows: GhostRow[]
  counts: Record<GhostGroup, number>
  total: number
  /**
   * צמתים שעמדו בכלל הת"ז אך הוחרגו במפורש. מדווחים אותם כדי שהמספר על המסך
   * יהיה בר-הסבר: "נמצאו X, ועוד Y הושארו בגלל ילדים/כרטסת" — בלי זה נראה
   * כאילו הסריקה פשוט פספסה אותם.
   */
  skipped: { withChildren: number; withCard: number }
  scannedNodes: number
  scannedBeneficiaries: number
}

/**
 * נרמול ת"ז לספרות בלבד — בדיוק כמו cleanId ב-lineageFamilyChildren וכמו
 * beneficiary_child_ids ב-SQL. אחידות הנרמול היא מה שמאפשר להשוות בין ת"ז
 * שנכתבה על הצומת לבין זו שנשמרה בשדה הילדים.
 *
 * ⚠️ מוחזר '' עבור ערך קצר מ-5 ספרות: שורת ילד חלקית ("12", "-") הייתה
 * מתלכדת עם כל שורה חלקית אחרת ומייצרת התאמות שווא. דרכון (אותיות+ספרות)
 * אינו נתמך כאן במכוון — pickChildrenForTree ממילא אינו יוצר צומת עבורו.
 */
export function normalizeIdNumber(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return digits.length >= 5 ? digits : ''
}

/** שם תצוגה לכרטסת — שם משפחה + בעל, כמו בשאר מסכי האבחון. */
export function benDisplayName(b: GhostBenRow): string {
  return [b.family_name, b.full_name || b.spouse_name].filter(Boolean).join(' ').trim() || 'ללא שם'
}

/** ת"ז הילדים בכרטסת, ממופות לשם שנכתב לצידן. */
function childIdsOf(children: unknown): Map<string, string> {
  const out = new Map<string, string>()
  if (!Array.isArray(children)) return out
  for (const raw of children) {
    const row = raw as { id_number?: unknown; name?: unknown } | null
    const id = normalizeIdNumber(row?.id_number)
    if (!id || out.has(id)) continue
    out.set(id, String(row?.name ?? '').trim())
  }
  return out
}

/**
 * סורק את העץ ואת הכרטסות ומחזיר את צמתי-הרפאים, מסווגים לשלוש קבוצות.
 *
 * O(n) בצמתים ובכרטסות — נבנות מפות מקדימות ואין השוואת כל-זוג. חשוב: העץ
 * מגיע לאלפי צמתים ולאלפי כרטסות, וסריקה ריבועית כאן הייתה חונקת את הבקשה.
 */
export function findGhostChildren(nodes: GhostNodeRow[], bens: GhostBenRow[]): GhostScan {
  // כמה ילדים יש לכל צומת בעץ — הסייג הראשון.
  const childCount = new Map<string, number>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    childCount.set(n.parent_id, (childCount.get(n.parent_id) ?? 0) + 1)
  }

  const nameById = new Map(nodes.map(n => [n.id, n.name]))

  // צומת → האם יש כרטסת המקושרת אליו (הסייג השני).
  const hasCard = new Set<string>()
  // צומת הורה → { ת"ז הילד : פרטי הכרטסת שבה הוא רשום }.
  const childrenOfNode = new Map<string, Map<string, { benId: string; benName: string; childName: string }>>()
  // ת"ז → הכרטסות שנושאות אותה (בעל או אשה).
  const cardsByPerson = new Map<string, GhostBenRow[]>()

  for (const b of bens) {
    if (b.lineage_node_id) hasCard.add(b.lineage_node_id)

    for (const raw of [b.id_number, b.spouse_id_number]) {
      const id = normalizeIdNumber(raw)
      if (!id) continue
      const arr = cardsByPerson.get(id) ?? []
      // אותה כרטסת יכולה לשאת את אותה ת"ז פעמיים (בעל=אשה, שגיאת הקלדה) —
      // נספרת פעם אחת, אחרת "יש לו כרטסת" היה נראה כשתי כרטסות שונות.
      if (!arr.some(x => x.id === b.id)) arr.push(b)
      cardsByPerson.set(id, arr)
    }

    // ⚠️ רק כרטסת שמשויכת לצומת יכולה להיות "כרטסת ההורה": בלי שיוך אין
    // שום קשר בין הילדים שבה לבין מקום כלשהו בעץ.
    if (!b.lineage_node_id) continue
    const kids = childIdsOf(b.children)
    if (!kids.size) continue
    const bucket = childrenOfNode.get(b.lineage_node_id) ?? new Map()
    for (const [id, childName] of kids) {
      // כמה כרטסות על אותו צומת — הראשונה קובעת, כדי שהתוצאה תהיה יציבה.
      if (!bucket.has(id)) bucket.set(id, { benId: b.id, benName: benDisplayName(b), childName })
    }
    childrenOfNode.set(b.lineage_node_id, bucket)
  }

  const rows: GhostRow[] = []
  const skipped = { withChildren: 0, withCard: 0 }

  for (const n of nodes) {
    const id = normalizeIdNumber(n.id_number)
    if (!id || !n.parent_id) continue

    // התנאי המזהה — הת"ז רשומה בשדה הילדים של כרטסת ההורה.
    const entry = childrenOfNode.get(n.parent_id)?.get(id)
    if (!entry) continue

    // 🔴 הסייגים. נבדקים *אחרי* התנאי המזהה כדי שהספירה תשקף רק צמתים
    // שהיו נכנסים לרשימה, ולא כל צומת בעץ.
    if ((childCount.get(n.id) ?? 0) > 0) { skipped.withChildren++; continue }
    if (hasCard.has(n.id)) { skipped.withCard++; continue }

    const owners = cardsByPerson.get(id) ?? []
    // כרטסת שכבר יושבת על צומת אחר גוברת: אם האדם קיים בעץ במקום אחר, הצומת
    // הזה הוא עותק — ולשייך אליו כרטסת שנייה רק יכפיל את הבעיה.
    const linked = owners.find(o => o.lineage_node_id && o.lineage_node_id !== n.id)
    const unlinked = owners.find(o => !o.lineage_node_id)
    const card = linked ?? unlinked ?? null
    const group: GhostGroup = linked ? 'card_elsewhere' : unlinked ? 'card_unlinked' : 'no_card'

    rows.push({
      nodeId: n.id,
      nodeName: n.name,
      generation: n.generation,
      status: n.status,
      idNumber: id,
      group,
      parentNodeId: n.parent_id,
      parentNodeName: nameById.get(n.parent_id) ?? '—',
      parentBenId: entry.benId,
      parentBenName: entry.benName,
      childNameInCard: entry.childName,
      cardBenId: card ? card.id : null,
      cardBenName: card ? benDisplayName(card) : null,
      cardNodeId: linked ? linked.lineage_node_id : null,
    })
  }

  rows.sort((a, b) =>
    a.generation - b.generation ||
    a.parentNodeName.localeCompare(b.parentNodeName, 'he') ||
    a.nodeName.localeCompare(b.nodeName, 'he'))

  const counts: Record<GhostGroup, number> = { no_card: 0, card_unlinked: 0, card_elsewhere: 0 }
  for (const r of rows) counts[r.group]++

  return {
    rows,
    counts,
    total: rows.length,
    skipped,
    scannedNodes: nodes.length,
    scannedBeneficiaries: bens.length,
  }
}
