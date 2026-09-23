// ─────────────────────────────────────────────────────────────────────────────
// פתיחה אוטומטית של היריד + שליחת התזכורות.
//
// 🔴 בלי זה, מישהו צריך להיות ער בשעה היעודה וללחוץ. פתיחה ידנית
// שנשכחת פירושה שכל מי שנרשם לתזכורת מקבל הבטחה שלא קוימה — וזה
// בדיוק מה שדף ההמתנה בא למנוע.
//
// ⚠️ המועד נשמר ב-app_settings ולא בקוד: דחייה של הפתיחה היא החלטה
// שמתקבלת בעשר דקות, ופריסה מחדש בשבילה היא מתכון לאיחור.
//
// ⚠️ app_settings.value היא עמודת text — כל ערך נשמר כמחרוזת. שמירת
// אובייקט גולמי נכשלת בשקט ומייצרת "[object Object]".
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

/** מפתח המועד ב-app_settings. ISO-8601 עם אזור זמן. */
export const OPEN_AT_KEY = 'book_fair_open_at'

/**
 * מועד הפתיחה המתוכנן: כ״ג תשרי תשפ״ז, 22:00 שעון ישראל.
 *
 * ⚠️ +03:00 ולא Z: באוקטובר ישראל בשעון קיץ. כתיבת UTC גולמי כאן
 * הייתה פותחת שעה מוקדם או מאוחר מדי, והטעות מתגלה רק בשעת אמת.
 */
export const DEFAULT_OPEN_AT = '2026-10-03T22:00:00+03:00'

export interface OpeningResult {
  opened: boolean
  mailed: number
  failed: number
  reason?: string
}

/**
 * בודק אם הגיע מועד הפתיחה, ואם כן — פותח ושולח תזכורות.
 *
 * ⚠️ אינו זורק: נקרא מהמתזמן ואין מי שיתפוס חריגה.
 *
 * 🔴 אידמפוטנטי: העדכון מותנה ב-value='false', ולכן ריצה כפולה
 * (חפיפת פריסה) לא תפתח פעמיים ולא תשלח שני מיילים.
 */
export async function checkAndOpenBookFair(db: SupabaseClient): Promise<OpeningResult> {
  const out: OpeningResult = { opened: false, mailed: 0, failed: 0 }

  // ── האם כבר פתוח ──
  const { data: gate } = await db.from('app_settings')
    .select('value').eq('key', 'book_fair_open').maybeSingle()
  if (String((gate as { value?: string } | null)?.value ?? '') === 'true') {
    return { ...out, reason: 'כבר פתוח' }
  }

  // ── האם הגיע המועד ──
  const { data: at } = await db.from('app_settings')
    .select('value').eq('key', OPEN_AT_KEY).maybeSingle()
  const raw = String((at as { value?: string } | null)?.value ?? '').trim()
  if (!raw) return { ...out, reason: 'לא נקבע מועד פתיחה' }

  const openAt = new Date(raw)
  // ⚠️ תאריך פגום מזוהה במפורש ואינו נבלע: new Date('שטות') מחזיר
  // Invalid Date, וכל השוואה איתו היא false — כלומר היריד לא ייפתח
  // לעולם, בשקט מוחלט.
  if (Number.isNaN(openAt.getTime())) {
    console.error(`[book-fair/open] 🔴 מועד פתיחה פגום ב-app_settings: "${raw}"`)
    return { ...out, reason: 'מועד פתיחה פגום' }
  }

  if (Date.now() < openAt.getTime()) {
    return { ...out, reason: 'טרם הגיע המועד' }
  }

  // ── פתיחה ──
  // 🔴 התנאי על 'false' הוא מנעול האידמפוטנטיות: שתי ריצות מקבילות
  // ורק אחת תעדכן שורה, והשנייה תקבל 0 ותצא בלי לשלוח מיילים.
  const { data: updated } = await db.from('app_settings')
    .update({ value: 'true', updated_at: new Date().toISOString() })
    .eq('key', 'book_fair_open').eq('value', 'false')
    .select('key')

  if (!updated?.length) return { ...out, reason: 'נפתח כבר בריצה אחרת' }
  out.opened = true
  console.log('[book-fair/open] 🟢 היריד נפתח אוטומטית')

  // ── תזכורות ──
  const sent = await sendOpeningReminders(db)
  out.mailed = sent.mailed
  out.failed = sent.failed
  return out
}

/**
 * שולח תזכורת לכל מי שנרשם וטרם קיבל.
 *
 * ⚠️ מסומן כנשלח *אחרי* שליחה מוצלחת בלבד. סימון מראש היה מוחק
 * לנצח את מי שהשליחה אליו נכשלה, בלי שאיש ידע.
 */
export async function sendOpeningReminders(
  db: SupabaseClient,
): Promise<{ mailed: number; failed: number }> {
  const { deliverMail } = await import('@/lib/sendMail')
  const { mailFor } = await import('@/lib/departments')
  const { bookFairOpenedEmail } = await import('@/lib/emailTemplates')
  const { ensureEmailTexts } = await import('@/lib/emailTextsStore')

  await ensureEmailTexts()

  const { data: rows } = await db.from('book_fair_reminders')
    .select('id, email').is('notified_at', null).limit(5000)

  const list = (rows ?? []) as { id: string; email: string }[]
  if (!list.length) return { mailed: 0, failed: 0 }

  const mail = bookFairOpenedEmail()
  let mailed = 0, failed = 0

  for (const r of list) {
    // ⚠️ אחד-אחד ולא במנה: Resend מגביל קצב, והרשימה קטנה.
    // transactional — זו הודעה שהנמען ביקש במפורש, לא דיוור.
    const res = await deliverMail(r.email, mail.subject, mail.html, undefined, {
      ...mailFor('yerid'), transactional: true,
    })
    if (res.ok) {
      await db.from('book_fair_reminders')
        .update({ notified_at: new Date().toISOString() }).eq('id', r.id)
      mailed++
    } else {
      console.error(`[book-fair/open] תזכורת ל-${r.email} נכשלה:`, res.error)
      failed++
    }
  }

  console.log(`[book-fair/open] תזכורות: ${mailed} נשלחו${failed ? `, ${failed} נכשלו` : ''}`)
  return { mailed, failed }
}
