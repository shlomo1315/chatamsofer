// ─────────────────────────────────────────────────────────────────────────────
// התאמה יומית מול נדרים: לכל יולדת שנטענה בימים האחרונים — האם בכרטיס שלה יש
// תלוש שאנחנו לא מכירים (למשל טעינה ישירה בנדרים, או כפולה). קריאה בלבד.
// ממצא → מייל לכתובות של התראות המלאי. מוגן ב-CRON_SECRET, ורץ רק בשרת (IP).
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse, type NextRequest } from 'next/server'
import { verifyCronSecret, getServiceClient } from '@/lib/apiAuth'
import { getNedarimCreds, getClientCardFull } from '@/lib/nedarim'
import { tlushimOf } from '@/lib/maternityLoadGuard'
import { getAlertSettings } from '@/lib/cardStock'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'

export const dynamic = 'force-dynamic'
export const maxDuration = 300
const SPACING_MS = 150

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || !verifyCronSecret(request)) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })
  const creds = await getNedarimCreds()
  if (!creds) return NextResponse.json({ error: 'נדרים לא מוגדר' }, { status: 400 })

  const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get('days')) || 3, 1), 30)
  const since = new Date(Date.now() - days * 86400_000).toISOString()

  // תיקים שנטענו לאחרונה, ולכל משפחה כל התלושים שאנחנו מכירים (תיק נוכחי + לוג)
  const { data: aids } = await db.from('maternity_aids')
    .select('id, beneficiary_id, card_tlush_id, beneficiaries(full_name, family_name, nedarim_id)')
    .eq('card_load_status', 'loaded').gte('card_loaded_at', since).limit(500)

  const findings: { name: string; clientId: string; unknownTlushim: string[] }[] = []
  let checked = 0
  for (const a of (aids ?? []) as unknown as { id: string; beneficiary_id: string; beneficiaries: unknown }[]) {
    const b = (Array.isArray(a.beneficiaries) ? a.beneficiaries[0] : a.beneficiaries) as
      { full_name?: string; family_name?: string; nedarim_id?: string | null } | null
    if (!b?.nedarim_id) continue
    const known = new Set<string>()
    const { data: mine } = await db.from('maternity_aids').select('card_tlush_id').eq('beneficiary_id', a.beneficiary_id)
    for (const m of mine ?? []) if (m.card_tlush_id) known.add(String(m.card_tlush_id))
    const { data: logs } = await db.from('activity_log').select('details')
      .eq('action', 'maternity_card_loaded').in('entity_id', (await db.from('maternity_aids').select('id').eq('beneficiary_id', a.beneficiary_id)).data?.map(x => x.id) ?? [])
    for (const l of logs ?? []) { const t = (l.details as { tlushId?: unknown } | null)?.tlushId; if (t) known.add(String(t)) }

    let card: unknown = null
    try { card = await getClientCardFull(creds, String(b.nedarim_id)) } catch { /* ממשיכים */ }
    checked++
    if (card) {
      const unknown = tlushimOf(card).map(t => String(t.Id ?? t.TlushId ?? '').trim()).filter(id => id && !known.has(id))
      if (unknown.length) findings.push({ name: `${b.full_name ?? ''} ${b.family_name ?? ''}`.trim(), clientId: String(b.nedarim_id), unknownTlushim: unknown })
    }
    await new Promise(r => setTimeout(r, SPACING_MS))
  }

  if (findings.length) {
    try {
      const { emails } = await getAlertSettings(db)
      const html = `<div dir="rtl" style="font-family:Heebo,Arial,sans-serif"><h3>⚠️ נמצאו תלושים לא מוכרים בכרטיסי יולדות</h3><ul>${findings.map(f => `<li>${f.name} (נדרים ${f.clientId}): ${f.unknownTlushim.join(', ')}</li>`).join('')}</ul></div>`
      for (const to of emails) await deliverMail(to, '⚠️ התאמת טעינות יולדות: נמצאה חריגה', html, undefined, mailFor('maternity'))
    } catch (e) { console.error('[maternity-load-audit] mail failed:', e) }
  }
  return NextResponse.json({ checked, findingsCount: findings.length, findings })
}
