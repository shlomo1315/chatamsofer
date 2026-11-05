'use client'
import { useRef, useState } from 'react'
import { SOURCE_API, type MessageSource } from '@/lib/telephony/catalog'

export type Meta = { key: string; label: string; defaultText: string; allowAudio?: boolean; placeholders?: string[]; hint?: string }
export type Msgs = Record<string, { text: string; audio?: string | null }>
export type SourceData = { messages: Msgs; meta: Meta[] }

// רשימת נוסחים של מקור אחד: עריכת טקסט, בחירה בין קול ממוחשב להקלטה ושמירה דרך אותם נתיבים של שאר המסכים.
export default function MessageList({ source, data, onSaved, only }: {
  source: MessageSource; data: SourceData; onSaved: (m: Msgs) => void; only?: string
}) {
  const api = SOURCE_API[source]
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const fileKey = useRef('')
  const metas = data.meta.filter((m) => !only || m.label.includes(only) || m.key.includes(only))
  const dirty = Object.keys(draft).length > 0

  async function save() {
    setBusy('save'); setNote(null)
    const messages: Msgs = { ...data.messages }
    for (const [k, t] of Object.entries(draft)) messages[k] = { ...messages[k], text: t }
    const r = await fetch(`${api}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }) })
    const j = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) return setNote({ ok: false, text: j.error ?? 'שגיאה בשמירה' })
    setDraft({}); onSaved(j.messages ?? messages); setNote({ ok: true, text: 'נשמר. נכנס לשיחה הבאה.' })
  }
  async function switchToVoice(key: string) {
    setBusy(key); setNote(null)
    const r = await fetch(`${api}/recording?key=${encodeURIComponent(key)}`, { method: 'DELETE' })
    const j = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) return setNote({ ok: false, text: j.error ?? 'שגיאה' })
    if (j.messages) onSaved(j.messages)
  }
  async function upload(file: File) {
    const key = fileKey.current
    setBusy(key); setNote(null)
    const f = new FormData(); f.set('key', key); f.set('file', file)
    const r = await fetch(`${api}/recording`, { method: 'POST', body: f })
    const j = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) return setNote({ ok: false, text: j.error ?? 'שגיאה בהעלאה' })
    if (j.messages) onSaved(j.messages)
    setNote({ ok: true, text: 'ההקלטה הועלתה' })
  }

  return (
    <div>
      <input ref={fileRef} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
      {metas.map((m) => {
        const cur = data.messages[m.key]
        const text = draft[m.key] ?? cur?.text ?? m.defaultText
        const hasRec = !!cur?.audio
        const missing = (m.placeholders ?? []).filter((p) => !text.includes(`{${p}}`))
        return (
          <div className="msg" key={m.key}>
            <div className="msg-h"><b>{m.label}</b><span className="slug">{m.key}</span></div>
            <textarea value={text} onChange={(e) => setDraft({ ...draft, [m.key]: e.target.value })} aria-label={m.label} />
            <div className="msg-f">
              {m.allowAudio ? (
                <div className="seg">
                  <button aria-pressed={!hasRec} disabled={busy === m.key} onClick={() => hasRec && switchToVoice(m.key)}>קול ממוחשב</button>
                  <button aria-pressed={hasRec} disabled={busy === m.key} onClick={() => { fileKey.current = m.key; fileRef.current?.click() }}>
                    {hasRec ? 'הקלטה (החלף)' : 'הקלטה'}
                  </button>
                </div>
              ) : <span className="chip mute">הודעה דינמית, קול ממוחשב בלבד</span>}
              {(m.placeholders?.length ?? 0) > 0 && <>
                <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>חובה להשאיר:</span>
                {m.placeholders!.map((p) => <span key={p} className="ph">{`{${p}}`}</span>)}
              </>}
              {missing.length > 0 && <span className="chip bad">חסר {missing.map((p) => `{${p}}`).join(' ')}</span>}
            </div>
            {m.hint && <p className="hint">{m.hint}</p>}
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
        <button className="btn pri" disabled={!dirty || busy === 'save'} onClick={save}>{busy === 'save' ? 'שומר…' : 'שמור שינויים'}</button>
        {dirty && <button className="btn ghost" onClick={() => setDraft({})}>ביטול</button>}
        {note && <span className={`chip ${note.ok ? 'ok' : 'bad'}`}>{note.text}</span>}
      </div>
      <p className="hint">הקלטות וקול נוירוני נשמרים דרך ימות המשיח הקיימת, ולכן עשויים שלא לפעול אחרי שהיא בוטלה [להשלים].</p>
    </div>
  )
}
