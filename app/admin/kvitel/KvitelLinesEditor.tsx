'use client'
import { useState } from 'react'
import { Plus, Save, Trash2 } from 'lucide-react'
import { KVITEL_REQUEST_OPTIONS, formatLine } from '@/lib/kvitel'
import type { KvitelLineRow } from '@/lib/kvitelQuery'
import { modalBtn } from '@/components/admin/system/RecordModal'

// רשימת השמות בכרטסת. במצב עריכה (ובהרשאת עריכה) השמות, סוג הבקשה ופרטי המגיש ניתנים לתיקון;
// שדה חסר מסומן בזהב. השמירה עוברת ל-PUT /api/admin/kvitel/lines, שמאמת הכול בשרת.

type Draft = { name: string; relation: 'ben' | 'bat'; parentName: string; requestType: string; requestNote: string }
const toDraft = (l: KvitelLineRow): Draft => ({
  name: l.name, relation: l.relation === 'bat' ? 'bat' : 'ben', parentName: l.parent_name,
  requestType: l.request_type, requestNote: l.request_note ?? '',
})
const blank = (): Draft => ({ name: '', relation: 'ben', parentName: '', requestType: KVITEL_REQUEST_OPTIONS[0].key, requestNote: '' })

const input = 'w-full rounded-lg border bg-white px-2.5 py-1.5 text-sm text-ink'
const ok = 'border-line-strong'
const miss = 'border-[#C0912F] bg-[#FBEFD2]'

export default function KvitelLinesEditor({ requestId, lines, contact, editable, onSaved, onCancel }: {
  requestId: string; lines: KvitelLineRow[]; contact: { name: string | null; phone: string | null; email: string | null }
  editable: boolean; onSaved: (msg: string) => void; onCancel: () => void
}) {
  const [drafts, setDrafts] = useState<Draft[]>(() => lines.map(toDraft))
  const [who, setWho] = useState({ name: contact.name ?? '', phone: contact.phone ?? '', email: contact.email ?? '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (i: number, p: Partial<Draft>) => setDrafts(d => d.map((x, j) => (j === i ? { ...x, ...p } : x)))

  if (!editable) {
    return lines.length === 0 ? (
      <p className="rounded-lg bg-[#FBEFD2] px-3 py-2 text-sm text-[#8A5A00]">לא נקלטו שמות. אפשר לראות את מה שנכתב בטופס בלשונית «מה שנכתב בטופס», ולבטל את הבקשה.</p>
    ) : (
      <ol className="space-y-1.5">
        {lines.map(l => (
          <li key={l.id} className="break-words border-s-2 border-navy/20 ps-3 text-base text-ink">
            {formatLine({ name: l.name, relation: l.relation, parentName: l.parent_name, requestType: l.request_type, requestNote: l.request_note })}
          </li>
        ))}
      </ol>
    )
  }

  async function save() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/admin/kvitel/lines', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: requestId, lines: drafts.map(d => ({ name: d.name, relation: d.relation, parentName: d.parentName, requestType: d.requestType, requestNote: d.requestNote })), contact: who }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'השמירה נכשלה'); return }
      onSaved(`התיקון נשמר (${data.lines} שמות)`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-3">
        <input aria-label="שם המגיש" placeholder="שם המגיש" value={who.name} onChange={e => setWho(w => ({ ...w, name: e.target.value }))} className={`${input} ${ok}`} />
        <input aria-label="טלפון" placeholder="טלפון" dir="ltr" value={who.phone} onChange={e => setWho(w => ({ ...w, phone: e.target.value }))} className={`${input} ${ok}`} />
        <input aria-label="מייל" placeholder="מייל" dir="ltr" value={who.email} onChange={e => setWho(w => ({ ...w, email: e.target.value }))} className={`${input} ${ok}`} />
      </div>
      {drafts.length === 0 && <p className="rounded-lg bg-[#FBEFD2] px-3 py-2 text-sm text-[#8A5A00]">לא נקלטו שמות. אפשר להקליד אותם כאן לפי מה שנכתב בטופס.</p>}
      {drafts.map((d, i) => {
        const noName = !d.name.trim(), noMom = !d.parentName.trim()
        return (
          <div key={i} className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_5.5rem_1fr_8rem_auto] ${noName || noMom ? 'border-[#C0912F]' : 'border-line'}`}>
            <input aria-label="שם" placeholder="שם" value={d.name} onChange={e => set(i, { name: e.target.value })} className={`${input} ${noName ? miss : ok}`} />
            <select aria-label="בן או בת" value={d.relation} onChange={e => set(i, { relation: e.target.value as 'ben' | 'bat' })} className={`${input} ${ok}`}>
              <option value="ben">בן</option><option value="bat">בת</option>
            </select>
            <input aria-label="שם האם" placeholder="שם האם" value={d.parentName} onChange={e => set(i, { parentName: e.target.value })} className={`${input} ${noMom ? miss : ok}`} />
            <select aria-label="סוג הבקשה" value={d.requestType} onChange={e => set(i, { requestType: e.target.value })} className={`${input} ${ok}`}>
              {KVITEL_REQUEST_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <button type="button" aria-label="הסרת השם" onClick={() => setDrafts(x => x.filter((_, j) => j !== i))} className="justify-self-end rounded-lg p-2 text-ink-faint hover:bg-sand hover:text-ink"><Trash2 className="h-4 w-4" aria-hidden /></button>
            {d.requestType === 'other' && <input aria-label="הבקשה" placeholder="מה הבקשה" value={d.requestNote} onChange={e => set(i, { requestNote: e.target.value })} className={`${input} ${d.requestNote.trim() ? ok : miss} sm:col-span-5`} />}
            {(noName || noMom) && (
              <p className="text-xs font-semibold text-[#8A5A00] sm:col-span-5">{noName ? 'חסר שם' : 'חסר שם האם'}</p>
            )}
          </div>
        )
      })}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || drafts.length >= 40} onClick={() => setDrafts(d => [...d, blank()])} className={modalBtn.ghost}><Plus size={14} /> הוספת שם</button>
        <button type="button" disabled={busy || !drafts.length} onClick={() => void save()} className={modalBtn.primary}><Save size={14} /> שמירה</button>
        <button type="button" disabled={busy} onClick={onCancel} className={modalBtn.ghost}>ביטול השינויים</button>
      </div>
    </div>
  )
}

