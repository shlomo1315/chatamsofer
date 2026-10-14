import type { SupabaseClient } from '@supabase/supabase-js'
import { personKey, type KvitelChannel, type KvitelLineInput, type KvitelStatus } from '@/lib/kvitel'

// ─────────────────────────────────────────────────────────────────────────────
// קליטת הגשת קוויטל — נקודת כניסה אחת לכל הערוצים.
//
// לינק ונדרים פלוס נכנסים ישר כ"ממתין"; טלפון ומייל (פענוח אוטומטי) ייכנסו
// כ"לבדיקה" עד שאיש צוות מאשר. המגיש מזוהה לפי טלפון, או לפי מייל אם אין.
// השמות נשמרים אצלו, כדי שבפעם הבאה יוצעו לו לאישור.
// ─────────────────────────────────────────────────────────────────────────────

export interface KvitelSubmission {
  channel: KvitelChannel
  status?: KvitelStatus
  phone?: string | null
  email?: string | null
  contactName?: string | null
  lines: KvitelLineInput[]
  rawText?: string | null
  recordingUrl?: string | null
  sourceRef?: string | null
  note?: string | null
}

async function findOrCreateRequester(db: SupabaseClient, s: KvitelSubmission): Promise<string | null> {
  const phone = s.phone || null
  const email = s.email?.toLowerCase() || null
  if (!phone && !email) return null
  const col = phone ? 'phone' : 'email'
  const val = (phone ?? email)!
  const { data: existing } = await db.from('kvitel_requesters').select('id, full_name, email, phone').eq(col, val).maybeSingle()
  if (existing) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (s.contactName) patch.full_name = s.contactName
    if (email && !existing.email) patch.email = email
    await db.from('kvitel_requesters').update(patch).eq('id', existing.id)
    return existing.id as string
  }
  const { data, error } = await db.from('kvitel_requesters')
    .insert({ phone, email, full_name: s.contactName || null }).select('id').single()
  if (error) {
    // מרוץ: הגשה מקבילה מאותו טלפון יצרה אותו ברגע זה.
    const again = await db.from('kvitel_requesters').select('id').eq(col, val).maybeSingle()
    return (again.data?.id as string) ?? null
  }
  return data.id as string
}

export async function ingestKvitel(db: SupabaseClient, s: KvitelSubmission): Promise<{ ok: true; requestId: string } | { ok: false; error: string }> {
  const requesterId = await findOrCreateRequester(db, s)

  const { data: req, error } = await db.from('kvitel_requests').insert({
    requester_id: requesterId,
    channel: s.channel,
    status: s.status ?? 'pending',
    contact_name: s.contactName || null,
    contact_phone: s.phone || null,
    contact_email: s.email?.toLowerCase() || null,
    raw_text: s.rawText ?? null,
    recording_url: s.recordingUrl ?? null,
    source_ref: s.sourceRef ?? null,
    note: s.note ?? null,
  }).select('id').single()
  if (error || !req) {
    console.error('[kvitel] request insert failed:', error)
    return { ok: false, error: 'שמירת הבקשה נכשלה' }
  }

  const { error: linesErr } = await db.from('kvitel_request_lines').insert(s.lines.map((l, i) => ({
    request_id: req.id, position: i,
    name: l.name, relation: l.relation, parent_name: l.parentName,
    request_type: l.requestType, request_note: l.requestNote ?? null,
  })))
  if (linesErr) {
    console.error('[kvitel] lines insert failed:', linesErr)
    await db.from('kvitel_requests').delete().eq('id', req.id)
    return { ok: false, error: 'שמירת השמות נכשלה' }
  }

  // שמות שמורים: אותו אדם (שם+בן/בת+הורה) מתעדכן ולא משתכפל.
  if (requesterId) {
    const now = new Date().toISOString()
    const seen = new Set<string>()
    const rows = s.lines.flatMap(l => {
      const key = personKey(l)
      if (seen.has(key)) return []
      seen.add(key)
      return [{
        requester_id: requesterId, person_key: key, name: l.name, relation: l.relation,
        parent_name: l.parentName, request_type: l.requestType, request_note: l.requestNote ?? null, last_used_at: now,
      }]
    })
    const { error: savedErr } = await db.from('kvitel_saved_names').upsert(rows, { onConflict: 'requester_id,person_key' })
    if (savedErr) console.error('[kvitel] saved names upsert failed:', savedErr)
  }

  return { ok: true, requestId: req.id as string }
}
