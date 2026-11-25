'use client'
import { useState } from 'react'
import { Eye, FileDown, RotateCcw } from 'lucide-react'
import { KVITEL_CHANNELS, type KvitelStatus } from '@/lib/kvitel'
import type { KvitelRequestRow } from '@/lib/kvitelQuery'
import { hebrewDay, parseRawFields } from '@/lib/kvitelView'
import KvitelLinesEditor from './KvitelLinesEditor'
import { downloadKvitel } from './KvitelPreview'

// פרטי בקשה שנפתחים מתחת לשורה (לחיצה על השורה מכווצת ומרחיבה, בלי חלונית):
// השמות לעריכה, מה שנכתב במקור, ופעולות שלא נמצאות בשורה עצמה.
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')
const btn = 'flex h-9 items-center gap-1.5 rounded-[10px] border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:border-[#cfc8bb] disabled:opacity-40'
const h = 'mb-2 text-xs font-bold tracking-wide text-ink-soft'

export default function KvitelRowDetails({ r, canEdit, editing, onEditing, busy, setStatus, onPreview, onSaved }: {
  r: KvitelRequestRow
  canEdit: boolean
  editing: boolean
  onEditing: (on: boolean) => void
  busy: boolean
  setStatus: (ids: string[], status: KvitelStatus) => void
  onPreview: (r: KvitelRequestRow) => void
  onSaved: (msg: string) => void
}) {
  const [downloading, setDownloading] = useState(false)
  // דרך downloadKvitel: הנתיב מחזיר JSON מעורבל (נטפרי), וקישור רגיל היה מציג אותו כטקסט במקום קובץ
  async function download() {
    setDownloading(true)
    const err = await downloadKvitel('/api/admin/kvitel/export?status=all', [r.id])
    setDownloading(false)
    if (err) onSaved(err)
  }
  const lines = r.kvitel_request_lines
  const rawFields = parseRawFields(r.raw_text)
  const playable = !!r.recording_url && /^(https?:|\/)/.test(r.recording_url)
  return (
    <div className="grid gap-5 text-start md:grid-cols-[3fr_2fr]">
      <section>
        <h3 className={h}>שמות ({lines.length})</h3>
        <KvitelLinesEditor key={`${r.id}:${editing}:${lines.map(l => l.id).join()}`} requestId={r.id} lines={lines}
          contact={{ name: r.contact_name, phone: r.contact_phone, email: r.contact_email }}
          onCancel={() => onEditing(false)} editable={canEdit && editing} onSaved={m => { onEditing(false); onSaved(m) }} />
      </section>
      <section className="space-y-4">
        <div>
          <h3 className={h}>מה שנכתב במקור</h3>
          <div className="space-y-2 text-sm text-ink-soft">
            {r.recording_url && !playable && <p>ההקלטה נשמרה במערכת הטלפון הקודמת ואינה זמינה להשמעה כאן.</p>}
            {playable && <audio controls preload="none" src={r.recording_url ?? undefined} className="w-full" aria-label="ההקלטה של המתקשר" />}
            {rawFields.length
              ? <table className="w-full"><tbody className="divide-y divide-line">
                  {rawFields.map((f, i) => <tr key={i}><th scope="row" className="w-2/5 py-1.5 pe-3 text-start font-medium">{f.key}</th><td className="break-words py-1.5 text-ink">{f.value}</td></tr>)}
                </tbody></table>
              : r.raw_text ? <p className="max-h-60 overflow-auto whitespace-pre-wrap break-words">{r.raw_text}</p>
              : !r.recording_url && <p className="text-ink-faint">אין מקור שמור</p>}
          </div>
        </div>
        <p className="text-xs text-ink-faint">
          {KVITEL_CHANNELS[r.channel]} · הוגשה {fmt(r.submitted_at)} ({hebrewDay(r.submitted_at)}){r.done_at ? ` · נשלחה לציון ${fmt(r.done_at)}` : ''}
          {r.note ? <><br />הערה: {r.note}</> : null}
        </p>
        <div className="flex flex-wrap gap-2">
          {lines.length > 0 && <button type="button" className={btn} onClick={() => onPreview(r)}><Eye className="h-4 w-4" aria-hidden /> תצוגה בקובץ</button>}
          {r.status === 'done' && (
            <button type="button" className={btn} disabled={downloading} onClick={() => void download()}><FileDown className="h-4 w-4" aria-hidden /> {downloading ? 'מוריד…' : 'הורדת הקובץ'}</button>
          )}
          {canEdit && r.status === 'cancelled' && (
            <button type="button" className={btn} disabled={busy} onClick={() => setStatus([r.id], 'pending')}><RotateCcw className="h-4 w-4" aria-hidden /> שחזור הבקשה</button>
          )}
        </div>
      </section>
    </div>
  )
}
