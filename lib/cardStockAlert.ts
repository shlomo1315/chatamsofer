import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { getAlertSettings } from '@/lib/cardStock'

// התראת "נשארו מעט כרטיסים במלאי". נשלחת כשהמלאי יורד לסף שהוגדר (ברירת מחדל 5) או פחות.
// כדי לא להציף — שולחים פעם אחת בכל "ירידה" מתחת לסף: סמן last_alerted_at_or_below נשמר
// ב-app_settings, ומתאפס ברגע שהמלאי חוזר מעל הסף (הוספת מלאי חדש).

const STATE_KEY = 'card_stock_alert_state'

async function readAlertedFlag(admin: SupabaseClient): Promise<boolean> {
  const { data } = await admin.from('app_settings').select('value').eq('key', STATE_KEY).maybeSingle()
  if (data?.value) { try { return !!JSON.parse(data.value)?.alerted } catch { /* ignore */ } }
  return false
}
async function writeAlertedFlag(admin: SupabaseClient, alerted: boolean): Promise<void> {
  await admin.from('app_settings').upsert(
    { key: STATE_KEY, value: JSON.stringify({ alerted }), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
}

// נקרא אחרי כל ניכוי כרטיס. אם ירדנו לסף ומטה ועדיין לא התרענו — שולח מייל למנהלים.
export async function maybeSendLowStockAlert(admin: SupabaseClient, balance: number): Promise<void> {
  try {
    const { threshold, emails } = await getAlertSettings(admin)
    if (balance > threshold) return                 // מעל הסף — אין התראה
    if (await readAlertedFlag(admin)) return         // כבר התרענו בירידה הזו
    if (emails.length === 0) { await writeAlertedFlag(admin, true); return }

    const subject = `⚠️ מלאי כרטיסי מזון נמוך — נותרו ${balance} כרטיסים`
    const html = lowStockEmailHtml(balance, threshold)
    for (const to of emails) {
      await deliverMail(to, subject, html, undefined, mailFor('maternity'))
    }
    await writeAlertedFlag(admin, true)
  } catch (e) {
    console.error('[cardStockAlert] low stock alert failed:', e)
  }
}

// נקרא אחרי הוספת מלאי. אם המלאי חזר מעל הסף — מאפס את סמן ההתראה כדי שהירידה הבאה תתריע שוב.
export async function resetAlertIfAboveThreshold(admin: SupabaseClient, balance: number): Promise<void> {
  try {
    const { threshold } = await getAlertSettings(admin)
    if (balance > threshold) await writeAlertedFlag(admin, false)
  } catch { /* best-effort */ }
}

function lowStockEmailHtml(balance: number, threshold: number): string {
  return `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f1f5f9;font-family:Rubik,Arial,sans-serif;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:#f43f5e;color:#fff;padding:20px 24px">
        <div style="font-size:18px;font-weight:700">⚠️ מלאי כרטיסי מזון נמוך</div>
      </div>
      <div style="padding:24px;color:#334155;font-size:15px;line-height:1.7">
        <p>שלום,</p>
        <p>מלאי כרטיסי המזון לחלוקה ליולדות ירד ל־<strong style="color:#f43f5e;font-size:18px">${balance} כרטיסים</strong> (סף ההתראה: ${threshold}).</p>
        <p>מומלץ להוסיף מלאי חדש כדי שיולדות שיאושרו יקבלו את שובר הכרטיס באופן מיידי. יולדות שיאושרו ללא מלאי ייכנסו לרשימת המתנה ויקבלו את השובר אוטומטית ברגע שיתחדש המלאי.</p>
        <div style="margin-top:20px;padding:14px;background:#fff1f2;border:1px solid #fecdd3;border-radius:10px;color:#9f1239;font-size:14px">
          לניהול המלאי: מערכת הניהול → יולדות → כרטיסי מזון יולדות → מוקדי מלאי פנימיים
        </div>
      </div>
      <div style="padding:16px 24px;background:#f8fafc;color:#94a3b8;font-size:12px;text-align:center">היכל החתם סופר · הודעה אוטומטית</div>
    </div>
  </body></html>`
}
