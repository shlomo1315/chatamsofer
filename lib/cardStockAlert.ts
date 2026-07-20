import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { getAlertSettings } from '@/lib/cardStock'

// התראת "נשארו מעט כרטיסים במלאי". נשלחת כשהמלאי יורד לסף שהוגדר (ברירת מחדל 5) או פחות.
// כדי לא להציף — שולחים פעם אחת בכל "ירידה" מתחת לסף: סמן last_alerted_at_or_below נשמר
// ב-app_settings, ומתאפס ברגע שהמלאי חוזר מעל הסף (הוספת מלאי חדש).

const STATE_KEY = 'card_stock_alert_state'

// זוכרים את הסף האחרון שכברהתרענו עליו (או null). כך מתריעים פעם אחת לכל חצייה של סף,
// וכשמוסיפים מלאי מעל כל הספים — מתאפס, וחצייה הבאה תתריע שוב.
async function readLastAlerted(admin: SupabaseClient): Promise<number | null> {
  const { data } = await admin.from('app_settings').select('value').eq('key', STATE_KEY).maybeSingle()
  if (data?.value) { try { const v = JSON.parse(data.value); return typeof v?.lastAlerted === 'number' ? v.lastAlerted : null } catch { /* ignore */ } }
  return null
}
async function writeLastAlerted(admin: SupabaseClient, lastAlerted: number | null): Promise<void> {
  await admin.from('app_settings').upsert(
    { key: STATE_KEY, value: JSON.stringify({ lastAlerted }), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
}

// נקרא אחרי כל ניכוי כרטיס. בודק אם המלאי חצה כלפי מטה סף כלשהו שעוד לא התרענו עליו.
export async function maybeSendLowStockAlert(admin: SupabaseClient, balance: number): Promise<void> {
  try {
    const { thresholds, emails } = await getAlertSettings(admin)
    // הסף הגבוה ביותר שהמלאי נמצא כעת ברמתו או מתחתיו (thresholds ממוין יורד)
    const crossed = thresholds.find(t => balance <= t)
    if (crossed == null) return                       // מעל כל הספים — אין התראה

    const last = await readLastAlerted(admin)
    // כבר התרענו על סף זה או על סף נמוך יותר (כלומר כבר עדכנו בירידה הזו) → לא שולחים שוב
    if (last != null && crossed >= last) return

    if (emails.length === 0) { await writeLastAlerted(admin, crossed); return }
    const subject = `⚠️ מלאי כרטיסי מזון נמוך — נותרו ${balance} כרטיסים`
    const html = lowStockEmailHtml(balance, crossed)
    for (const to of emails) await deliverMail(to, subject, html, undefined, mailFor('maternity'))
    await writeLastAlerted(admin, crossed)
  } catch (e) {
    console.error('[cardStockAlert] low stock alert failed:', e)
  }
}

// נקרא אחרי הוספת מלאי. אם המלאי חזר מעל כל הספים — מאפס כדי שחצייה הבאה תתריע שוב.
export async function resetAlertIfAboveThreshold(admin: SupabaseClient, balance: number): Promise<void> {
  try {
    const { thresholds } = await getAlertSettings(admin)
    const maxT = Math.max(...thresholds, 0)
    if (balance > maxT) await writeLastAlerted(admin, null)
  } catch { /* best-effort */ }
}

function lowStockEmailHtml(balance: number, threshold: number): string {
  return `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f1f5f9;font-family:Rubik,Arial,sans-serif;padding:24px;direction:rtl;text-align:right">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;direction:rtl;text-align:right">
      <div style="background:#f43f5e;color:#fff;padding:20px 24px;text-align:right">
        <div style="font-size:18px;font-weight:700">⚠️ מלאי כרטיסי מזון נמוך</div>
      </div>
      <div style="padding:24px;color:#334155;font-size:15px;line-height:1.7;text-align:right">
        <p style="margin:0 0 12px">שלום,</p>
        <p style="margin:0 0 12px">מלאי כרטיסי המזון לחלוקה ליולדות ירד ל־<strong style="color:#f43f5e;font-size:18px">${balance} כרטיסים</strong> (סף ההתראה: ${threshold}).</p>
        <p style="margin:0 0 12px">מומלץ להוסיף מלאי חדש כדי שיולדות שיאושרו יקבלו את שובר הכרטיס באופן מיידי. יולדות שיאושרו ללא מלאי ייכנסו לרשימת המתנה ויקבלו את השובר אוטומטית ברגע שיתחדש המלאי.</p>
        <div style="margin-top:20px;padding:14px;background:#fff1f2;border:1px solid #fecdd3;border-radius:10px;color:#9f1239;font-size:14px;text-align:right">
          לניהול המלאי: מערכת הניהול → יולדות → כרטיסי מזון יולדות → מוקדי מלאי פנימיים
        </div>
      </div>
      <div style="padding:16px 24px;background:#f8fafc;color:#94a3b8;font-size:12px;text-align:center">היכל החתם סופר · הודעה אוטומטית</div>
    </div>
  </body></html>`
}
