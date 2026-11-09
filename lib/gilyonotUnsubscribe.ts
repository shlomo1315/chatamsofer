// ─────────────────────────────────────────────────────────────────────────────
// הסרה מקישור בתחתית מייל הגיליונות: עמודי האישור והתוצאה, וההסרה מכל המערכת.
// האימות הוא טוקן אקראי (uuid) של הנמען או של המשלוח, שנשמר בטבלה שרק service_role
// ניגש אליה, ולא כתובת המייל. ההסרה נרשמת בטבלה unsubscribes, שמסוננת בגיליונות,
// בניוזלטר ובדיוור היריד, ולכן הנמען לא יקבל עוד שום דיוור מהמערכת.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { escHtml } from './gilyonotMail'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isRecipientToken = (token: unknown): token is string => typeof token === 'string' && UUID_RE.test(token)

export const WARNING_TEXT = 'ההסרה תסיר אתכם לגמרי מהמערכת, ולא תקבלו עוד שום עדכון מכל המערכת, כולל רשימת ההטבות, עדכונים והודעות נוספות. אם ברצונכם להסיר את עצמכם, לחצו על "אישור הסרה".'

export function page(title: string, body: string, status = 200): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex"/><title>${title}</title></head>
<body style="margin:0;font-family:'Heebo',Arial,sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;">
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:36px;max-width:440px;width:100%;text-align:center;">
    <p style="margin:0 0 6px;color:#64748b;font-size:13px;">גיליונות החתם סופר</p>
    ${body}
  </div>
</body>
</html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  )
}

const btn = (color: string, filled: boolean) =>
  `style="display:block;box-sizing:border-box;width:100%;background:${filled ? color : '#fff'};color:${filled ? '#fff' : color};border:1.5px solid ${color};border-radius:12px;padding:14px;font-size:15px;font-weight:bold;cursor:pointer;font-family:inherit;text-decoration:none;"`

export const invalidPage = () => page('קישור לא תקין', `<h1 style="margin:0 0 10px;color:#b91c1c;font-size:20px;">הקישור לא תקין</h1>
  <p style="margin:0;color:#64748b;font-size:14px;line-height:1.7;">אפשר לפנות אלינו ונסיר אתכם ידנית.</p>`, 404)

export const errorPage = (msg: string) => page('אירעה שגיאה', `<h1 style="margin:0;color:#b91c1c;font-size:20px;">${msg}</h1>`, 500)

/** מסך האזהרה. ההסרה מתבצעת רק בלחיצה על "אישור הסרה" (POST), לא בכניסה לקישור. */
export function confirmPage(base: string, email: string): NextResponse {
  return page('הסרה מרשימת התפוצה', `<h1 style="margin:0 0 10px;color:#0f172a;font-size:20px;">הסרה מרשימת התפוצה</h1>
    <p style="margin:0 0 14px;color:#64748b;font-size:14px;line-height:1.7;">הכתובת <strong dir="ltr" style="color:#334155;">${escHtml(email)}</strong></p>
    <p style="margin:0 0 24px;color:#92400e;font-size:14px;line-height:1.8;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px;text-align:right;"><strong>שימו לב!</strong> ${escHtml(WARNING_TEXT)}</p>
    <form method="POST" action="${base}?confirm=1" style="margin:0 0 10px;">
      <button type="submit" ${btn('#b91c1c', true)}>אישור הסרה</button>
    </form>
    <a href="${base}?stay=1" ${btn('#2563eb', false)}>ביטול, השארו ברשימה</a>`)
}

export const stayPage = () => page('נשארתם ברשימה', `<h1 style="margin:0 0 10px;color:#047857;font-size:20px;">נשארתם ברשימה</h1>
  <p style="margin:0;color:#64748b;font-size:14px;line-height:1.7;">לא הסרנו אתכם. תמשיכו לקבל את הגיליון והעדכונים כרגיל.</p>`)

export function removedPage(base: string): NextResponse {
  return page('הוסרתם מהמערכת', `<h1 style="margin:0 0 10px;color:#047857;font-size:20px;">הוסרתם בהצלחה</h1>
    <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.7;">לא תקבלו מאיתנו עוד גיליונות, הטבות או עדכונים במייל.</p>
    <form method="POST" action="${base}?resubscribe=1" style="margin:0;">
      <button type="submit" ${btn('#2563eb', false)}>הסרתי בטעות, החזירו אותי</button>
    </form>`)
}

export const backPage = () => page('חזרתם לרשימת התפוצה', `<h1 style="margin:0 0 10px;color:#047857;font-size:20px;">חזרתם לרשימת התפוצה</h1>
  <p style="margin:0;color:#64748b;font-size:14px;line-height:1.7;">הגיליון והעדכונים הבאים יישלחו אליכם כרגיל.</p>`)

/** הסרה מכל המערכת: רשימת ההסרות הכללית, וגם המנוי לגיליון אם קיים. */
export async function removeEverywhere(db: SupabaseClient, rawEmail: string): Promise<boolean> {
  const email = rawEmail.trim().toLowerCase()
  const now = new Date().toISOString()
  const { error } = await db.from('unsubscribes').upsert({ email, reason: 'user' }, { onConflict: 'email', ignoreDuplicates: true })
  if (error) { console.error('[gilyonot] הסרה מכל המערכת נכשלה:', error.message); return false }
  await db.from('gilyonot_subscribers').update({ status: 'unsubscribed', unsubscribed_at: now, updated_at: now }).eq('email', email).neq('status', 'unsubscribed')
  return true
}

/** החזרה אחרי הסרה בטעות: מוחקים מרשימת ההסרות ומחזירים את המנוי לגיליון. */
export async function restoreEverywhere(db: SupabaseClient, rawEmail: string): Promise<boolean> {
  const email = rawEmail.trim().toLowerCase()
  const now = new Date().toISOString()
  const { error } = await db.from('unsubscribes').delete().eq('email', email)
  if (error) { console.error('[gilyonot] החזרה נכשלה:', error.message); return false }
  await db.from('gilyonot_subscribers').update({ status: 'active', unsubscribed_at: null, consent_at: now, updated_at: now }).eq('email', email).eq('status', 'unsubscribed')
  return true
}

export async function isRemoved(db: SupabaseClient, rawEmail: string): Promise<boolean> {
  const { data } = await db.from('unsubscribes').select('email').eq('email', rawEmail.trim().toLowerCase()).maybeSingle()
  return !!data
}

/** מסנן מרשימת נמענים כל מי שנמצא ברשימת ההסרות (השוואה בלי רישיות ורווחים). */
export function withoutRemoved<T>(list: T[], removed: Set<string>, emailOf: (x: T) => string): T[] {
  return list.filter(x => !removed.has(emailOf(x).trim().toLowerCase()))
}
