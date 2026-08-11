// ─────────────────────────────────────────────────────────────────────────────
// "דור אחרון כפול" — נרשם שנתלה כילד של עצמו.
//
// מאיפה זה מגיע: ensureBeneficiaryNode מוודא שלכל נרשם יש צומת. לפני שהוא
// יוצר צומת חדש הוא בודק ב-nodeIsSelf אם הצומת שהנרשם *כבר* מקושר אליו הוא
// הוא עצמו. הבדיקה נשענת על שני סימנים, והשני — שרשרת הייחוס — היה מת
// בייצור: הרישום הציבורי שלף את הנרשם בלי העמודה lineage_chain, ולכן ההשוואה
// נעשתה תמיד מול מחרוזת ריקה. די היה בהבדל ניסוח אחד ("חנה רחל" מול "מנה
// רחל") כדי שהמערכת תסיק "אינו בעץ" ותיצור עותק שני *כילד של עצמו*.
//
// התוצאה בשרשרת של הנרשם: דור 7 "רבי שלמה ומרת חנה רחל עקשטיין", ומתחתיו
// דור 8 שהוא אותו אדם בדיוק. המקור תוקן; כאן מזהים את מה שכבר נוצר.
//
// ⚠️ הזיהוי משתמש ב-nodeIsSelf וב-beneficiaryNodeName של היוצר עצמו, ולא
// בהעתק שלהן. אילו הייתה כאן הגדרה מקבילה של "זה אני", היא הייתה נפרדת מזו
// של היוצר בדיוק כמו ששתי רשימות הערוצים נפרדו — והניקוי היה מפספס בדיוק את
// מה שנוצר.
//
// ⚠️ שתי ראיות נדרשות יחד, ולא אחת:
//   1. צומת האב הוא הנרשם עצמו (nodeIsSelf על שם האב).
//   2. הצומת שהנרשם מקושר אליו נושא בדיוק את השם שהיוצר בונה.
// התנאי השני הוא מה שמבדיל בין העותק שנוצר אוטומטית לבין בן אמיתי ששמו דומה
// לאביו — מצב נפוץ לגמרי בעץ הזה, ומחיקה שלו הייתה מוחקת אדם.
//
// המודול טהור: מקבל שורות ומחזיר סיווג. אין בו גישה למסד ואין בו כתיבה.
// ─────────────────────────────────────────────────────────────────────────────

import { nodeIsSelf, beneficiaryNodeName, type BeneficiaryForNode } from './beneficiaryNode'

export interface SelfDupNode {
  id: string
  name: string
  parent_id: string | null
  generation: number
  status: string | null
  id_number: string | null
}

export interface SelfDupBen extends BeneficiaryForNode {
  id: string
  full_name?: string | null
  family_name?: string | null
  spouse_name?: string | null
}

export interface SelfDupRow {
  /** הכרטסת של הנרשם. */
  benId: string
  benName: string
  benIdNumber: string
  /** הצומת המיותר — זה שהנרשם מקושר אליו כרגע. */
  dupNodeId: string
  dupNodeName: string
  dupGeneration: number
  dupStatus: string | null
  /** הצומת האמיתי של הנרשם — האב, שהוא הוא עצמו. */
  keepNodeId: string
  keepNodeName: string
  keepGeneration: number
  /** האם צומת האב חסר ת"ז, ולכן היא תועבר אליו בתיקון. */
  willCopyIdNumber: boolean
}

/** צומת שזוהה כעותק אך אין לגעת בו — מדווח עם הסיבה. */
export interface SelfDupBlocked extends SelfDupRow {
  guard: string
}

export interface SelfDupScan {
  rows: SelfDupRow[]
  blocked: SelfDupBlocked[]
  total: number
  scannedNodes: number
  scannedBeneficiaries: number
}

const cleanId = (v: unknown) => String(v ?? '').replace(/\D/g, '')
const nameKey = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ')

/** שם תצוגה לכרטסת, כמו בשאר מסכי האבחון. */
export function benLabel(b: SelfDupBen): string {
  return [b.family_name, b.full_name || b.spouse_name].filter(Boolean).join(' ').trim() || 'ללא שם'
}

/**
 * סורק ומחזיר את הנרשמים שנתלו כילד של עצמם.
 *
 * O(n) — מפות מקדימות, בלי השוואת כל-זוג.
 */
export function findSelfDuplicates(nodes: SelfDupNode[], bens: SelfDupBen[]): SelfDupScan {
  const byId = new Map(nodes.map(n => [n.id, n]))

  // כמה ילדים תלויים בכל צומת — סייג ראשון.
  const childCount = new Map<string, number>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    childCount.set(n.parent_id, (childCount.get(n.parent_id) ?? 0) + 1)
  }

  // כמה כרטסות מקושרות לכל צומת — סייג שני.
  const bensOnNode = new Map<string, number>()
  for (const b of bens) {
    if (!b.lineage_node_id) continue
    bensOnNode.set(b.lineage_node_id, (bensOnNode.get(b.lineage_node_id) ?? 0) + 1)
  }

  const rows: SelfDupRow[] = []
  const blocked: SelfDupBlocked[] = []

  for (const b of bens) {
    if (!b.lineage_node_id) continue
    const dup = byId.get(b.lineage_node_id)
    if (!dup || !dup.parent_id) continue
    const keep = byId.get(dup.parent_id)
    if (!keep) continue

    // ראיה 1 — האב הוא הנרשם עצמו.
    if (!nodeIsSelf(b, keep.name)) continue
    // ראיה 2 — הצומת נושא בדיוק את השם שהיוצר בונה לנרשם.
    const built = nameKey(beneficiaryNodeName(b))
    if (!built || nameKey(dup.name) !== built) continue

    const base: SelfDupRow = {
      benId: b.id,
      benName: benLabel(b),
      benIdNumber: cleanId(b.id_number),
      dupNodeId: dup.id,
      dupNodeName: dup.name,
      dupGeneration: dup.generation,
      dupStatus: dup.status,
      keepNodeId: keep.id,
      keepNodeName: keep.name,
      keepGeneration: keep.generation,
      willCopyIdNumber: !!cleanId(b.id_number) && !cleanId(keep.id_number),
    }

    // 🔴 הסייגים. נבדקים אחרי שתי הראיות, כדי שהספירה תשקף רק צמתים שהיו
    // נכנסים לרשימה.
    const kids = childCount.get(dup.id) ?? 0
    if (kids > 0) { blocked.push({ ...base, guard: `תלויים בו ${kids} ילדים בעץ` }); continue }
    const others = (bensOnNode.get(dup.id) ?? 0) - 1
    if (others > 0) { blocked.push({ ...base, guard: `מקושרות אליו עוד ${others} כרטסות` }); continue }

    rows.push(base)
  }

  const bySort = (a: SelfDupRow, b: SelfDupRow) =>
    a.dupGeneration - b.dupGeneration || a.benName.localeCompare(b.benName, 'he')
  rows.sort(bySort)
  blocked.sort(bySort)

  return {
    rows,
    blocked,
    total: rows.length,
    scannedNodes: nodes.length,
    scannedBeneficiaries: bens.length,
  }
}
