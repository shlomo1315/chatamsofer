// ─────────────────────────────────────────────────────────────────────────────
// איפוס כרטיסי החגים — פריקת היתרה וניתוק הכרטיס המגנטי.
//
// 🔴 פעולה בלתי הפיכה על כרטיסים אמיתיים. רצה **רק** מכפתור מפורש עם
// אישור, לעולם לא אוטומטית ולא בתאריך.
//
// 🔴 הלקוח **אינו נמחק** מנדרים — רק הכרטיס מנותק. כך היסטוריית הקניות
// נשמרת, ובחג הבא מחברים כרטיס חדש בלי להקליד הכול מחדש. זו הכרעה
// מפורשת של המשתמש.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getHolidayNedarimCreds, getClientCardFull, findClientByZeout,
  prikatTlush, setMagneticCard, normalizeZeout, type NedarimCreds,
} from './nedarim'

export interface ResetTarget {
  recipientId: string
  idNumber: string | null
  name: string
}

export interface ResetPreview {
  cards: number
  /** 🔴 הסכום שעדיין טעון — ההתרעה המרכזית לפני האישור. */
  remaining: number
  noClient: number
}

const num = (v: unknown): number => {
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * תצוגה מקדימה — כמה כרטיסים וכמה כסף עדיין טעון.
 *
 * ⚠️ קוראת בלבד. שום פריקה ושום ניתוק.
 */
export async function previewReset(targets: ResetTarget[]): Promise<ResetPreview> {
  const out: ResetPreview = { cards: 0, remaining: 0, noClient: 0 }
  if (!targets.length) return out

  const creds = await getHolidayNedarimCreds()
  if (!creds) throw new Error('לא הוגדרו הרשאות נדרים לחלוקות חגים')

  for (const t of targets) {
    const zeout = normalizeZeout(t.idNumber ?? '')
    if (!zeout) { out.noClient++; continue }
    try {
      const clientId = await findClientByZeout(creds as NedarimCreds, zeout)
      if (!clientId) { out.noClient++; continue }
      const card = await getClientCardFull(creds as NedarimCreds, clientId)
      const active = (Array.isArray(card?.Cards) ? card!.Cards : [])
        .find((c: Record<string, unknown>) => !c.RemovedDate)
      if (active) out.cards++
      out.remaining += num(card?.TotalFreeAmount)
    } catch {
      out.noClient++
    }
    await new Promise(r => setTimeout(r, 60))
  }
  return out
}

export interface ResetSummary {
  attempted: number
  unloaded: number
  detached: number
  failed: number
  errors: { recipientId: string; error: string }[]
}

/**
 * מבצע את האיפוס: פריקת התלושים וניתוק הכרטיס.
 *
 * ⚠️ סדר קבוע — קודם פריקה ואז ניתוק. ניתוק לפני פריקה היה משאיר כסף
 * על כרטיס שאין אליו גישה.
 */
export async function runReset(
  db: SupabaseClient,
  targets: ResetTarget[],
  opts: { delayMs?: number } = {},
): Promise<ResetSummary> {
  const out: ResetSummary = { attempted: targets.length, unloaded: 0, detached: 0, failed: 0, errors: [] }
  if (!targets.length) return out

  const creds = await getHolidayNedarimCreds()
  if (!creds) throw new Error('לא הוגדרו הרשאות נדרים לחלוקות חגים')

  for (const t of targets) {
    const zeout = normalizeZeout(t.idNumber ?? '')
    if (!zeout) {
      out.failed++; out.errors.push({ recipientId: t.recipientId, error: 'אין תעודת זהות' })
      continue
    }

    try {
      const clientId = await findClientByZeout(creds as NedarimCreds, zeout)
      if (!clientId) {
        out.failed++; out.errors.push({ recipientId: t.recipientId, error: 'לא נמצא בנדרים' })
        continue
      }

      const card = await getClientCardFull(creds as NedarimCreds, clientId)

      // 1. פריקת כל התלושים הפעילים.
      const tlushim = Array.isArray(card?.Tlushim) ? (card!.Tlushim as Record<string, unknown>[]) : []
      for (const tl of tlushim) {
        const id = String(tl.Id ?? tl.TlushId ?? '').trim()
        if (!id) continue
        try { await prikatTlush(creds as NedarimCreds, id); out.unloaded++ } catch { /* ממשיכים */ }
      }

      // 2. ניתוק הכרטיס המגנטי. ⚠️ הלקוח נשאר — ראו כותרת הקובץ.
      const active = (Array.isArray(card?.Cards) ? card!.Cards : [])
        .find((c: Record<string, unknown>) => !c.RemovedDate)
      if (active) {
        // ⚠️ remove:true ומספר הכרטיס הקיים — לא מחרוזת ריקה. נדרים
        // מבדילה בין הוספה למחיקה בפרמטר Remove, וקריאה בלי זה הייתה
        // *מוסיפה* כרטיס ריק במקום לנתק את הקיים.
        const cardNum = String(active.CardNumber ?? active.MagneticCard ?? '').trim()
        const cardId = String(active.Id ?? active.CardId ?? '').trim() || undefined
        try {
          await setMagneticCard(creds as NedarimCreds, clientId, cardNum, { remove: true, cardId })
          out.detached++
        } catch { /* ממשיכים לשאר */ }
      }

      // 3. איפוס הסימון אצלנו, כדי שהחג הבא יתחיל נקי.
      await db.from('distribution_recipients').update({
        card_number: null, card_linked_at: null,
        load_status: null, load_error: null, loaded_at: null,
      }).eq('id', t.recipientId)

    } catch (e) {
      out.failed++
      out.errors.push({ recipientId: t.recipientId, error: e instanceof Error ? e.message : 'תקלה' })
    }

    if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs))
  }

  console.log(`[holiday-reset] ${out.unloaded} תלושים נפרקו · ${out.detached} כרטיסים נותקו · ${out.failed} נכשלו`)
  return out
}
