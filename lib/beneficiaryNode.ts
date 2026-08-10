// כל נרשם מקבל צומת בעץ הדורות — מיד, בסטטוס "ממתין לאישור".
//
// 🔴 הפער שזה סוגר: עד כה צומת לנרשם נוצר *רק* אם הוא הוסיף דורות ידנית
// בטופס (lineage_new_nodes). מי שמצא את אביו כבר מאומת בעץ ולא הוסיף כלום —
// לא קיבל צומת בכלל. הוא נשמר ככרטסת שמקושרת לצומת האב, ולכן בעץ לא היה לו
// שום ייצוג: עומדים על האב, ורואים "פתיחת הכרטסת" במקום את הצאצאים עצמם.
//
// זו הסיבה שהמנהל דיווח "יש צאצאים שרשומים ולא מופיעים בעץ" — הם באמת לא היו
// שם, אבל לא בגלל תקלת ציור אלא בגלל שמעולם לא נוצר להם צומת.
//
// ⚠️ בנוסף היה כלל שני: ילדי משפחה נכנסו לעץ רק ברגע *אישור* המשפחה
// (lib/lineageFamilyChildren). כאן אין תלות באישור — הצומת נוצר בסטטוס
// 'pending' ברגע הרישום, כמו כל צומת אחר שממתין לאימות.
import type { SupabaseClient } from '@supabase/supabase-js'
import { composeLineageName } from './lineageNameFormat'
import { childRelation } from './lineageFamilyChildren'
import { autoMergeKey } from './lineageMerge'

export interface BeneficiaryForNode {
  id: string
  id_number?: string | null
  full_name?: string | null
  spouse_name?: string | null
  family_name?: string | null
  gender?: string | null
  lineage_node_id?: string | null
}

export type EnsureResult =
  | { ok: true; nodeId: string; created: boolean; adopted: boolean }
  | { ok: false; reason: string }

const cleanId = (v: unknown) => String(v ?? '').replace(/\D/g, '')

/** שם הצומת של הנרשם, בניסוח האחיד של העץ ("רבי X ומרת Y שם-משפחה"). */
export function beneficiaryNodeName(ben: BeneficiaryForNode): string {
  return composeLineageName({
    husband: ben.full_name ?? '',
    wife: ben.spouse_name ?? '',
    family: ben.family_name ?? '',
  })
}

/**
 * מוודא שלנרשם יש צומת משלו בעץ, ומקשר אותו אליו.
 *
 * הסדר חשוב, וכל שלב מונע כפילות אחרת:
 *  1. הצומת שהוא מקושר אליו הוא כבר *שלו* (לפי ת"ז) → אין מה לעשות.
 *  2. קיים צומת עם הת"ז שלו במקום אחר בעץ → מקשרים אליו (הוא נכנס כילד
 *     כשמשפחת הוריו אושרה, וזה בדיוק אותו אדם).
 *  3. קיים צומת בשם זהה תחת אותו אב → מאמצים אותו ומסמנים עליו את הת"ז.
 *  4. אחרת — צומת חדש בסטטוס 'pending'.
 *
 * ⚠️ אינו נוגע ב-status של צומת קיים: אימוץ צומת מאומת לא יוריד אותו ל"ממתין",
 * ואישור אינו ניתן כאן אוטומטית — הסטטוס הוא החלטה של הצוות בלבד.
 *
 * ⚠️ בטוח מפני מעגלים: צומת חדש נוצר תמיד כעלה תחת האב הקיים, ואימוץ אינו
 * משנה parent_id של אף צומת. ראו lib/lineageForest למה מעגל כאן היה הרסני.
 *
 * best-effort — הקורא לא אמור להפיל רישום בגלל כשל כאן.
 */
export async function ensureBeneficiaryNode(
  db: SupabaseClient, ben: BeneficiaryForNode,
): Promise<EnsureResult> {
  const parentId = ben.lineage_node_id
  if (!parentId) return { ok: false, reason: 'אין שיוך לעץ' }

  const myId = cleanId(ben.id_number)
  const name = beneficiaryNodeName(ben)
  if (!name) return { ok: false, reason: 'אין שם לבניית צומת' }

  const { data: parent } = await db.from('lineage_nodes')
    .select('id, generation, id_number').eq('id', parentId).maybeSingle()
  if (!parent) return { ok: false, reason: 'צומת האב אינו קיים' }

  // 1) הצומת שהוא מקושר אליו הוא כבר שלו — אידמפוטנטי, וזה המצב אחרי הרצה
  //    ראשונה או אחרי רישום שכן הוסיף דורות ידנית.
  if (myId && cleanId((parent as { id_number?: string | null }).id_number) === myId) {
    return { ok: true, nodeId: parent.id as string, created: false, adopted: false }
  }

  // 2) הת"ז שלו קיימת כבר בעץ במקום אחר
  if (myId) {
    const { data: mine } = await db.from('lineage_nodes')
      .select('id').eq('id_number', myId).limit(1).maybeSingle()
    if (mine?.id) {
      await db.from('beneficiaries').update({ lineage_node_id: mine.id }).eq('id', ben.id)
      return { ok: true, nodeId: mine.id as string, created: false, adopted: true }
    }
  }

  // 3) שם זהה תחת אותו אב — מאמצים במקום ליצור כפילות
  const key = autoMergeKey(name)
  if (key) {
    const { data: siblings } = await db.from('lineage_nodes')
      .select('id, name, id_number').eq('parent_id', parent.id)
    const twin = (siblings ?? []).find(s => autoMergeKey(String((s as { name: string }).name)) === key)
    if (twin) {
      const tid = (twin as { id: string }).id
      if (myId && !cleanId((twin as { id_number?: string | null }).id_number)) {
        await db.from('lineage_nodes').update({ id_number: myId }).eq('id', tid)
      }
      await db.from('beneficiaries').update({ lineage_node_id: tid }).eq('id', ben.id)
      return { ok: true, nodeId: tid, created: false, adopted: true }
    }
  }

  // 4) צומת חדש — ממתין לאישור, כמו כל צומת שטרם אומת
  const { data: node, error } = await db.from('lineage_nodes').insert({
    name,
    parent_id: parent.id,
    generation: Number((parent as { generation?: number }).generation ?? 0) + 1,
    relation: childRelation(ben.gender),
    status: 'pending',
    id_number: myId || null,
  }).select('id').single()
  if (error || !node?.id) return { ok: false, reason: error?.message ?? 'יצירת הצומת נכשלה' }

  await db.from('beneficiaries').update({ lineage_node_id: node.id }).eq('id', ben.id)
  return { ok: true, nodeId: node.id as string, created: true, adopted: false }
}
