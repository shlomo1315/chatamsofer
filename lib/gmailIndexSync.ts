// ─────────────────────────────────────────────────────────────────────────────
// מנוע הסנכרון — מחבר את הלוגיקה הטהורה ל-Gmail ולמסד.
//
// 🔴 החוק היחיד שלא נשבר כאן: **הטבלה היא אינדקס, לא עותק.** גוף ההודעה
// לעולם אינו נכתב למסד. מה שנשמר הוא מצביע (gmail_message_id) + מטא-דאטה
// לתצוגה + מה שהמערכת מוסיפה (שיוך, מחלקה, סטטוס בקשה).
//
// למה זה קריטי: היום אותה הודעה יושבת בשלושה מקומות — המקור בגמייל, עותק
// ב-inbound_emails, ועוד עותק שמוחזר לגמייל. שלושה עותקים ושני מעבדים
// שמתחרים עליהם. אינדקס בלי גוף אינו יכול לסתור את Gmail, ולכן הכפילות
// נעלמת מעצם המבנה ולא בזכות שמירה על סדר.
//
// ⚠️ המודול הזה נוגע ברשת ובמסד ולכן אינו טהור. כל הכרעה שאפשר היה לבדוק
// בלעדיהם כבר יושבת ב-gmailHistorySync ו-gmailIndexRow — כאן נשאר החיווט.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseMessage, getGmailClientForToken } from './gmail'
import {
  planSync, readStateAfter, isHistoryExpired,
  type GmailHistoryPage, type MessageChange,
} from './gmailHistorySync'
import { toIndexRow, departmentFor, type IndexSource } from './gmailIndexRow'

/** כמה הודעות נמשכות בסנכרון מלא. */
const FULL_SYNC_LIMIT = 500
/** כמה דפי היסטוריה נקראים לכל היותר בריצה אחת. */
const MAX_HISTORY_PAGES = 20
/** כמה הודעות נמשכות במקביל מ-Gmail. */
const FETCH_CONCURRENCY = 8

export interface SyncResult {
  mode: 'incremental' | 'full'
  /** הודעות שנוספו או עודכנו באינדקס. */
  upserted: number
  /** הודעות שסומנו כמוסרות. */
  removed: number
  /** הודעות שרק מצב הקריאה שלהן השתנה. */
  touched: number
  historyId: string | null
  error?: string
}

/** גוזר את מיפוי הכתובת→מחלקה מהחשבונות הפעילים. */
async function departmentMap(db: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await db.from('gmail_accounts').select('email, department').eq('is_active', true)
  const m = new Map<string, string>()
  for (const r of (data ?? []) as { email?: string; department?: string }[]) {
    const e = String(r.email ?? '').trim().toLowerCase()
    if (e && r.department) m.set(e, r.department)
  }
  return m
}

/**
 * מושך הודעות מ-Gmail במנות מקבילות.
 *
 * ⚠️ מקבילי ולא טורי: סנכרון ראשון מושך מאות הודעות, ומשיכה אחת-אחת הייתה
 * הופכת אותו לדקות. ⚠️ אבל מוגבל ב-FETCH_CONCURRENCY — Gmail מטיל מכסות,
 * ומאה בקשות בו-זמנית מחזירות 429 ומאבדות את כל המנה.
 */
async function fetchMessages(
  gmail: ReturnType<typeof getGmailClientForToken>,
  ids: string[],
): Promise<IndexSource[]> {
  const out: IndexSource[] = []
  for (let i = 0; i < ids.length; i += FETCH_CONCURRENCY) {
    const slice = ids.slice(i, i + FETCH_CONCURRENCY)
    const batch = await Promise.all(slice.map(async id => {
      try {
        // format:'metadata' — הכותרות בלבד, בלי הגוף.
        // ⚠️ זו אינה אופטימיזציה אלא אכיפת החוק: משיכת 'full' הייתה מביאה
        // את הגוף לזיכרון, ומשם הדרך לשמירתו בטעות קצרה מדי.
        const res = await gmail.users.messages.get({
          userId: 'me', id, format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date', 'X-Gm-Original-To', 'Delivered-To'],
        })
        const p = parseMessage(res.data)
        const headers = (res.data?.payload?.headers ?? []) as { name?: string; value?: string }[]
        const header = (n: string) =>
          headers.find(h => String(h.name ?? '').toLowerCase() === n.toLowerCase())?.value ?? null
        return {
          id: String(res.data?.id ?? id),
          threadId: res.data?.threadId ?? null,
          subject: p.subject ?? header('Subject'),
          from: p.from ?? header('From'),
          fromEmail: p.from ?? header('From'),
          toEmail: header('To'),
          date: p.date ?? header('Date'),
          snippet: res.data?.snippet ?? null,
          labelIds: res.data?.labelIds ?? [],
          attachments: p.attachments ?? [],
          // ⚠️ הכתובת שלפני הניתוב. בלעדיה אי אפשר לדעת לאיזו מחלקה המייל
          // שייך כשהוא מגיע לתיבה משותפת.
          originalTo: header('X-Gm-Original-To') ?? header('Delivered-To'),
        } as IndexSource
      } catch (e) {
        // ⚠️ הודעה בודדת שנכשלה אינה מפילה את המנה. היא תיקלט בסנכרון הבא —
        // כישלון של אחת אינו סיבה לאבד את כל השאר.
        console.error('[gmailIndex] משיכת הודעה נכשלה:', id, e instanceof Error ? e.message : e)
        return null
      }
    }))
    for (const m of batch) if (m) out.push(m)
  }
  return out
}

/** כותב שורות אינדקס. onConflict על המצביע — סנכרון חוזר מעדכן ואינו מכפיל. */
async function upsertRows(
  db: SupabaseClient,
  accountId: string,
  sources: IndexSource[],
  depts: Map<string, string>,
): Promise<number> {
  if (!sources.length) return 0
  const now = new Date().toISOString()
  const rows = sources.map(s => ({
    ...toIndexRow(s, now),
    account_id: accountId,
    department: departmentFor(s, depts),
  }))
  // ⚠️ ignoreDuplicates:false — הודעה קיימת חייבת *להתעדכן* (תוויות, מצב
  // קריאה), לא להידלג. דילוג היה מקפיא את מצב הנקרא על מה שהיה בסנכרון הראשון.
  const { error } = await db.from('gmail_messages')
    .upsert(rows, { onConflict: 'gmail_message_id', ignoreDuplicates: false })
  if (error) throw new Error(error.message)
  return rows.length
}

/**
 * מחיל שינויי תוויות בלי למשוך את ההודעה מחדש.
 *
 * ⚠️ זה מה שהופך את הסנכרון לדו-כיווני בעיני המשתמש: פתיחה בטלפון מורידה
 * את UNREAD, וההודעה מסומנת כנקראה כאן בלי שאיש לחץ דבר.
 */
async function applyLabelChanges(db: SupabaseClient, changes: MessageChange[]): Promise<number> {
  let touched = 0
  for (const c of changes) {
    const unread = readStateAfter(c)
    if (unread === null) continue
    const { error } = await db.from('gmail_messages')
      .update({ is_unread: unread, synced_at: new Date().toISOString() })
      .eq('gmail_message_id', c.messageId)
    if (!error) touched++
  }
  return touched
}

/**
 * סנכרון מלא — כשאין ממה להמשיך (סנכרון ראשון, או historyId שפג).
 *
 * ⚠️ אינו מוחק שורות שלא נראו בסריקה. הסריקה מוגבלת ל-FULL_SYNC_LIMIT,
 * ומחיקת כל מה שמחוצה לה הייתה מוחקת את ההיסטוריה הישנה בכל ריצה.
 */
async function fullSync(
  db: SupabaseClient,
  gmail: ReturnType<typeof getGmailClientForToken>,
  accountId: string,
  depts: Map<string, string>,
): Promise<SyncResult> {
  const list = await gmail.users.messages.list({ userId: 'me', maxResults: FULL_SYNC_LIMIT })
  const ids = (list.data?.messages ?? []).map((m: { id?: string | null }) => String(m?.id ?? '')).filter(Boolean)

  const sources = await fetchMessages(gmail, ids)
  const upserted = await upsertRows(db, accountId, sources, depts)

  // ⚠️ ה-historyId נלקח מהפרופיל *אחרי* הסריקה: כך הסנכרון המצטבר הבא ממשיך
  // מהנקודה הזו. לקיחתו לפני הסריקה הייתה מדלגת על מה שהגיע במהלכה.
  const profile = await gmail.users.getProfile({ userId: 'me' })
  const historyId = profile.data?.historyId ? String(profile.data.historyId) : null

  return { mode: 'full', upserted, removed: 0, touched: 0, historyId }
}

/**
 * סנכרון חשבון אחד.
 *
 * ⚠️ המסלול המלא אינו שגיאה אלא מסלול תקין: Gmail שומר היסטוריה לזמן מוגבל
 * (בפועל כשבוע), ו-historyId ישן מוחזר כ-404. מערכת בלי הנפילה-לאחור הזו
 * נראית עובדת חודשים ואז מפספסת הודעות בשקט אחרי כל הפסקה ארוכה.
 */
export async function syncAccount(
  db: SupabaseClient,
  account: { id: string; email: string; refresh_token: string; last_history_id?: string | null },
): Promise<SyncResult> {
  const gmail = getGmailClientForToken(account.refresh_token)
  const depts = await departmentMap(db)

  const runFull = async (): Promise<SyncResult> => {
    const r = await fullSync(db, gmail, account.id, depts)
    await db.from('gmail_accounts').update({
      last_history_id: r.historyId,
      last_full_sync_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
      last_error: null,
    }).eq('id', account.id)
    return r
  }

  if (!account.last_history_id) return runFull()

  // ── מסלול מצטבר ──
  const pages: GmailHistoryPage[] = []
  try {
    let pageToken: string | undefined
    for (let i = 0; i < MAX_HISTORY_PAGES; i++) {
      const res = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: account.last_history_id,
        maxResults: 500,
        pageToken,
      })
      pages.push({ history: res.data?.history ?? [], historyId: res.data?.historyId ?? null })
      pageToken = res.data?.nextPageToken ?? undefined
      if (!pageToken) break
    }
  } catch (e) {
    // 🔴 הנפילה-לאחור. בלעדיה כל מה שקרה מאז ההיסטוריה שפגה אבד בשקט.
    if (isHistoryExpired(e)) {
      console.warn(`[gmailIndex] היסטוריה פגה עבור ${account.email} — נופל לסנכרון מלא`)
      return runFull()
    }
    const msg = e instanceof Error ? e.message : String(e)
    await db.from('gmail_accounts').update({ last_error: msg }).eq('id', account.id)
    return { mode: 'incremental', upserted: 0, removed: 0, touched: 0, historyId: account.last_history_id, error: msg }
  }

  const plan = planSync(account.last_history_id, pages)
  if (plan.mode === 'full') return runFull()

  const added = plan.changes.filter(c => c.kind === 'added')
  const deleted = plan.changes.filter(c => c.kind === 'deleted')
  const labels = plan.changes.filter(c => c.kind === 'labels')

  const sources = added.length ? await fetchMessages(gmail, added.map(c => c.messageId)) : []
  const upserted = await upsertRows(db, account.id, sources, depts)

  // ⚠️ מחיקה רכה: השיוך לכרטסת והתיעוד שנבנו על ההודעה נשארים. מחיקה קשה
  // הייתה מוחקת עבודה אנושית בגלל לחיצה בטלפון.
  let removed = 0
  if (deleted.length) {
    const { error } = await db.from('gmail_messages')
      .update({ deleted_at: new Date().toISOString() })
      .in('gmail_message_id', deleted.map(c => c.messageId))
    if (!error) removed = deleted.length
  }

  const touched = await applyLabelChanges(db, labels)

  // ⚠️ הסמן מתקדם רק אחרי שהכל הוחל בהצלחה. קידום מוקדם היה מדלג על שינויים
  // שנכשלו באמצע, ואין דרך לגלות זאת בדיעבד.
  const next = plan.nextHistoryId ?? account.last_history_id
  await db.from('gmail_accounts').update({
    last_history_id: next,
    last_sync_at: new Date().toISOString(),
    last_sync_count: upserted,
    last_error: null,
  }).eq('id', account.id)

  return { mode: 'incremental', upserted, removed, touched, historyId: next }
}
