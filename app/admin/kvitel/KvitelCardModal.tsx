'use client'
import { Check, ShieldCheck, BookCheck, X, Eye } from 'lucide-react'
import { KVITEL_CHANNELS, KVITEL_STATUSES, formatLine, type KvitelStatus } from '@/lib/kvitel'
import type { KvitelRequestRow } from '@/lib/kvitelQuery'
import RecordModal, { modalBtn, type RecordTone } from '@/components/admin/system/RecordModal'

// כרטסת בקשת קוויטל: הגדרות בלבד, התצוגה ב-RecordModal המשותף.
// ⚠️ אין בטבלאות הקוויטל שרשור הודעות, ולכן לא נבנה כאן.
// הפעולות (שינוי סטטוס, אישור עם מילון) מגיעות מהרשימה ורצות דרך אותם נתיבי שרת.

const TONE: Record<KvitelStatus, RecordTone> = { review: 'chk', pending: 'wait', done: 'ok', cancelled: 'no' }
const STEP_OF: Record<KvitelStatus, number> = { review: 0, pending: 1, done: 2, cancelled: 2 }
const STEPS = ['לבדיקה', 'ממתין לשליחה', 'נשלח לציון']
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')

export default function KvitelCardModal({ rows, index, onIndex, onClose, canEdit, busy, setStatus, approveWithDictionary, onPreview }: {
  rows: KvitelRequestRow[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  canEdit: boolean
  busy: boolean
  setStatus: (ids: string[], status: KvitelStatus) => void
  approveWithDictionary: (r: KvitelRequestRow) => void
  onPreview: (r: KvitelRequestRow) => void
}) {
  const r = rows[index]
  const lines = r.kvitel_request_lines
  const flagged = lines.filter(l => l.flagged).length
  const playable = !!r.recording_url && /^(https?:|\/)/.test(r.recording_url)
  return (
    <RecordModal
      kind="בקשת קוויטל"
      crumb={`קוויטלך / ${r.contact_name || fmt(r.submitted_at)}`}
      title={r.contact_name || 'בקשה ללא שם'}
      meta={[
        { label: 'ערוץ', value: KVITEL_CHANNELS[r.channel] },
        ...(r.contact_phone ? [{ label: 'טלפון', value: r.contact_phone, ltr: true }] : []),
      ]}
      statusLabel={KVITEL_STATUSES[r.status]}
      statusTone={TONE[r.status]}
      stampDate={fmt(r.submitted_at)}
      facts={[
        { label: 'שמות', value: String(lines.length) },
        { label: 'לבדיקה', value: String(flagged) },
        { label: 'הוגשה', value: fmt(r.submitted_at) },
        { label: 'נשלחה לציון', value: fmt(r.done_at) },
      ]}
      readiness={[
        { label: 'זוהו שמות', ok: lines.length > 0 },
        { label: 'ללא סימוני בדיקה', ok: flagged === 0 },
      ]}
      steps={{ labels: STEPS, current: STEP_OF[r.status], rejected: r.status === 'cancelled' }}
      sections={[{ title: 'פרטי המגיש', fields: [
        { label: 'שם', value: r.contact_name },
        { label: 'טלפון', value: r.contact_phone, ltr: true, copy: true },
        { label: 'מייל', value: r.contact_email, ltr: true, copy: true },
        { label: 'ערוץ', value: KVITEL_CHANNELS[r.channel] },
      ] }]}
      note={r.note ? { title: 'הערה', text: r.note } : undefined}
      tabs={[
        { key: 'names', label: 'שמות', count: lines.length, content: lines.length === 0 ? (
          <p className="rounded-lg bg-gold-soft px-3 py-2 text-sm text-ink">לא זוהו שמות. יש לקרוא את המקור ולהקליד את השמות בטופס, ואז לבטל בקשה זו.</p>
        ) : (
          <ol className="space-y-1.5">
            {lines.map(l => (
              <li key={l.id} className="break-words border-s-2 border-navy/20 ps-3 text-base text-ink">
                {formatLine({ name: l.name, relation: l.relation, parentName: l.parent_name, requestType: l.request_type, requestNote: l.request_note })}
                {l.flagged && <span className="ms-2 rounded bg-gold-soft px-1.5 text-xs text-navy">{l.flag_reason || 'לבדיקה'}</span>}
              </li>
            ))}
          </ol>
        ) },
        { key: 'source', label: 'מקור והקלטה', content: (
          <div className="space-y-3 text-sm text-ink-soft">
            {r.recording_url && !playable && <p>ההקלטה נשמרה במערכת הטלפון הקודמת ואינה זמינה להשמעה כאן.</p>}
            {playable && <audio controls preload="none" src={r.recording_url ?? undefined} className="w-full" aria-label="ההקלטה של המתקשר" />}
            {r.raw_text ? <p className="whitespace-pre-wrap break-words">{r.raw_text}</p> : !r.recording_url && <p className="text-ink-faint">אין מקור שמור</p>}
          </div>
        ) },
      ]}
      actions={<>
        {lines.length > 0 && (
          <button type="button" className={modalBtn.ghost} onClick={() => onPreview(r)}><Eye size={14} /> תצוגה בקובץ</button>
        )}
        {canEdit && r.status === 'review' && lines.length > 0 && (<>
          <button type="button" disabled={busy} className={modalBtn.primary} onClick={() => setStatus([r.id], 'pending')}><ShieldCheck size={14} /> אישור</button>
          <button type="button" disabled={busy} className={modalBtn.ghost} onClick={() => approveWithDictionary(r)}><BookCheck size={14} /> אישור והוספה למילון</button>
        </>)}
        {canEdit && r.status === 'pending' && (
          <button type="button" disabled={busy} className={modalBtn.primary} onClick={() => setStatus([r.id], 'done')}><Check size={14} /> נשלח לציון</button>
        )}
        {canEdit && r.status !== 'cancelled' && r.status !== 'done' && (
          <button type="button" disabled={busy} className={modalBtn.ghost} onClick={() => setStatus([r.id], 'cancelled')}><X size={14} /> ביטול</button>
        )}
      </>}
      index={index}
      total={rows.length}
      onIndex={onIndex}
      onClose={onClose}
    />
  )
}
