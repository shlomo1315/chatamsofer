// ─────────────────────────────────────────────────────────────────────────────
// שומר-סף על דגלי ההשבתה (*_DISABLED) של המתזמן הפנימי (instrumentation.ts).
//
// 🔴 נוסף בעקבות תקלה: UNLOAD_EXPIRED_DISABLED הודלק ב-Railway (כנראה
// לניפוי תקלה אחרת) ונשאר דלוק שבועיים בלי שאיש שם לב — כי אין שום
// מקום שמראה אילו דגלים דולקים כרגע. כל דגל דומה (LIVE_BALANCES_DISABLED,
// DAILY_BACKUP_DISABLED וכו') חשוף לאותה תקלה בדיוק: קל להדליק לבדיקה
// חד-פעמית, קל לשכוח לכבות, ואין שום תזכורת.
//
// ⚠️ מתריע פעם בשבוע בלבד (לא בכל ריצה) כדי לא להציף — דגל שהודלק
// במכוון לטווח ארוך (למשל LEGACY_SYNC_DISABLED אחרי סגירת תיבות ישנות)
// לא אמור לייצר מייל כל יום, אבל גם לא אמור להישכח לגמרי.
// ─────────────────────────────────────────────────────────────────────────────
import { getServiceClient } from '@/lib/apiAuth'

/** כל דגלי ה-*_DISABLED שמשמשים את instrumentation.ts. */
const SCHEDULER_FLAGS = [
  'UNLOAD_EXPIRED_DISABLED',
  'LIVE_BALANCES_DISABLED',
  'GOV_SYNC_DISABLED',
  'LOANS_REPORT_DISABLED',
  'SCHEDULED_MAIL_DISABLED',
  'MATERNITY_CARD_RETRY_DISABLED',
  'LEGACY_SYNC_DISABLED',
  'GMAIL_WATCH_RENEW_DISABLED',
  'DAILY_BACKUP_DISABLED',
  'NEWSLETTER_DISABLED',
  'BOOK_FAIR_AUTO_OPEN_DISABLED',
  'BOOK_FAIR_CLEANUP_DISABLED',
  'VOICE_REBUILD_DISABLED',
] as const

const REPORT_TO = 'office@chasamsofer.info'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export async function checkSchedulerFlags(): Promise<void> {
  const on = SCHEDULER_FLAGS.filter(f => process.env[f] === '1')
  if (!on.length) return

  const admin = getServiceClient()
  if (!admin) return

  const KEY = 'scheduler_flags_alert_at'
  const { data } = await admin.from('app_settings').select('value').eq('key', KEY).maybeSingle()
  const last = (data as { value?: string } | null)?.value ?? null
  if (last && Date.now() - new Date(last).getTime() < WEEK_MS) return // התרענו כבר השבוע

  await admin.from('app_settings').upsert(
    { key: KEY, value: new Date().toISOString() }, { onConflict: 'key' },
  )

  const { deliverMail } = await import('@/lib/sendMail')
  await deliverMail(REPORT_TO, `⚠️ ${on.length} מתזמנים כבויים`,
    `<div dir="rtl" style="font-family:'Heebo',Arial,sans-serif">
      <p>המשתנים הבאים מכבים היום משימות רקע קבועות (Railway → Variables):</p>
      <ul>${on.map(f => `<li><code>${f}</code></li>`).join('')}</ul>
      <p>אם ההשבתה זמנית (למשל לניפוי תקלה) — יש לוודא שהיא מוסרת. תזכורת זו חוזרת פעם בשבוע כל עוד הדגל דלוק.</p>
    </div>`,
    undefined, { fromEmail: REPORT_TO, replyTo: REPORT_TO, skipLog: true },
  ).catch(() => {})
}
