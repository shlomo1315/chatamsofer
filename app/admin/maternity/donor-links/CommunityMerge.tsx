'use client'
import { useCallback, useEffect, useState } from 'react'
import { Loader2, Merge, Undo2, X } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// איחוד קהילות בדוח הנדיב: הצעות למיזוג קרוב, מיזוג ידני וביטול מיזוג.
interface Item { name: string; count: number }
interface Group { names: Item[]; total: number }
interface Merged { name: string; parts: Item[]; total: number }

export default function CommunityMerge({ canEdit }: { canEdit: boolean }) {
  const toast = useToast()
  const [communities, setCommunities] = useState<Item[]>([])
  const [suggestions, setSuggestions] = useState<Group[]>([])
  const [merged, setMerged] = useState<Merged[]>([])
  const [loading, setLoading] = useState(true)
  const [picked, setPicked] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<{ names: string[]; target: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/maternity/donor-communities', { cache: 'no-store' })
    if (res.ok) {
      const j = await res.json()
      setCommunities(j.communities); setSuggestions(j.suggestions); setMerged(j.merged)
    } else toast.error('טעינת הקהילות נכשלה')
    setLoading(false)
  }, [toast])
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => { if (alive) void load() }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [load])

  async function confirmMerge() {
    if (!dialog) return
    setBusy(true)
    const res = await fetch('/api/admin/maternity/donor-communities', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ names: dialog.names, target: dialog.target }),
    })
    setBusy(false)
    if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error || 'המיזוג נכשל'); return }
    toast.success('הקהילות מוזגו')
    setDialog(null); setPicked([])
    await load()
  }

  async function undo(target: string) {
    if (!confirm(`לבטל את המיזוג של "${target}"? השמות המקוריים יחזרו להופיע בנפרד.`)) return
    const res = await fetch('/api/admin/maternity/donor-communities', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target }),
    })
    if (!res.ok) { toast.error('הביטול נכשל'); return }
    await load()
  }

  const shown = communities.filter(c => !search.trim() || c.name.includes(search.trim()))
  const btn = 'inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:text-navy-dark disabled:opacity-50'

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-bold text-navy-dark">איחוד קהילות</h2>
        <p className="text-sm text-slate-500">שמות זהים מתאחדים אוטומטית. כאן אפשר למזג שמות דומים או כל קהילות שנבחרו. המיזוג משפיע על הסינון בדוח בלבד, נתוני היולדות לא משתנים, וניתן לבטלו.</p>
      </div>
      {loading ? <div className="py-4 text-center text-sm text-slate-500"><Loader2 size={16} className="inline animate-spin" /> טוען…</div> : (
        <>
          <div>
            <h3 className="mb-2 text-sm font-bold text-slate-700">הצעות למיזוג קרוב ({suggestions.length})</h3>
            {suggestions.length === 0 && <p className="text-sm text-slate-500">אין הצעות כרגע.</p>}
            <ul className="flex flex-col gap-2">
              {suggestions.map(g => (
                <li key={g.names.map(n => n.name).join('|')} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <span className="text-sm text-slate-700">{g.names.map(n => `${n.name} (${n.count})`).join(' · ')}</span>
                  {canEdit && <button className={btn} onClick={() => setDialog({ names: g.names.map(n => n.name), target: g.names[0].name })}><Merge size={13} /> מזג</button>}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold text-slate-700">מיזוג כללי</h3>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש קהילה"
                className="h-9 w-56 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
              {canEdit && <button className={btn} disabled={picked.length < 2} onClick={() => setDialog({ names: picked, target: picked[0] })}>
                <Merge size={13} /> מזג {picked.length > 1 ? `${picked.length} נבחרות` : 'נבחרות'}
              </button>}
            </div>
            <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
              {shown.map(c => {
                const on = picked.includes(c.name)
                return (
                  <label key={c.name} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${on ? 'border-navy bg-navy/5 font-bold text-navy-dark' : 'border-slate-200 text-slate-600'}`}>
                    <input type="checkbox" checked={on} disabled={!canEdit}
                      onChange={() => setPicked(p => on ? p.filter(x => x !== c.name) : [...p, c.name])} />
                    {c.name} ({c.count})
                  </label>
                )
              })}
            </div>
          </div>

          {merged.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-700">מיזוגים קיימים</h3>
              <ul className="flex flex-col gap-2">
                {merged.map(m => (
                  <li key={m.name} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 px-3 py-2">
                    <span className="text-sm text-slate-700"><b>{m.name}</b> ← {m.parts.map(p => `${p.name} (${p.count})`).join(' · ')}</span>
                    {canEdit && <button className={btn} onClick={() => undo(m.name)}><Undo2 size={13} /> ביטול מיזוג</button>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={() => !busy && setDialog(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-navy-dark">מיזוג קהילות</h3>
              <button onClick={() => setDialog(null)} aria-label="סגירה" className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <p className="mb-2 text-sm text-slate-600">איזה שם יישאר?</p>
            <div className="mb-3 flex flex-col gap-1.5">
              {dialog.names.map(n => (
                <label key={n} className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={dialog.target === n} onChange={() => setDialog({ ...dialog, target: n })} /> {n}
                </label>
              ))}
            </div>
            <label className="text-xs font-bold text-slate-600">או שם חדש
              <input value={dialog.target} maxLength={80} onChange={e => setDialog({ ...dialog, target: e.target.value })}
                className="mt-1 block h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal" />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button className={btn} onClick={() => setDialog(null)} disabled={busy}>ביטול</button>
              <button onClick={confirmMerge} disabled={busy || !dialog.target.trim()}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-navy px-4 text-sm font-bold text-white disabled:opacity-50">
                {busy && <Loader2 size={14} className="animate-spin" />} מזג
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
