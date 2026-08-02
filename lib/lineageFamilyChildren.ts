import type { SupabaseClient } from '@supabase/supabase-js'
import { autoMergeKey } from './lineageMerge'

// ─────────────────────────────────────────────────────────────────────────────
// אישור משפחה → הילדים שלה נכנסים לעץ הדורות כמאושרים.
//
// הבעיה שזה פותר: משפחה שאושרה הזינה בטופס את כל ילדיה, עם שם ות"ז. הילדים
// האלה מיוחסים בדיוק כמו הוריהם — היחוס שלהם *הוא* היחוס של המשפחה שאושרה —
// אבל הם לא היו קיימים בעץ כלל. התוצאה: כשילד בא להירשם הוא לא מצא את עצמו
// ברשימה, יצר לעצמו צומת "ממתין" חדש, ומישהו נדרש לאשר שוב את מה שכבר אושר.
// במאות משפחות זו עבודה כפולה בלי סוף — ומקור מרכזי לכפילויות בעץ.
//
// לכן ברגע שמשפחה מאושרת, כל ילד שהוזן עם ת"ז מקבל צומת מאושר תחת צומת
// המשפחה. כשהילד יבוא להירשם הוא יבחר את עצמו מהרשימה (הרשימה מציגה צמתים
// מאומתים בלבד), וכשמשפחתו שלו תאושר — גם ילדיו ייכנסו כמאושרים. וכן הלאה.
//
// ⚠️ הת"ז היא המפתח, לא השם: אישור חוזר של אותה משפחה לא ייצור את אותו ילד
// פעמיים, גם אם שמו נכתב בינתיים אחרת (תואר, שם נישואין, ניסוח).
// ─────────────────────────────────────────────────────────────────────────────

export interface FamilyChild {
  name?: string | null
  id_number?: string | null
  gender?: string | null
  /** ת"ז (ברירת מחדל) או דרכון — ילד שנולד בחו"ל נרשם בדרכון */
  id_doc_type?: 'id' | 'passport' | string | null
}

export interface ChildForTree {
  name: string
  idNumber: string
  relation: 'son' | 'son_in_law' | null
}

const cleanId = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/**
 * הקשר של הילד להורה בעץ.
 * בן → 'son'. בת → 'son_in_law': השושלת ממשיכה דרך בעלה, וזה הסימון שהעץ
 * משתמש בו לצאצא דרך הבת. מין לא ידוע → null, ולא ניחוש.
 */
export function childRelation(gender?: string | null): 'son' | 'son_in_law' | null {
  const g = String(gender ?? '').trim()
  if (g === 'male' || g === 'בן' || g === 'זכר') return 'son'
  if (g === 'female' || g === 'בת' || g === 'נקבה') return 'son_in_law'
  return null
}

/**
 * הילדים שראויים להיכנס לעץ: שם + ת"ז בת 9 ספרות, בלי כפילות ת"ז.
 * ⚠️ ילד בלי ת"ז אינו נכנס: הת"ז מבדילה בין "ילד שהוזן במלואו" לבין שורה
 * חלקית שנשארה בטופס, והיא גם המפתח שמונע יצירה כפולה באישור הבא.
 */
export function pickChildrenForTree(children: unknown): ChildForTree[] {
  if (!Array.isArray(children)) return []
  const seen = new Set<string>()
  const out: ChildForTree[] = []
  for (const raw of children as FamilyChild[]) {
    const name = String(raw?.name ?? '').trim()
    // דרכון נשמר כפי שהוזן (אותיות וספרות); ת"ז — ספרות בלבד, 9 בדיוק.
    const passport = raw?.id_doc_type === 'passport'
    const idNumber = passport ? String(raw?.id_number ?? '').trim() : cleanId(raw?.id_number)
    const ok = passport ? idNumber.length >= 4 : idNumber.length === 9
    if (!name || !ok || seen.has(idNumber)) continue
    seen.add(idNumber)
    out.push({ name, idNumber, relation: childRelation(raw?.gender) })
  }
  return out
}

export interface ChildSyncResult {
  created: number
  verified: number
  linked: number
}

/**
 * מכניס/מאשר בעץ את ילדי המשפחה שאושרה.
 *
 * לכל ילד:
 *  • קיים צומת עם אותה ת"ז        → מוודאים שהוא מאומת.
 *  • קיים צומת בשם זהה תחת ההורה → מסמנים עליו את הת"ז ומאמתים (בלי כפילות).
 *  • אחרת                         → נוצר צומת חדש, מאומת.
 *
 * best-effort לחלוטין: כשל כאן אינו מפיל את אישור המשפחה עצמו.
 */
export async function syncApprovedFamilyChildren(
  db: SupabaseClient,
  parentNodeId: string,
  children: unknown,
): Promise<ChildSyncResult> {
  const result: ChildSyncResult = { created: 0, verified: 0, linked: 0 }
  const list = pickChildrenForTree(children)
  if (!list.length) return result

  const { data: parent } = await db
    .from('lineage_nodes')
    .select('id, generation')
    .eq('id', parentNodeId)
    .maybeSingle()
  if (!parent) return result
  const childGen = Number((parent as { generation?: number }).generation ?? 0) + 1

  const { data: siblingsRaw } = await db
    .from('lineage_nodes')
    .select('id, name, status, id_number')
    .eq('parent_id', parentNodeId)
  const siblings = (siblingsRaw ?? []) as { id: string; name: string; status: string | null; id_number: string | null }[]

  const byIdNumber = new Map<string, { id: string; status: string | null }>()
  const byName = new Map<string, { id: string; status: string | null }>()
  for (const s of siblings) {
    const sid = cleanId(s.id_number)
    if (sid) byIdNumber.set(sid, s)
    const key = autoMergeKey(s.name)
    if (key && !byName.has(key)) byName.set(key, s)
  }

  for (const child of list) {
    // ⚠️ ייתכן שהילד כבר נמצא בעץ *במקום אחר* (הוא נרשם בעצמו ושויך לענף).
    // אז אין מה ליצור — רק לוודא שהוא מאומת.
    const { data: elsewhere } = await db
      .from('lineage_nodes')
      .select('id, status')
      .eq('id_number', child.idNumber)
      .limit(1)
      .maybeSingle()

    const existing = byIdNumber.get(child.idNumber)
      ?? (elsewhere as { id: string; status: string | null } | null)
      ?? byName.get(autoMergeKey(child.name))

    if (existing) {
      const updates: Record<string, unknown> = {}
      if ((existing.status ?? 'verified') !== 'verified') updates.status = 'verified'
      if (!byIdNumber.has(child.idNumber)) updates.id_number = child.idNumber
      if (!Object.keys(updates).length) continue
      const { error } = await db.from('lineage_nodes').update(updates).eq('id', existing.id)
      if (error) { console.error('[lineageFamilyChildren] update child node:', error.message); continue }
      if (updates.status) result.verified++
      if (updates.id_number) result.linked++
      continue
    }

    const { error } = await db.from('lineage_nodes').insert({
      name: child.name,
      parent_id: parentNodeId,
      generation: childGen,
      relation: child.relation,
      status: 'verified',
      id_number: child.idNumber,
    })
    if (error) { console.error('[lineageFamilyChildren] insert child node:', error.message); continue }
    result.created++
  }

  return result
}

/**
 * אותו דבר, אבל מתוך מזהה הצאצא: טוען את הצומת והילדים ומריץ את הסנכרון.
 * מחזיר null כשאין לצאצא צומת בעץ (אין לאן להוסיף).
 */
export async function syncChildrenOfBeneficiary(
  db: SupabaseClient,
  beneficiaryId: string,
): Promise<ChildSyncResult | null> {
  const { data: ben } = await db
    .from('beneficiaries')
    .select('id, lineage_node_id, children')
    .eq('id', beneficiaryId)
    .maybeSingle()
  const nodeId = (ben as { lineage_node_id?: string | null } | null)?.lineage_node_id
  if (!nodeId) return null
  return syncApprovedFamilyChildren(db, nodeId, (ben as { children?: unknown }).children)
}
