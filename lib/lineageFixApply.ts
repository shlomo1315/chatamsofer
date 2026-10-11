// ─────────────────────────────────────────────────────────────────────────────
// החלת תיקון סדר דורות — משותף לתיקון ייחוס בפורטל ולקישור תיקון סדר הדורות.
//
// 🔴 קישור התיקון (11.10, החלטת המשתמש): התיקון נכנס *מיד*, כאילו המשפחה
// נרשמה מחדש עם הסדר המתוקן, והכרטסת חוזרת ל"ממתין לאישור ראשוני" — אבל רק
// כש-5 הדורות הראשונים תקינים. אחרת הבקשה נכנסת לתור הצוות כמו קודם.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js'
import { EARLY_DEPTH } from './lineageDeviation'
import { normalizeLineageNodeName, lineageIdentityKey } from './lineageNameFormat'
import type { ApprovedRefTreeLookup } from './lineageApprovedRef'

export type EarlyCheck = { ok: true } | { ok: false; generation: number }

/**
 * האם 5 הדורות הראשונים בשרשרת המוצעת תקינים.
 *
 * @param path        המסלול בעץ מהשורש (דור 1) ועד העוגן — הדור העמוק ביותר שנבחר מהרשימה.
 *
 * 🔴 שלושה תנאים:
 *   1. כל דור 2–5 במסלול — בקובץ המאושר, באותו דור ותחת אותו הורה.
 *   2. אף דור 2–5 לא הוקלד ידנית — מה שאינו בעץ אינו בקובץ.
 *   3. הנמען עצמו אינו דור 5 ומטה — אין אדם חי שהוא נכד-נין של החתם סופר.
 * ⚠️ דור 1 הוא השורש — שמו בעץ שונה מהקובץ ("מרן ... זי"ע"), ואינו נבדק.
 */
export function earlyGenerationsCheck(
  path: { name: string; generation: number }[],
  approved: ApprovedRefTreeLookup,
): EarlyCheck {
  for (let i = 1; i < path.length; i++) {
    const g = path[i]
    if (g.generation > EARLY_DEPTH) break
    if (!approved(g.name, g.generation, path[i - 1].name)) return { ok: false, generation: g.generation }
  }
  const anchorGen = path.length ? path[path.length - 1].generation : 1
  // הדור הראשון שאינו מגיע מהעץ — ידני או הנמען עצמו.
  const firstOutside = anchorGen + 1
  if (firstOutside <= EARLY_DEPTH) return { ok: false, generation: firstOutside }
  return { ok: true }
}

/**
 * הוספת הדורות שהוקלדו ידנית מתחת לעוגן, בסטטוס "ממתין".
 *
 * ⚠️ שם קיים תחת אותו אב ממוחזר (לפי מפתח זהות שמתעלם מתארים וברכות) —
 * אחרת כל תיקון יצר עותק נוסף של אותו אדם. מאושר מקבל עדיפות.
 * מחזיר את מזהה הצומת האחרון (העמוק ביותר).
 */
export async function appendManualGenerations(
  admin: SupabaseClient,
  anchor: { id: string; generation: number },
  newNodes: { name?: string; relation?: string | null }[],
  maxName = 120,
): Promise<{ lastId: string; lastGeneration: number }> {
  let parentId = anchor.id
  let gen = anchor.generation
  for (const n of newNodes) {
    const raw = (n?.name ?? '').toString().trim().replace(/\s+/g, ' ')
    const nm = normalizeLineageNodeName({ name: raw }) || raw
    if (!nm || nm.length > maxName) continue
    gen += 1
    const rel = n?.relation === 'son' || n?.relation === 'son_in_law' ? n.relation : null
    const key = lineageIdentityKey(nm)
    const { data: siblings } = await admin.from('lineage_nodes')
      .select('id, generation, name, status').eq('parent_id', parentId)
    const matches = (siblings ?? []).filter((s: { name: string }) => lineageIdentityKey(s.name) === key)
    const existing = matches.find((s: { status: string }) => s.status === 'verified') ?? matches[0]
    if (existing?.id) { parentId = existing.id; gen = (existing.generation as number) ?? gen; continue }
    const { data: node, error } = await admin.from('lineage_nodes')
      .insert({ name: nm, parent_id: parentId, generation: gen, relation: rel, status: 'pending' })
      .select('id').single()
    if (error || !node?.id) throw new Error(error?.message ?? 'insert failed')
    parentId = node.id
  }
  return { lastId: parentId, lastGeneration: gen }
}
