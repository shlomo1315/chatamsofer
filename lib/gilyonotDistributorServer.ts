import { Resend } from 'resend'
import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from '@/lib/sendMail'
import { GILYONOT_FROM_EMAIL, GILYONOT_FROM_NAME, normalizeEmail } from '@/lib/gilyonot'
import { escHtml } from '@/lib/gilyonotMail'
import {
  EVENT_LABELS, normalizeAgentHours, planDistributorAction,
  type AgentWindow, type DistributorSnapshot, type EventChannel,
} from '@/lib/gilyonotDistributors'

// ─────────────────────────────────────────────────────────────────────────────
// מערך המפיצים, צד השרת: ביצוע פעולת מפיץ, הודעה לשליח, ושליחת הודעות למפיצים.
// הכללים עצמם (מה כל פעולה עושה) ב-lib/gilyonotDistributors.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const DISTRIBUTOR_COLS = 'id, full_name, phone, phone2, email, id_number, city, address, synagogue, quantity, notes, status, source, removed_at, removed_reason, created_at, updated_at'

export interface DistributorSettings {
  courier_name: string | null
  courier_email: string | null
  agent_phone: string | null
  agent_hours: AgentWindow[]
}

export async function loadDistributorSettings(db: SupabaseClient): Promise<DistributorSettings> {
  const { data } = await db.from('gilyonot_distributor_settings').select('courier_name, courier_email, agent_phone, agent_hours').eq('id', 1).maybeSingle()
  return {
    courier_name: data?.courier_name ?? null,
    courier_email: data?.courier_email ?? null,
    agent_phone: data?.agent_phone ?? null,
    agent_hours: normalizeAgentHours(data?.agent_hours) ?? [],
  }
}

const from = () => `${GILYONOT_FROM_NAME} <${GILYONOT_FROM_EMAIL}>`

/** מייל פשוט בעיצוב הגיליונות: כותרת, פסקאות, ושורות "תווית: ערך". */
export function distributorMailHtml(title: string, body: string, rows: [string, string | number | null | undefined][] = []): string {
  const paras = body.trim() ? body.trim().split(/\n\s*\n/).map(p =>
    `<p style="margin:0 0 14px;color:#334155;font-size:16px;line-height:1.8;">${escHtml(p.trim()).replace(/\n/g, '<br/>')}</p>`).join('') : ''
  const table = rows.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) =>
    `<tr><td style="padding:6px 0;color:#64748b;font-size:14px;white-space:nowrap;vertical-align:top;">${escHtml(k)}</td><td style="padding:6px 12px 6px 0;color:#0f172a;font-size:15px;">${escHtml(String(v))}</td></tr>`).join('')
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"/><title>${escHtml(title)}</title></head>
<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;direction:rtl;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#1B3256;padding:20px 24px;"><h1 style="margin:0;color:#ffffff;font-size:20px;line-height:1.4;">${escHtml(title)}</h1></td></tr>
<tr><td style="padding:24px;">${paras}${table ? `<table role="presentation" cellpadding="0" cellspacing="0">${table}</table>` : ''}</td></tr>
<tr><td style="padding:14px 24px;background:#f8fafc;color:#94a3b8;font-size:12px;">${escHtml(GILYONOT_FROM_NAME)} · מערך המפיצים</td></tr>
</table></td></tr></table></body></html>`
}

type DistRow = DistributorSnapshot & { full_name: string; phone: string | null; synagogue: string | null }

/** הודעה לשליח (כתובת שהשתנתה, מפיץ שהתנתק). בלי שליח מוגדר, מדלג בשקט. */
export async function notifyCourier(db: SupabaseClient, d: DistRow, kind: 'address' | 'leave', details: string | null, newAddress?: { address: unknown; city: unknown }): Promise<boolean> {
  const s = await loadDistributorSettings(db)
  const to = normalizeEmail(s.courier_email)
  if (!to) return false
  const title = kind === 'leave' ? `מפיץ התנתק: ${d.full_name}` : `כתובת חדשה למפיץ: ${d.full_name}`
  const body = kind === 'leave'
    ? `${s.courier_name ? `שלום ${s.courier_name},\n\n` : ''}המפיץ הבא התנתק ממערך ההפצה. מהשבוע אין להביא אליו גיליונות.`
    : `${s.courier_name ? `שלום ${s.courier_name},\n\n` : ''}המפיץ הבא עדכן כתובת. מהשבוע יש להביא את הגיליונות לכתובת החדשה.`
  const html = distributorMailHtml(title, body, [
    ['שם', d.full_name], ['טלפון', d.phone], ['עיר', kind === 'address' ? String(newAddress?.city ?? '') : d.city],
    ['בית כנסת', d.synagogue],
    [kind === 'address' ? 'כתובת חדשה' : 'כתובת', kind === 'address' ? String(newAddress?.address ?? '') : d.address],
    ...(kind === 'address' ? [['כתובת קודמת', d.address] as [string, string | null]] : []),
    ['כמות שבועית', d.quantity], ['הערה', details],
  ])
  const res = await deliverMail(to, title, html, undefined, { transactional: true, gmailPriority: 'normal', fromName: GILYONOT_FROM_NAME, fromEmail: GILYONOT_FROM_EMAIL })
  if (!res.ok) console.error('[gilyonot-distributors] courier mail failed:', res.error)
  return res.ok
}

/**
 * מבצע פעולה של מפיץ: רושם אירוע, מעדכן את השורה כשצריך, ומודיע לשליח.
 * ⚠️ הקורא אחראי לוודא שהמפיץ שייך למי שמבקש (סשן באתר / זיהוי בטלפון).
 */
export async function runDistributorAction(db: SupabaseClient, distributorId: string, action: unknown, input: Record<string, unknown>, channel: EventChannel): Promise<{ ok: true; message: string } | { ok: false; error: string; status: number }> {
  const { data: d } = await db.from('gilyonot_distributors').select('id, full_name, phone, city, address, synagogue, quantity, status').eq('id', distributorId).maybeSingle()
  if (!d) return { ok: false, error: 'המפיץ לא נמצא', status: 404 }
  const res = planDistributorAction(d as DistRow, action, input)
  if (!res.ok) return { ok: false, error: res.error, status: 400 }
  const { plan } = res
  const now = new Date().toISOString()

  if (plan.update) {
    const update = { ...plan.update, updated_at: now, ...(plan.update.removed_at ? { removed_at: now } : {}) }
    // ⚠️ מותנה ב-status=active: שתי התנתקויות במקביל לא ישלחו לשליח פעמיים
    const { data: changed, error } = await db.from('gilyonot_distributors').update(update).eq('id', d.id).eq('status', 'active').select('id')
    if (error) return { ok: false, error: 'השמירה נכשלה', status: 500 }
    if (!changed?.length) return { ok: false, error: 'המפיץ כבר אינו פעיל במערך', status: 409 }
  }
  const { error: evErr } = await db.from('gilyonot_distributor_events').insert({
    distributor_id: d.id, channel, ...plan.event, handled_at: plan.event.status === 'open' ? null : now,
  })
  if (evErr) return { ok: false, error: 'השמירה נכשלה', status: 500 }

  if (plan.notifyCourier) {
    const kind = plan.event.kind === 'leave' ? 'leave' : 'address'
    await notifyCourier(db, d as DistRow, kind, plan.event.details, plan.update as { address: unknown; city: unknown })
  }
  return { ok: true, message: plan.message }
}

export const eventTitle = (kind: string) => EVENT_LABELS[kind as keyof typeof EVENT_LABELS] ?? kind

// ── הודעה לכל המפיצים הפעילים, או לעיר אחת ──
const BATCH_SIZE = 100
const THROTTLE_MS = 500
const PAGE = 1000
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function sendDistributorBroadcast(db: SupabaseClient, opts: { subject: string; body: string; city: string | null; createdBy: string | null }): Promise<{ ok: true; recipients: number; sent: number; failed: number; skipped: number } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'שירות המייל אינו מוגדר (RESEND_API_KEY)' }

  const all: { full_name: string; email: string | null }[] = []
  for (let offset = 0; ; offset += PAGE) {
    let q = db.from('gilyonot_distributors').select('full_name, email').eq('status', 'active').order('id').range(offset, offset + PAGE - 1)
    if (opts.city) q = q.eq('city', opts.city)
    const { data, error } = await q
    if (error) return { ok: false, error: 'טעינת המפיצים נכשלה' }
    all.push(...(data ?? []))
    if ((data ?? []).length < PAGE) break
  }
  if (!all.length) return { ok: false, error: opts.city ? `אין מפיצים פעילים ב${opts.city}` : 'אין מפיצים פעילים' }

  // מפיץ בכמה בתי כנסת מקבל הודעה אחת
  const byEmail = new Map<string, string>()
  let skipped = 0
  for (const r of all) {
    const e = normalizeEmail(r.email)
    if (!e) { skipped++; continue }
    if (!byEmail.has(e)) byEmail.set(e, r.full_name)
  }

  const resend = new Resend(apiKey)
  const list = [...byEmail]
  let sent = 0, failed = 0
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const chunk = list.slice(i, i + BATCH_SIZE)
    try {
      const { error } = await resend.batch.send(chunk.map(([to, name]) => ({
        from: from(), to, subject: opts.subject,
        html: distributorMailHtml(opts.subject, `לכבוד ${name},\n\n${opts.body}`),
        tracking: { open: false, click: false },
      })))
      if (error) throw new Error(String(error.message ?? error))
      sent += chunk.length
    } catch (err) {
      console.error('[gilyonot-distributors] broadcast batch failed:', err instanceof Error ? err.message : err)
      failed += chunk.length
    }
    if (i + BATCH_SIZE < list.length) await sleep(THROTTLE_MS)
  }

  await db.from('gilyonot_distributor_messages').insert({
    subject: opts.subject, body: opts.body, city: opts.city, recipients: all.length,
    sent_count: sent, failed_count: failed, skipped_count: skipped, created_by: opts.createdBy,
  })
  return { ok: true, recipients: all.length, sent, failed, skipped }
}
