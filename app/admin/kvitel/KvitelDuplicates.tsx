'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, Copy, Merge } from 'lucide-react'
import { KVITEL_CHANNELS, type KvitelChannel } from '@/lib/kvitel'
import { mergedRequest, personText, requestText, type DupGroup } from '@/lib/kvitelDuplicates'

// ─────────────────────────────────────────────────────────────────────────────
// שמות כפולים בקוויטלאך שעוד לא נשלחו: תגית "כפול" ליד השם ברשימה + לוח שמציג את
// כל הצורות של אותו אדם יחד. המיזוג ידני בלבד: בוחרים מה נשאר ומה ממוזג, ומאשרים.
// הזיהוי ב-lib/kvitelDuplicates.ts, המיזוג ב-POST /api/admin/kvitel/merge.
// ─────────────────────────────────────────────────────────────────────────────

type Ctx = { index: Map<string, DupGroup>; open: (key: string) => void }
export const DupContext = createContext<Ctx | null>(null)

/** תגית ליד שם שמופיע יותר מפעם אחת. לחיצה פותחת את הקבוצה בלוח. */
export function DupBadge({ lineId }: { lineId: string }) {
  const ctx = useContext(DupContext)
  const g = ctx?.index.get(lineId)
  if (!ctx || !g) return null
  return (
    <button type="button" data-dup-badge onClick={e => { e.stopPropagation(); ctx.open(g.key) }}
      title="השם הזה מופיע בעוד בקשות. לחצו לראות את כל הצורות"
      className="ms-1.5 inline-flex items-center gap-1 rounded-full bg-[#FBEBD5] px-2 py-0.5 align-middle text-[11px] font-semibold text-[#8A4B08] hover:bg-[#F6DDB8]">
      <Copy className="h-3 w-3" aria-hidden /> כפול ×{g.lines.length}
    </button>
  )
}

const dateFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function KvitelDuplicates({ groups, canEdit, openKey, onOpenKey, onDone }: {
  groups: DupGroup[]; canEdit: boolean; openKey: string | null; onOpenKey: (key: string | null) => void; onDone: (message: string) => void
}) {
  const [shown, setShown] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!openKey) return
    setShown(true)
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [openKey])
  if (!groups.length) return null
  const names = groups.reduce((n, g) => n + g.lines.length, 0)

  return (
    <section ref={ref} data-kvitel-dups className="rounded-[14px] border border-[#EBC78F] bg-[#FFFAF2]">
      <button type="button" onClick={() => setShown(s => !s)} aria-expanded={shown}
        className="flex w-full items-center gap-3 px-4 py-3 text-start">
        <Copy className="h-5 w-5 shrink-0 text-[#8A4B08]" aria-hidden />
        <span className="flex-1">
          <b className="text-navy">שמות כפולים: {groups.length} אנשים מופיעים יותר מפעם אחת</b>
          <span className="block text-sm text-ink-soft">{names} שמות בבקשות שעוד לא נשלחו. כלום לא מתמזג לבד: פותחים, בודקים ובוחרים.</span>
        </span>
        {shown ? <ChevronDown className="h-5 w-5 text-ink-soft" aria-hidden /> : <ChevronLeft className="h-5 w-5 text-ink-soft" aria-hidden />}
      </button>
      {shown && (
        <ul className="space-y-2 border-t border-[#EBC78F] p-3">
          {groups.map(g => (
            <DupGroupItem key={g.key} g={g} canEdit={canEdit} open={openKey === g.key}
              onToggle={() => onOpenKey(openKey === g.key ? null : g.key)} onDone={onDone} />
          ))}
        </ul>
      )}
    </section>
  )
}

function DupGroupItem({ g, canEdit, open, onToggle, onDone }: {
  g: DupGroup; canEdit: boolean; open: boolean; onToggle: () => void; onDone: (message: string) => void
}) {
  const [keepId, setKeepId] = useState(g.lines[0].line.id)
  const [merge, setMerge] = useState<Set<string>>(() => new Set(g.lines.slice(1).map(d => d.line.id)))
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => { if (open) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [open])

  const keep = g.lines.find(d => d.line.id === keepId) ?? g.lines[0]
  const others = g.lines.filter(d => d.line.id !== keep.line.id && merge.has(d.line.id))
  const otherIds = new Set(others.map(d => d.line.id))
  const req = mergedRequest(keep.line, others.map(d => d.line))
  // בקשות שלא יישאר בהן אף שם — יבוטלו
  const emptied = new Set(others.map(d => d.request).filter(r => r.kvitel_request_lines.every(l => otherIds.has(l.id))).map(r => r.id))

  const pickKeep = (id: string) => { setKeepId(id); setMerge(m => { const n = new Set(m); n.delete(id); if (keepId !== id) n.add(keepId); return n }); setConfirming(false) }
  const toggle = (id: string) => { setMerge(m => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n }); setConfirming(false) }

  async function run() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/admin/kvitel/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepId: keep.line.id, mergeIds: others.map(d => d.line.id) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'המיזוג נכשל'); return }
      onDone(`מוזגו ${others.length} צורות אל ${personText(keep.line)}${data.cancelled ? ` · ${data.cancelled} בקשות שנשארו בלי שמות בוטלו` : ''}`)
    } catch {
      setError('אין חיבור. נסו שוב')
    } finally { setBusy(false) }
  }

  return (
    <li ref={ref} data-dup-group={g.key} className={`rounded-[10px] border bg-white ${open ? 'border-[#C98A2E]' : 'border-line'}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-start">
        <b className="text-ink">{personText(g.lines[0].line)}</b>
        <span className="text-sm text-ink-soft">{g.lines.length} פעמים</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${g.exact ? 'bg-[#E3F0E9] text-[#2F6B4F]' : 'bg-[#FBEBD5] text-[#8A4B08]'}`}>
          {g.exact ? 'אותו שם בתארים שונים' : 'כתיב שונה, כדאי לבדוק'}
        </span>
        <span className="ms-auto">{open ? <ChevronDown className="h-4 w-4 text-ink-soft" aria-hidden /> : <ChevronLeft className="h-4 w-4 text-ink-soft" aria-hidden />}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-line px-3.5 pb-3.5 pt-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-start text-xs text-ink-faint">
                <tr>
                  {canEdit && <th className="px-2 py-1 text-start font-normal">נשאר</th>}
                  {canEdit && <th className="px-2 py-1 text-start font-normal">למזג</th>}
                  <th className="px-2 py-1 text-start font-normal">איך נכתב</th>
                  <th className="px-2 py-1 text-start font-normal">בקשה</th>
                  <th className="px-2 py-1 text-start font-normal">מגיש</th>
                  <th className="px-2 py-1 text-start font-normal">הוגש</th>
                </tr>
              </thead>
              <tbody>
                {g.lines.map(d => {
                  const isKeep = d.line.id === keep.line.id
                  return (
                    <tr key={d.line.id} className={`border-t border-line ${isKeep ? 'bg-[#F1F8F3]' : ''}`}>
                      {canEdit && <td className="px-2 py-1.5"><input type="radio" name={`keep-${g.key}`} checked={isKeep} onChange={() => pickKeep(d.line.id)}
                        className="h-4 w-4 accent-navy" aria-label={`להשאיר את ${personText(d.line)}`} /></td>}
                      {canEdit && <td className="px-2 py-1.5"><input type="checkbox" disabled={isKeep} checked={!isKeep && merge.has(d.line.id)} onChange={() => toggle(d.line.id)}
                        className="h-4 w-4 accent-navy disabled:opacity-30" aria-label={`למזג את ${personText(d.line)}`} /></td>}
                      <td className="px-2 py-1.5 font-semibold text-ink">{personText(d.line)}</td>
                      <td className="px-2 py-1.5 text-ink-soft">{requestText(d.line) || '—'}</td>
                      <td className="px-2 py-1.5 text-ink-soft">
                        {d.request.contact_name || 'לא ידוע'}
                        <span className="text-xs text-ink-faint"> · {KVITEL_CHANNELS[d.request.channel as KvitelChannel] ?? d.request.channel}
                          {(d.request.needsReview || d.request.status === 'review') ? ' · לבדיקה' : ''}</span>
                      </td>
                      <td className="px-2 py-1.5 tabular-nums text-ink-faint">{dateFmt.format(new Date(d.request.submitted_at))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {canEdit && !confirming && (
            <button type="button" disabled={!others.length} onClick={() => setConfirming(true)}
              className="flex h-10 items-center gap-2 rounded-[10px] bg-navy px-4 text-sm font-semibold text-white disabled:opacity-40">
              <Merge className="h-4 w-4" aria-hidden /> מיזוג {others.length} שמות אל &quot;{personText(keep.line)}&quot;
            </button>
          )}
          {canEdit && confirming && (
            <div role="alertdialog" aria-label="אישור מיזוג" className="space-y-2 rounded-[10px] bg-sand p-3 text-sm text-navy">
              <p><b>לפני המיזוג:</b></p>
              <ul className="list-disc space-y-0.5 ps-5">
                <li>נשאר: {personText(keep.line)} ({keep.request.contact_name || 'מגיש לא ידוע'})</li>
                <li>יימחקו מהרשימה {others.length} שמות: {others.map(d => personText(d.line)).join(' · ')}</li>
                <li>{'error' in req ? <span className="text-[#A3302A]">{req.error}</span> : <>הבקשה שתישאר: {requestText(req) || 'בלי בקשה'}</>}</li>
                {emptied.size > 0 && <li>{emptied.size} בקשות יבוטלו כי לא יישאר בהן אף שם</li>}
                <li>הפרטים של כל מה שנמחק נשמרים ביומן הפעולות</li>
              </ul>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="button" disabled={busy || 'error' in req} onClick={() => void run()} data-dup-confirm
                  className="h-9 rounded-[10px] bg-[#1F8A54] px-4 text-[13px] font-semibold text-white hover:bg-[#17663F] disabled:opacity-40">
                  {busy ? 'ממזג…' : 'אישור המיזוג'}
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="h-9 rounded-[10px] border border-line bg-white px-4 text-[13px] font-semibold text-ink">
                  חזרה
                </button>
              </div>
            </div>
          )}
          {error && <p role="alert" className="text-sm text-[#A3302A]">{error}</p>}
        </div>
      )}
    </li>
  )
}
