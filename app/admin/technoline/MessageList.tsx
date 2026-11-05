'use client'
import { useState } from 'react'
import VoiceButton from './VoiceButton'
import { SOURCE_API, type MessageSource } from '@/lib/telephony/catalog'

export type Meta = { key: string; label: string; defaultText: string; allowAudio?: boolean; placeholders?: string[]; hint?: string }
export type Msgs = Record<string, { text: string; audio?: string | null }>
export type SourceData = { messages: Msgs; meta: Meta[] }

// רשימת נוסחים של מקור אחד: עריכת טקסט ושמירה. הנוסח מוקרא בקול ממוחשב של טכנוליין.
export default function MessageList({ source, data, onSaved, only }: {
  source: MessageSource; data: SourceData; onSaved: (m: Msgs) => void; only?: string
}) {
  const api = SOURCE_API[source]
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
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

  return (
    <div>
      {metas.map((m) => {
        const cur = data.messages[m.key]
        const text = draft[m.key] ?? cur?.text ?? m.defaultText
        const missing = (m.placeholders ?? []).filter((p) => !text.includes(`{${p}}`))
        return (
          <div className="msg" key={m.key}>
            <div className="msg-h"><b>{m.label}</b><span className="slug">{m.key}</span></div>
            <textarea value={text} onChange={(e) => setDraft({ ...draft, [m.key]: e.target.value })} aria-label={m.label} />
            <div className="msg-f">
              {!m.allowAudio && <span className="chip mute">הודעה דינמית</span>}
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
      {source !== 'bookfair' && <VoiceButton />}
      <p className="hint">הקלטה מחליפה שלוחה שלמה, ומועלית בלשונית «חיבור ובנייה». הקלטה נפרדת לכל נוסח עדיין לא נתמכת בטכנוליין [להשלים].</p>
    </div>
  )
}
