// ─────────────────────────────────────────────────────────────────────────────
// טעינת כרטיסי החגים בנדרים.
//
// 🔴 רץ **רק** מכפתור מפורש. אין כאן Cron, אין טריגר, ואין הפעלה כתופעת
// לוואי של פעולה אחרת. זו פעולה כספית על כרטיסים אמיתיים.
//
// 🔴 הרשאות נדרים של החגים נפרדות מאלה של היולדות (getHolidayNedarimCreds),
// וכך גם קבוצת הגבלת החנויות. שימוש בהרשאות היולדות היה טוען מהתקציב
// הלא נכון.
//
// ⚠️ הטעינה מתבצעת בקצב מבוקר ולא במקביל מלא: נדרים חוסמת קצב, ואז חלק
// מהמשפחות נטענות וחלק לא — בלי שאיש יידע מי.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getHolidayNedarimCreds, getHolidayLimitedId, addTlush,
  findClientByZeout, normalizeZeout, type NedarimCreds,
} from './nedarim'

/** סכום ברירת המחדל לטעינה. ⚠️ ניתן לשינוי מהמסך — אינו קבוע קשיח. */
export const DEFAULT_LOAD_AMOUNT = 500

export interface LoadTarget {
  recipientId: string
  idNumber: string | null
  name: string
}

export interface LoadOutcome {
  recipientId: string
  ok: boolean
  error?: string
  tlushId?: string | null
}

export interface LoadSummary {
  attempted: number
  loaded: number
  failed: number
  outcomes: LoadOutcome[]
}

/**
 * טוען סכום לכרטיס אחד.
 *
 * ⚠️ מחזיר תוצאה ולא זורק: כשל במשפחה אחת אינו סיבה להפיל את כל המנה.
 */
export async function loadOne(
  creds: NedarimCreds,
  limitedId: string,
  target: LoadTarget,
  amount: number,
): Promise<LoadOutcome> {
  const zeout = normalizeZeout(target.idNumber ?? '')
  if (!zeout) {
    return { recipientId: target.recipientId, ok: false, error: 'אין תעודת זהות ברשומה' }
  }

  try {
    const clientId = await findClientByZeout(creds, zeout)
    if (!clientId) {
      // ⚠️ הודעה מפורשת ולא "נכשל": המשפחה אינה קיימת בנדרים, וזה מצב
      // שדורש פעולה אנושית (חיבור כרטיס) ולא נסיון חוזר.
      return { recipientId: target.recipientId, ok: false, error: 'לא נמצא לקוח בנדרים לתעודת זהות זו' }
    }

    const res = await addTlush(creds, clientId, amount, undefined, 'חלוקת חגים', limitedId)
    if (!res.ok) return { recipientId: target.recipientId, ok: false, error: res.message || 'הטעינה נדחתה' }
    return { recipientId: target.recipientId, ok: true, tlushId: res.tlushId }
  } catch (e) {
    return { recipientId: target.recipientId, ok: false, error: e instanceof Error ? e.message : 'תקלה' }
  }
}

/**
 * טוען מנה של כרטיסים ומעדכן את הסטטוס לכל שורה.
 *
 * ⚠️ סדרתי עם השהיה קצרה ולא Promise.all: נדרים חוסמת קצב על עשרות
 * קריאות מקבילות, והתוצאה היא כשלים אקראיים שנראים כתקלה במערכת.
 */
export async function runLoadBatch(
  db: SupabaseClient,
  targets: LoadTarget[],
  amount: number = DEFAULT_LOAD_AMOUNT,
  opts: { delayMs?: number } = {},
): Promise<LoadSummary> {
  const summary: LoadSummary = { attempted: targets.length, loaded: 0, failed: 0, outcomes: [] }
  if (!targets.length) return summary

  const creds = await getHolidayNedarimCreds()
  if (!creds) {
    // 🔴 נכשל-סגור: בלי הרשאות אין לנסות עם ברירת מחדל כלשהי.
    throw new Error('לא הוגדרו הרשאות נדרים לחלוקות חגים')
  }
  const limitedId = await getHolidayLimitedId()

  for (const t of targets) {
    const outcome = await loadOne(creds, limitedId, t, amount)
    summary.outcomes.push(outcome)
    if (outcome.ok) summary.loaded++; else summary.failed++

    await db.from('distribution_recipients').update({
      load_status: outcome.ok ? 'loaded' : 'failed',
      load_error: outcome.ok ? null : (outcome.error ?? 'תקלה'),
      loaded_at: outcome.ok ? new Date().toISOString() : null,
    }).eq('id', t.recipientId)

    if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs))
  }

  console.log(`[holiday-load] הסתיים: ${summary.loaded} נטענו · ${summary.failed} נכשלו מתוך ${summary.attempted}`)
  return summary
}

/**
 * מי זכאי לטעינה — מסונן ולא מנוחש.
 *
 * ⚠️ שלושה תנאים, וכל אחד מהם מונע טעינה כפולה או שגויה:
 *   1. מאושר — טעינה לפני אישור היא כסף שיצא בטעות
 *   2. טרם נטען — 'loaded' לא ייטען שוב
 *   3. יש ת"ז — בלעדיה אין את מי לחפש בנדרים
 */
export function eligibleForLoad(rows: {
  id: string
  approval_status?: string | null
  load_status?: string | null
  id_number?: string | null
  name?: string
}[]): LoadTarget[] {
  return rows
    .filter(r => r.approval_status === 'approved')
    .filter(r => r.load_status !== 'loaded')
    .filter(r => !!(r.id_number ?? '').trim())
    .map(r => ({ recipientId: r.id, idNumber: r.id_number ?? null, name: r.name ?? '' }))
}
