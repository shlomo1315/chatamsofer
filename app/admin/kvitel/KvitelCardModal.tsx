'use client'
import { Check, ShieldCheck, BookCheck, X, Eye, FileDown, RotateCcw } from 'lucide-react'
import { KVITEL_CHANNELS, KVITEL_STATUSES, type KvitelStatus } from '@/lib/kvitel'
import type { KvitelRequestRow } from '@/lib/kvitelQuery'
import { hebrewDay, parseRawFields, reviewReason } from '@/lib/kvitelView'
import KvitelLinesEditor from './KvitelLinesEditor'
import RecordModal, { modalBtn, type RecordTone } from '@/components/admin/system/RecordModal'

// כרטסת בקשת קוויטל: הגדרות בלבד, התצוגה ב-RecordModal המשותף.
// ⚠️ אין בטבלאות הקוויטל שרשור הודעות, ולכן לא נבנה כאן.
// הפעולות (שינוי סטטוס, אישור עם מילון) מגיעות מהרשימה ורצות דרך אותם נתיבי שרת.

const TONE: Record<KvitelStatus, RecordTone> = { review: 'chk', pending: 'wait', done: 'ok', cancelled: 'no' }
const STEP_OF: Record<KvitelStatus, number> = { review: 0, pending: 1, done: 2, cancelled: 2 }
const STEPS = ['לבדיקה', 'ממתין לשליחה', 'נשלח לציון']
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')

export default function KvitelCardModal({ rows, index, onIndex, onClose, canEdit, busy, setStatus, approveWithDictionary, onPreview, onSaved }: {
  rows: KvitelRequestRow[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  canEdit: boolean
  busy: boolean
  setStatus: (ids: string[], status: KvitelStatus) => void
  approveWithDictionary: (r: KvitelRequestRow) => void
  onPreview: (r: KvitelRequestRow) => void
  onSaved: (msg: string) => void
}) {
  const r = rows[index]
  const lines = r.kvitel_request_lines
  const flagged = lines.filter(l => l.flagged).length
  const reason = r.status === 'review' ? reviewReason(r) : null
  const rawFields = parseRawFields(r.raw_text)
  const playable = !!r.recording_url && /^(https?:|\/)/.test(r.recording_url)
  return (
    <RecordModal
      kind="בקשת קוויטל"
      crumb={`קוויטלך / ${r.contact_name || fmt(r.submitted_at)}`}
      title={r.contact_name || 'בקשה ללא שם'}
      meta={[
        { label: 'מס׳ בקשה', value: r.id.slice(0, 8), ltr: true },
        { label: 'ערוץ', value: KVITEL_CHANNELS[r.channel] },
        ...(r.contact_phone ? [{ label: 'טלפון', value: r.contact_phone, ltr: true }] : []),
      ]}
      statusLabel={KVITEL_STATUSES[r.status]}
      statusTone={TONE[r.status]}
      stampDate={`${fmt(r.submitted_at)} · ${hebrewDay(r.submitted_at)}`}
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
      note={reason || r.note ? { title: reason ? 'למה לבדיקה' : 'הערה', text: [reason, r.note].filter(Boolean).join(' · ') } : undefined}
      tabs={[
        { key: 'names', label: 'שמות', count: lines.length, content: (
          <KvitelLinesEditor key={`${r.id}:${lines.map(l => l.id).join()}`} requestId={r.id} lines={lines} editable={canEdit && r.status === 'review'} onSaved={onSaved} />
        ) },
        { key: 'source', label: 'מה שנכתב בטופס', content: (
          <div className="space-y-3 text-sm text-ink-soft">
            {r.recording_url && !playable && <p>ההקלטה נשמרה במערכת הטלפון הקודמת ואינה זמינה להשמעה כאן.</p>}
            {playable && <audio controls preload="none" src={r.recording_url ?? undefined} className="w-full" aria-label="ההקלטה של המתקשר" />}
            {r.raw_text ? <p className="whitespace-pre-wrap break-words">{r.raw_text}</p> : !r.recording_url && <p className="text-ink-faint">אין מקור שמור</p>}
          </div>
        ) },
        ...(rawFields.length ? [{ key: 'raw', label: 'נתונים גולמיים', count: rawFields.length, content: (
          <table className="w-full text-sm"><tbody className="divide-y divide-line">
            {rawFields.map((f, i) => <tr key={i}><th scope="row" className="w-2/5 py-1.5 pe-3 text-start font-medium text-ink-soft">{f.key}</th><td className="break-words py-1.5 text-ink">{f.value}</td></tr>)}
          </tbody></table>
        ) }] : []),
      ]}
      actions={<>
        {lines.length > 0 && (
          <button type="button" className={modalBtn.ghost} onClick={() => onPreview(r)}><Eye size={14} /> תצוגה בקובץ</button>
        )}
        {canEdit && r.status === 'review' && lines.length > 0 && (<>
          <button type="button" disabled={busy} className={modalBtn.primary} onClick={() => setStatus([r.id], 'pending')}><ShieldCheck size={14} /> אישור והעברה לשליחה</button>
          <button type="button" disabled={busy} className={modalBtn.ghost} onClick={() => approveWithDictionary(r)}><BookCheck size={14} /> אישור והוספה למילון</button>
        </>)}
        {canEdit && r.status === 'pending' && (
          <button type="button" disabled={busy} className={modalBtn.primary} onClick={() => setStatus([r.id], 'done')}><Check size={14} /> נשלח לציון</button>
        )}
        {r.status === 'done' && (
          <a href={`/api/admin/kvitel/export?status=all&ids=${r.id}`} className={modalBtn.ghost}><FileDown size={14} /> הורדת הקובץ</a>
        )}
        {canEdit && r.status === 'cancelled' && (
          <button type="button" disabled={busy} className={modalBtn.ghost} onClick={() => setStatus([r.id], 'review')}><RotateCcw size={14} /> שחזור הבקשה</button>
        )}
        {canEdit && r.status !== 'cancelled' && r.status !== 'done' && (
          <button type="button" disabled={busy} className={modalBtn.ghost} onClick={() => setStatus([r.id], 'cancelled')}><X size={14} /> ביטול הבקשה</button>
        )}
      </>}
      index={index}
      total={rows.length}
      onIndex={onIndex}
      onClose={onClose}
    />
  )
}
