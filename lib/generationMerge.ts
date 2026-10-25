// מיזוג מדורג — דור אחרי דור, מלמעלה למטה, באישור מפורש לכל דור.
//
// למה מדורג: מיזוג בדור עליון מאחד ילדים תחת הורה אחד, וכך נוצרות קבוצות
// בטוחות *חדשות* בדור שמתחתיו. הרצה של הכול בבת אחת מסתירה את זה. כאן כל
// דור מוצג, מאושר ומבוצע לבד, ואחרי רענון מופיע הדור הבא.
//
// מה "בטוח" כאן, מחמיר יותר מ-findSafeMergeGroups:
//  • אותו אב, אותו דור ושם זהה בדיוק (findSafeMergeGroups).
//  • לכל היותר כרטסת אחת מקושרת לכל צמתי הקבוצה יחד. שתי כרטסות על שני
//    עותקים עלולות להיות שתי משפחות שונות, וזה כבר דורש עין אנושית.
//
// 🔴 ביטול אוטומטי בכישלון: כל הדור רץ תחת batchId אחד. אם מיזוג אחד נכשל,
// undoMergeBatch מחזיר מיד את כל מה שכבר מוזג באותו דור. זה ביטול מפצה דרך
// היומן (lineage_merge_log), לא טרנזקציה של המסד.
//
// 🔴 טביעת אצבע: הביצוע מחשב את התוכנית מחדש ומשווה לטביעה שאושרה. אם משהו
// השתנה בינתיים (מישהו ערך את העץ), לא נוגעים בכלום.

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { findSafeMergeGroups, exactNameKey, type SafeNode } from './safeMergeGroups'
import { pickKeepId, mergeWithCascade, undoMergeBatch } from './lineageMerge'

/** תקרת קבוצות בדור אחד, כדי שהבקשה תחזור בזמן (בערך שנייה למיזוג). */
export const MAX_GROUPS_PER_GENERATION = 150

export interface PlannedGroup {
  key: string
  name: string
  generation: number
  parentName: string
  keepId: string
  /** השורד מאושר — האישור נשמר במיזוג */
  keepVerified: boolean
  mergeIds: string[]
  /** ילדים שיעברו מהעותקים הנמחקים אל השורד */
  movedChildren: number
  /** כרטסות שיעברו מהעותקים הנמחקים אל השורד */
  movedFamilies: number
}

export interface ExcludedGroup {
  name: string
  generation: number
  parentName: string
  ids: string[]
  reason: string
}

export interface GenerationPlan {
  /** הדור הרדוד ביותר שיש בו קבוצות בטוחות; null = אין מה למזג */
  generation: number | null
  groups: PlannedGroup[]
  /** קבוצות באותו דור שנדחו בגלל התקרה ויופיעו בסבב הבא */
  deferred: number
  excluded: ExcludedGroup[]
  /** דורות נוספים שכבר עכשיו יש בהם קבוצות בטוחות */
  upcoming: { generation: number; groups: number }[]
  fingerprint: string
}

export function planGenerationMerge(
  nodes: SafeNode[],
  benCount: Map<string, number>,
): GenerationPlan {
  const childCount = new Map<string, number>()
  for (const n of nodes) {
    if (n.parent_id) childCount.set(n.parent_id, (childCount.get(n.parent_id) ?? 0) + 1)
  }
  const nameById = new Map(nodes.map(n => [n.id, n.name]))

  const eligible: SafeNode[][] = []
  const excluded: ExcludedGroup[] = []
  for (const g of findSafeMergeGroups(nodes)) {
    const families = g.reduce((s, n) => s + (benCount.get(n.id) ?? 0), 0)
    if (families > 1) {
      excluded.push({
        name: exactNameKey(g[0].name),
        generation: g[0].generation,
        parentName: nameById.get(g[0].parent_id ?? '') ?? '',
        ids: g.map(n => n.id),
        reason: `${families} כרטסות מקושרות — דורש בדיקה ידנית`,
      })
      continue
    }
    eligible.push(g)
  }

  const byGen = new Map<number, number>()
  for (const g of eligible) byGen.set(g[0].generation, (byGen.get(g[0].generation) ?? 0) + 1)
  const gens = [...byGen.keys()].sort((a, b) => a - b)
  const generation = gens.length ? gens[0] : null

  const inGen = eligible.filter(g => g[0].generation === generation)
  const taken = inGen.slice(0, MAX_GROUPS_PER_GENERATION)

  const groups: PlannedGroup[] = taken.map(g => {
    const keepId = pickKeepId(
      g.map(n => ({ id: n.id, name: n.name, parent_id: n.parent_id, generation: n.generation, status: n.status ?? null })),
      childCount,
    )
    const mergeIds = g.map(n => n.id).filter(id => id !== keepId).sort()
    return {
      key: `${g[0].parent_id ?? 'root'}|${g[0].generation}|${exactNameKey(g[0].name)}`,
      name: exactNameKey(g[0].name),
      generation: g[0].generation,
      parentName: nameById.get(g[0].parent_id ?? '') ?? '',
      keepId,
      keepVerified: (g.find(x => x.id === keepId)?.status ?? '') === 'verified',
      mergeIds,
      movedChildren: mergeIds.reduce((s, id) => s + (childCount.get(id) ?? 0), 0),
      movedFamilies: mergeIds.reduce((s, id) => s + (benCount.get(id) ?? 0), 0),
    }
  })

  return {
    generation,
    groups,
    deferred: inGen.length - taken.length,
    excluded,
    upcoming: gens.slice(1).map(g => ({ generation: g, groups: byGen.get(g)! })),
    fingerprint: fingerprintOf(generation, groups),
  }
}

/** טביעה של מה שבדיוק ימוזג: מי נשמר ומי נמחק בכל קבוצה. */
export function fingerprintOf(generation: number | null, groups: PlannedGroup[]): string {
  const body = JSON.stringify([generation, groups.map(g => [g.keepId, g.mergeIds, g.movedChildren, g.movedFamilies])])
  return createHash('sha256').update(body).digest('hex').slice(0, 16)
}

export interface ExecuteResult {
  ok: boolean
  merged: number
  removed: number
  children: number
  families: number
  /** כישלון: איזו קבוצה נפלה ולמה */
  failure?: { name: string; reason: string }
  /** כמה מיזוגים בוטלו אוטומטית אחרי הכישלון */
  rolledBack?: number
  /** הביטול האוטומטי עצמו נכשל — צריך ביטול ידני לפי batchId */
  rollbackError?: string
}

type MergeFn = typeof mergeWithCascade
type UndoFn = typeof undoMergeBatch

/**
 * מבצע דור אחד. סדרתי, batchId אחד. כישלון באמצע = ביטול של כל הדור.
 * merge/undo ניתנים להחלפה בבדיקות.
 */
export async function executeGenerationMerge(
  db: SupabaseClient,
  plan: GenerationPlan,
  opts: { batchId: string; userId?: string | null; merge?: MergeFn; undo?: UndoFn },
): Promise<ExecuteResult> {
  const merge = opts.merge ?? mergeWithCascade
  const undo = opts.undo ?? undoMergeBatch
  let merged = 0, removed = 0, children = 0, families = 0

  for (const g of plan.groups) {
    try {
      const r = await merge(db, {
        keepId: g.keepId, mergeIds: g.mergeIds, batchId: opts.batchId,
        names: {}, userId: opts.userId ?? null,
        // ⚠️ בלי מפל בשום כיוון — רק הקבוצה שהוצגה ואושרה.
        cascadeDown: false, cascadeUp: false, cascadeUpApprox: false,
        skipRecalc: true,
      })
      merged++
      removed += g.mergeIds.length
      children += r.reassignedChildren ?? 0
      families += r.reassignedBeneficiaries ?? 0
    } catch (e) {
      const failure = { name: g.name, reason: e instanceof Error ? e.message : String(e) }
      try {
        const rolledBack = await undo(db, opts.batchId)
        return { ok: false, merged: 0, removed: 0, children: 0, families: 0, failure, rolledBack }
      } catch (ue) {
        return {
          ok: false, merged, removed, children, families, failure,
          rollbackError: ue instanceof Error ? ue.message : String(ue),
        }
      }
    }
  }
  return { ok: true, merged, removed, children, families }
}
