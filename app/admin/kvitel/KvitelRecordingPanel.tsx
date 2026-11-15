'use client'
import { useState } from 'react'
import { Check, Pencil, Save } from 'lucide-react'
import { MAX_TRANSCRIPT } from '@/lib/kvitelView'

// שורה מורחבת לבקשה שהוקלטה בטלפון: השמעה, תמלול, "המלל תקין" ו"עריכה".
// ההקלטה ניתנת להשמעה רק כשהכתובת שלה http(s) או יחסית; הקלטה שנשמרה כ-technoline:<נתיב> עדיין לא.

export default function KvitelRecordingPanel({ requestId, recordingUrl, transcript, needsReview, editable, onSaved }: {
  requestId: string; recordingUrl: string; transcript: string | null; needsReview: boolean
  editable: boolean; onSaved: (msg: string) => void
}) {
  const playable = /^(https?:|\/)/.test(recordingUrl)
  const [text, setText] = useState(transcript ?? '')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(approve: boolean) {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/admin/kvitel/transcript', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: requestId, text, approve }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'השמירה נכשלה'); return }
      setEditing(false)
      onSaved(approve ? 'התמלול נשמר והבקשה אושרה' : 'התמלול נשמר')
    } finally {
      setBusy(false)
    }
  }

  const btn = 'flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-semibold disabled:opacity-40'
  return (
    <div className="space-y-4 py-1">
      <div>
        <h3 className="mb-2 text-sm font-bold text-navy">השמעת ההקלטה</h3>
        {playable
          ? <audio controls preload="none" src={recordingUrl} className="w-full" aria-label="ההקלטה של המתקשר" />
          : <p className="rounded-lg bg-[#FBEFD2] px-3 py-2 text-sm text-[#8A5A00]">ההקלטה שמורה בטכנוליין ועדיין אי אפשר להשמיע אותה כאן.</p>}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-bold text-navy">תמלול</h3>
        {editing ? (
          <textarea value={text} onChange={e => setText(e.target.value)} maxLength={MAX_TRANSCRIPT} rows={4} aria-label="תמלול ההקלטה"
            className="w-full rounded-lg border border-line-strong bg-white px-3 py-2 text-base text-ink" />
        ) : text ? (
          <p className="whitespace-pre-wrap break-words text-base text-ink">{text}</p>
        ) : (
          <p className="text-sm text-ink-faint">אין עדיין תמלול. אפשר להקשיב ולהקליד אותו ב«עריכה».</p>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-[#B42318]">{error}</p>}
      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <button type="button" disabled={busy} onClick={() => void save(false)} className={`${btn} bg-navy text-white`}><Save className="h-4 w-4" aria-hidden /> שמירה</button>
              <button type="button" disabled={busy} onClick={() => { setText(transcript ?? ''); setEditing(false) }} className={`${btn} border border-line bg-white text-navy`}>ביטול</button>
            </>
          ) : (
            <>
              {needsReview && <button type="button" disabled={busy || !text} onClick={() => void save(true)} className={`${btn} bg-[#17663F] text-white`}><Check className="h-4 w-4" aria-hidden /> המלל תקין</button>}
              <button type="button" disabled={busy} onClick={() => setEditing(true)} className={`${btn} border border-line bg-white text-navy`}><Pencil className="h-4 w-4" aria-hidden /> עריכה</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
