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
// תנאי 3 הוא ההוכחה — הצומת נוצר *מתוך* הרשומה הזאת. בלעדיו זו הייתה
// היוריסטיקה על שמות, וכלי שנשען על היוריסטיקה אינו כלי אלא סיכון: היינו
// סופרים גם כל צומת היסטורי או ידני שאין לו כרטסת.
//
// ─── שני צירים, ולא אחד ──────────────────────────────────────────────────────
// המודול הזה מאחד שתי עבודות שנעשו במקביל על אותה בעיה, ומשמר את שתי הזוויות
// מפני שהן אורתוגונליות — אותו צומת יכול להיות בשתיהן בבת אחת:
//
//   · ציר הכרטסת — *איפה הכרטסת של אותה ת"ז*. זה מה שקובע את הטיפול, ולכן
//     הוא הסיווג הראשי (שלוש הקבוצות שלמטה).
//   · ציר התאום — *האם יש אח שהשם המלא שלו מכיל את שמו*. זו ההוכחה שמדובר
//     באותו אדם פעמיים: "רחל לאה מרים" מול "רבי דוד ומרת רחל לאה מרים
//     סינצבנג". הציר הזה מדווח בכל שורה ואינו מחליף את הסיווג.
//
// 🔴 שני סייגים שאין לעבור עליהם, והם *לא* אופטימיזציה אלא הגנה:
//   • צומת שיש לו כרטסת — לא נוגעים. הוא כבר אדם רשום במערכת, גם אם הת"ז
//     שלו מופיעה במקביל בשדה הילדים של הוריו (וזה המצב הנפוץ אחרי שהילד
//     נרשם בעצמו).
//   • צומת שיש לו ילדים בעץ — לא נוגעים. מתחתיו תלוי ענף שלם, וכל טיפול בו
//     מנתק צאצאים אמיתיים. זה נכון גם כשהוא כפילות מובהקת: מישהו נרשם
//     והתחבר אליו מאז.
// שני הסייגים נאכפים כאן, בשכבת הזיהוי, ולא בממשק — כך שאף קורא של המודול
// לא יכול לקבל בטעות רשימה שכוללת אותם. הם *גם* מוחזרים בנפרד (protectedRows)
// עם סיבת ההגנה, כי "למה הצומת הזה לא ברשימה" היא שאלה שחייבת תשובה.
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
  /**
   * ציר התאום: אח שהשם המלא שלו מכיל את שמו של הצומת — כלומר אותו אדם, פעם
   * בשם פרטי כפי שההורה הקליד ופעם בניסוח המלא של העץ. הסימן החזק ביותר לכך
   * שהצומת הזה הוא עותק, והוא בלתי תלוי בשאלה איפה הכרטסת.
   */
  twinNodeId: string | null
  twinName: string | null
  /**
   * האם השם עצמו נראה כמו שורה בשדה הילדים (שם פרטי בלי התארים שהעץ מוסיף).
   * ⚠️ סימן תומך בלבד — ההוכחה היא הת"ז, ולעולם לא השם.
   */
  nameLooksLikeChildRow: boolean
}

/** צומת שעמד בכלל הת"ז אך מוגן — מוחזר עם הסיבה, ולא רק נספר. */
export interface GhostProtectedRow {
  nodeId: string
  nodeName: string
  generation: number
  status: string | null
  idNumber: string
  parentNodeId: string
  parentNodeName: string
  /** למה לא נוגעים בו. */
  guard: string
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
  /** אותם צמתים מוחרגים, עם סיבת ההגנה לכל אחד. */
  protectedRows: GhostProtectedRow[]
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

const normName = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()

/**
 * האם השם הזה נראה כמו שם פרטי בודד כפי שנשמר בשדה הילדים — כלומר בלי
 * התארים שהעץ מוסיף.
 *
 * ⚠️ סימן תומך בלבד; ההוכחה היא הת"ז. שם יכול להיראות "תמים" לגמרי ובכל זאת
 * להיות של אדם אמיתי שנרשם.
 */
export function looksLikeChildName(name: string): boolean {
  const n = normName(name)
  if (!n) return false
  return !/^רבי\s/.test(n) && !n.includes(' ומרת ') && !n.includes(' והרבנית ')
}

/**
 * האם שמו של הצומת *מוכל* בשם המלא של אח — כלומר אותו אדם, פעם בשם פרטי
 * ופעם בניסוח המלא.
 *
 * ⚠️ השוואת מילים ולא מחרוזת: "חנה" מוכל ב"חנה רחל" כמחרוזת, אבל אלו שתי
 * נשים שונות. כאן כל מילות השם הקצר חייבות להופיע *ברצף* בשם הארוך. השוואת
 * מחרוזות הייתה מסמנת אדם אחר כעותק.
 */
export function containedInName(shortName: string, fullName: string): boolean {
  const s = normName(shortName).split(' ').filter(Boolean)
  const f = normName(fullName).split(' ').filter(Boolean)
  if (!s.length || f.length <= s.length) return false
  for (let i = 0; i + s.length <= f.length; i++) {
    if (s.every((w, j) => f[i + j] === w)) return true
  }
  return false
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
 * סורק את העץ ואת הכרטסות ומחזיר את צמתי-הרפאים, מסווגים לשלוש קבוצות
 * ומסומנים בתאום שלהם אם יש.
 *
 * O(n) בצמתים ובכרטסות — נבנות מפות מקדימות ואין השוואת כל-זוג. חשוב: העץ
 * מגיע לאלפי צמתים ולאלפי כרטסות, וסריקה ריבועית כאן הייתה חונקת את הבקשה.
 * ⚠️ חיפוש התאום מוגבל לאחים בלבד (אותו הורה), ולכן הוא O(אחים) ולא O(עץ).
 */
export function findGhostChildren(nodes: GhostNodeRow[], bens: GhostBenRow[]): GhostScan {
  // כמה ילדים יש לכל צומת בעץ, ומי האחים של כל צומת — שני הסייגים וציר התאום.
  const childCount = new Map<string, number>()
  const siblings = new Map<string, GhostNodeRow[]>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    childCount.set(n.parent_id, (childCount.get(n.parent_id) ?? 0) + 1)
    const arr = siblings.get(n.parent_id) ?? []
    arr.push(n)
    siblings.set(n.parent_id, arr)
  }

  const nameById = new Map(nodes.map(n => [n.id, n.name]))

  // צומת → האם יש כרטסת המקושרת אליו (הסייג הראשון).
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
  const protectedRows: GhostProtectedRow[] = []
  const skipped = { withChildren: 0, withCard: 0 }

  for (const n of nodes) {
    const id = normalizeIdNumber(n.id_number)
    if (!id || !n.parent_id) continue

    // התנאי המזהה — הת"ז רשומה בשדה הילדים של כרטסת ההורה.
    const entry = childrenOfNode.get(n.parent_id)?.get(id)
    if (!entry) continue

    const parentNodeName = nameById.get(n.parent_id) ?? '—'

    // 🔴 הסייגים. נבדקים *אחרי* התנאי המזהה כדי שהספירה תשקף רק צמתים
    // שהיו נכנסים לרשימה, ולא כל צומת בעץ. הכרטסת נבדקת ראשונה: כשיש גם
    // כרטסת וגם ילדים, "הוא כבר אדם רשום" היא הסיבה החזקה יותר.
    const kidCount = childCount.get(n.id) ?? 0
    const guard = hasCard.has(n.id) ? 'יש לו כרטסת מקושרת'
      : kidCount > 0 ? `יש לו ${kidCount} ילדים בעץ`
      : null
    if (guard) {
      if (hasCard.has(n.id)) skipped.withCard++
      else skipped.withChildren++
      protectedRows.push({
        nodeId: n.id, nodeName: n.name, generation: n.generation, status: n.status,
        idNumber: id, parentNodeId: n.parent_id, parentNodeName, guard,
      })
      continue
    }

    const owners = cardsByPerson.get(id) ?? []
    // כרטסת שכבר יושבת על צומת אחר גוברת: אם האדם קיים בעץ במקום אחר, הצומת
    // הזה הוא עותק — ולשייך אליו כרטסת שנייה רק יכפיל את הבעיה.
    const linked = owners.find(o => o.lineage_node_id && o.lineage_node_id !== n.id)
    const unlinked = owners.find(o => !o.lineage_node_id)
    const card = linked ?? unlinked ?? null
    const group: GhostGroup = linked ? 'card_elsewhere' : unlinked ? 'card_unlinked' : 'no_card'

    // ציר התאום — אח שהשם המלא שלו מכיל את שמו.
    const twin = (siblings.get(n.parent_id) ?? [])
      .find(s => s.id !== n.id && containedInName(n.name, s.name)) ?? null

    rows.push({
      nodeId: n.id,
      nodeName: n.name,
      generation: n.generation,
      status: n.status,
      idNumber: id,
      group,
      parentNodeId: n.parent_id,
      parentNodeName,
      parentBenId: entry.benId,
      parentBenName: entry.benName,
      childNameInCard: entry.childName,
      cardBenId: card ? card.id : null,
      cardBenName: card ? benDisplayName(card) : null,
      cardNodeId: linked ? linked.lineage_node_id : null,
      twinNodeId: twin ? twin.id : null,
      twinName: twin ? twin.name : null,
      nameLooksLikeChildRow: looksLikeChildName(n.name),
    })
  }

  const bySort = (a: { generation: number; parentNodeName: string; nodeName: string },
                  b: { generation: number; parentNodeName: string; nodeName: string }) =>
    a.generation - b.generation ||
    a.parentNodeName.localeCompare(b.parentNodeName, 'he') ||
    a.nodeName.localeCompare(b.nodeName, 'he')

  rows.sort(bySort)
  protectedRows.sort(bySort)

  const counts: Record<GhostGroup, number> = { no_card: 0, card_unlinked: 0, card_elsewhere: 0 }
  for (const r of rows) counts[r.group]++

  return {
    rows,
    counts,
    total: rows.length,
    skipped,
    protectedRows,
    scannedNodes: nodes.length,
    scannedBeneficiaries: bens.length,
  }
}
