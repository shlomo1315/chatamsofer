import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { DEFAULT_LABELS, type MailLabel } from '@/lib/mailLabels'

export const dynamic = 'force-dynamic'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function getSetting(key: string): Promise<unknown> {
  const { data } = await adminClient().from('app_settings').select('value').eq('key', key).maybeSingle()
  if (!data?.value) return null
  try { return JSON.parse(data.value) } catch { return null }
}

async function setSetting(key: string, value: unknown) {
  await adminClient().from('app_settings').upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() })
}

// GET → { labels, assignments, internalEmails }
export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const [labels, assignments, internalEmails] = await Promise.all([
    getSetting('mail_label_defs'),
    getSetting('mail_label_assignments'),
    getSetting('internal_emails'),
  ])
  return NextResponse.json({
    labels: (labels as MailLabel[] | null) ?? DEFAULT_LABELS,
    assignments: (assignments as Record<string, string[]> | null) ?? {},
    internalEmails: (internalEmails as InternalEmail[] | null) ?? [],
  })
}

// POST body variants:
//  { action: 'create_label', name, color }
//  { action: 'delete_label', id }
//  { action: 'assign', messageId, labelId }
//  { action: 'unassign', messageId, labelId }
//  { action: 'save_internal_emails', emails: [{name,email}] }
export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const body = await request.json()
  const { action } = body

  if (action === 'create_label') {
    const labels: MailLabel[] = ((await getSetting('mail_label_defs')) as MailLabel[] | null) ?? DEFAULT_LABELS
    const newLabel: MailLabel = { id: crypto.randomUUID(), name: body.name, color: body.color ?? '#6366f1' }
    await setSetting('mail_label_defs', [...labels, newLabel])
    return NextResponse.json({ ok: true, label: newLabel })
  }

  if (action === 'delete_label') {
    const labels: MailLabel[] = ((await getSetting('mail_label_defs')) as MailLabel[] | null) ?? DEFAULT_LABELS
    await setSetting('mail_label_defs', labels.filter(l => l.id !== body.id))
    // also remove from assignments
    const assignments: Record<string, string[]> = ((await getSetting('mail_label_assignments')) as Record<string, string[]> | null) ?? {}
    for (const msgId of Object.keys(assignments)) {
      assignments[msgId] = assignments[msgId].filter((id: string) => id !== body.id)
    }
    await setSetting('mail_label_assignments', assignments)
    return NextResponse.json({ ok: true })
  }

  if (action === 'assign') {
    const assignments: Record<string, string[]> = ((await getSetting('mail_label_assignments')) as Record<string, string[]> | null) ?? {}
    const existing = assignments[body.messageId] ?? []
    if (!existing.includes(body.labelId)) {
      assignments[body.messageId] = [...existing, body.labelId]
      await setSetting('mail_label_assignments', assignments)
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'unassign') {
    const assignments: Record<string, string[]> = ((await getSetting('mail_label_assignments')) as Record<string, string[]> | null) ?? {}
    assignments[body.messageId] = (assignments[body.messageId] ?? []).filter((id: string) => id !== body.labelId)
    await setSetting('mail_label_assignments', assignments)
    return NextResponse.json({ ok: true })
  }

  if (action === 'save_internal_emails') {
    await setSetting('internal_emails', body.emails)
    return NextResponse.json({ ok: true })
  }

  if (action === '_set_label_defs') {
    await setSetting('mail_label_defs', body.labels)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}

// ─── Types ─────────────────────────────────────────────────────────────────────
// DEFAULT_LABELS ו-MailLabel מיובאים מ-lib/mailLabels (מקור אמת יחיד).

interface InternalEmail { name: string; email: string }
