'use client'
import { useRef, useState, type ReactNode } from 'react'
import { KVITEL_REQUEST_OPTIONS } from '@/lib/kvitel'

// תא בטבלת הקוויטלאך שנפתח לעריכה בלחיצה, במקום (בלי חלונית).
// Enter או יציאה מהשדה — שמירה; Escape — ביטול. בזמן השמירה השדה נעול, ושגיאה נשארת בשדה פתוח.
// onSave מחזיר הודעת שגיאה, או null כשהשמירה הצליחה.

const inputCls = 'w-full rounded-md border border-[#C0912F] bg-white px-2 py-1 text-sm text-ink outline-none ring-2 ring-[#C0912F]/25 disabled:opacity-60'
const viewCls = 'block w-full rounded-md px-1.5 py-0.5 -mx-1.5 text-start hover:bg-[#F7F0E3] focus-visible:bg-[#F7F0E3] focus-visible:outline-none cursor-text'

function Status({ saving, error }: { saving: boolean; error: string }) {
  if (saving) return <p className="mt-1 text-xs text-ink-faint" aria-live="polite">שומר…</p>
  if (error) return <p role="alert" className="mt-1 text-xs font-semibold text-rose-700">{error}</p>
  return null
}

export function InlineText({ value, onSave, label, placeholder, dir, children, editable = true }: {
  value: string
  onSave: (v: string) => Promise<string | null>
  label: string
  placeholder?: string
  dir?: 'ltr'
  editable?: boolean
  children: ReactNode   // התצוגה כשלא בעריכה
}) {
  const [draft, setDraft] = useState<string | null>(null)   // null = לא בעריכה
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)   // Enter ואחריו blur — שמירה אחת בלבד

  if (!editable) return <>{children}</>

  async function commit() {
    if (draft === null || busy.current) return
    if (draft.trim() === value.trim()) { setDraft(null); setError(''); return }
    busy.current = true; setSaving(true); setError('')
    const err = await onSave(draft)
    busy.current = false; setSaving(false)
    if (err) setError(err)
    else setDraft(null)
  }
  const cancel = () => { if (!busy.current) { setDraft(null); setError('') } }

  if (draft === null) {
    return (
      <button type="button" data-inline-view className={viewCls} aria-label={`עריכת ${label}`}
        onClick={e => { e.stopPropagation(); setDraft(value) }}>
        {children}
      </button>
    )
  }
  return (
    <div data-editing onClick={e => e.stopPropagation()}>
      <input autoFocus aria-label={label} placeholder={placeholder} dir={dir} value={draft} disabled={saving}
        aria-invalid={!!error || undefined} className={inputCls}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); void commit() }
          else if (e.key === 'Escape') { e.preventDefault(); cancel() }
        }}
        onBlur={() => void commit()} />
      <Status saving={saving} error={error} />
    </div>
  )
}

// סוג הבקשה (לכל השמות בבקשה). "אחר" פותח שדה לנוסח הבקשה, שנשמר ב-Enter או ביציאה.
export function InlineRequest({ type, note, onSave, editable = true, children }: {
  type: string; note: string
  onSave: (type: string, note: string) => Promise<string | null>
  editable?: boolean
  children: ReactNode
}) {
  const [draft, setDraft] = useState<{ type: string; note: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)

  if (!editable) return <>{children}</>

  async function commit(d: { type: string; note: string }) {
    if (busy.current) return
    if (d.type === type && (d.type !== 'other' || d.note.trim() === note.trim())) { setDraft(null); setError(''); return }
    busy.current = true; setSaving(true); setError('')
    const err = await onSave(d.type, d.note)
    busy.current = false; setSaving(false)
    if (err) setError(err)
    else setDraft(null)
  }
  const cancel = () => { if (!busy.current) { setDraft(null); setError('') } }
  function onKey(e: React.KeyboardEvent) {
    if (!draft) return
    if (e.key === 'Enter') { e.preventDefault(); void commit(draft) }
    else if (e.key === 'Escape') { e.preventDefault(); cancel() }
  }

  if (!draft) {
    return (
      <button type="button" data-inline-view className={viewCls} aria-label="עריכת הבקשה"
        onClick={e => { e.stopPropagation(); setDraft({ type, note }) }}>
        {children}
      </button>
    )
  }
  return (
    <div data-editing className="space-y-1" onClick={e => e.stopPropagation()}>
      <select autoFocus aria-label="סוג הבקשה" value={draft.type} disabled={saving} className={inputCls}
        onChange={e => {
          const d = { type: e.target.value, note: draft.note }
          setDraft(d)
          if (d.type !== 'other') void commit(d)
        }}
        onKeyDown={onKey}
        onBlur={e => { if (draft.type !== 'other' && !e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) cancel() }}>
        <option value="">בלי בקשה</option>
        {KVITEL_REQUEST_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
      </select>
      {draft.type === 'other' && (
        <input aria-label="מה הבקשה" placeholder="מה הבקשה" value={draft.note} disabled={saving} className={inputCls}
          onChange={e => setDraft({ ...draft, note: e.target.value })} onKeyDown={onKey} onBlur={() => void commit(draft)} />
      )}
      <Status saving={saving} error={error} />
    </div>
  )
}
