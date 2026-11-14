// ─────────────────────────────────────────────────────────────────────────────
// תיקון דור באמצע השרשרת — חיבור הדורות שמתחת לצומת החדש *בעץ*.
//
// 🔴 הבאג (13.11): תיקון דור 3 כשיש דורות 4–5 שמר רק את lineage_chain והשאיר
// את lineage_node_id על העלה הישן. הכרטסת מציגה את המסלול בעץ מהעלה, ו-lineageSync
// מחשב מחדש את השרשרת מהעץ — ולכן אחרי רענון חזר הסדר הישן, כאילו לא נשמר.
//
// הפתרון: העץ נשאר מקור האמת. הדורות שמתחת לדור שתוקן נבנים מחדש תחת הצומת
// החדש — שם קיים תחת אותו אב ממוחזר (appendManualGenerations), וחסר נוצר בסטטוס
// "ממתין". הצאצא משויך לעלה החדש, והשרשרת נגזרת מהמסלול הזה.
// ⚠️ לא מזיזים את הצמתים הישנים: הם עשויים לשמש צאצאים אחרים.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js'
import { appendManualGenerations } from './lineageFixApply'

export type ChainEntry = { generation: number; name: string; relation: string | null }
type Anchor = { id: string; generation: number }

/**
 * מחבר את הדורות שבשרשרת מתחת ל-anchor כענף בעץ תחתיו.
 * מחזיר את מזהה העלה ואת הדורות שמתחת לעוגן כפי שהם בעץ (לשרשרת השמורה).
 */
export async function attachGenerationsBelow(
  db: SupabaseClient,
  anchor: Anchor,
  chain: ChainEntry[],
): Promise<{ leafId: string; below: ChainEntry[] }> {
  const rest = chain
    .filter(e => e.generation > anchor.generation)
    .sort((a, b) => a.generation - b.generation)
  if (!rest.length) return { leafId: anchor.id, below: [] }

  const { lastId } = await appendManualGenerations(db, anchor, rest)

  // הליכה מהעלה עד העוגן — הצמתים שמוחזרו או נוצרו, בשמות שלהם בעץ.
  const below: ChainEntry[] = []
  let cur: string | null = lastId
  const seen = new Set<string>()
  while (cur && cur !== anchor.id && !seen.has(cur)) {
    seen.add(cur)
    const { data } = await db.from('lineage_nodes')
      .select('id, name, parent_id, generation, relation').eq('id', cur).maybeSingle()
    if (!data) break
    const n = data as { name: string; parent_id: string | null; generation: number; relation: string | null }
    below.unshift({ generation: n.generation, name: n.name, relation: n.relation })
    cur = n.parent_id
  }
  return { leafId: lastId, below }
}
