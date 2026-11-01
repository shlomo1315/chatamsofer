'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, GripVertical, Loader2, Plus, Globe, EyeOff } from 'lucide-react'
import type { GilyonotList } from '@/lib/gilyonotLists'
import { btnGhost, btnPrimary, Card, input, Notice } from './ui'

const num = (n: number) => n.toLocaleString('he-IL')
async function api(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'הפעולה נכשלה')
  return data
}
const json = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export interface ListCount { total: number; duplicates: number; suppressed: number; perList: { id: string; name: string; count: number }[] }

/** בחירת רשימות בשלב השליחה, עם ספירת נמענים ייחודיים חיה. */
export function ListPicker({ lists, selected, onChange, onCount }: {
  lists: GilyonotList[]; selected: string[]; onChange: (ids: string[]) => void; onCount: (c: ListCount | null) => void
}) {
  const [count, setCount] = useState<ListCount | null>(null)
  const [loading, setLoading] = useState(false)
  const key = selected.join(',')
  useEffect(() => {
    let stale = false
    const t = setTimeout(() => {
      if (!selected.length) { setCount(null); onCount(null); return }
      setLoading(true)
      api('/api/admin/gilyonot/lists/count', json('POST', { listIds: selected }))
        .then(d => { if (!stale) { const c = d as unknown as ListCount; setCount(c); onCount(c) } })
        .catch(() => { if (!stale) { setCount(null); onCount(null) } })
        .finally(() => { if (!stale) setLoading(false) })
    }, 250)
    return () => { stale = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
  const per = new Map((count?.perList ?? []).map(p => [p.id, p.count]))
  return (
    <fieldset className="mt-3">
      <legend className="text-xs font-semibold text-slate-700">למי לשלוח</legend>
      <div className="mt-2 grid gap-1.5">
        {lists.filter(l => l.active).map(l => (
          <label key={l.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl bg-white px-3 ring-1 ring-inset ring-slate-900/10 has-[:checked]:bg-[#eaf1ff] has-[:checked]:ring-[#2563eb]/40">
            <input type="checkbox" className="h-4 w-4 accent-[#2563eb]" checked={selected.includes(l.id)} onChange={() => toggle(l.id)} />
            <span className="flex-1 text-sm text-slate-900">{l.name}</span>
            {per.has(l.id) && <span className="text-xs tabular-nums text-slate-500">{num(per.get(l.id)!)}</span>}
          </label>
        ))}
      </div>
      <p className="mt-2 min-h-5 text-xs text-slate-600" aria-live="polite">
        {loading ? 'סופר נמענים…' : count
          ? <>סה״כ <b className="text-slate-900">{num(count.total)}</b> נמענים ייחודיים{count.duplicates ? ` · ${num(count.duplicates)} כתובות כפולות יקבלו מייל אחד` : ''}{count.suppressed ? ` · ${num(count.suppressed)} הוסרו (ביטלו הרשמה)` : ''}</>
          : 'בחרו לפחות רשימה אחת'}
      </p>
    </fieldset>
  )
}

/** לשונית ניהול רשימות: מסומנת מראש, פעילה, סדר, ורשימה חדשה. */
export function ListsManager({ lists: initial, canEdit }: { lists: GilyonotList[]; canEdit: boolean }) {
  const [lists, setLists] = useState(initial)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function run(fn: () => Promise<void>) {
    setBusy(true); setMsg(null)
    try { await fn() } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'הפעולה נכשלה' }) } finally { setBusy(false) }
  }
  const patch = (id: string, change: Partial<Pick<GilyonotList, 'preselected' | 'active'>>) => run(async () => {
    await api(`/api/admin/gilyonot/lists/${id}`, json('PATCH', change))
    setLists(ls => ls.map(l => (l.id === id ? { ...l, ...change } : l)))
  })
  const reorder = (next: GilyonotList[]) => run(async () => {
    const prev = lists
    setLists(next)
    try { await api('/api/admin/gilyonot/lists', json('PUT', { order: next.map(l => l.id) })) } catch (e) { setLists(prev); throw e }
  })
  const move = (i: number, d: -1 | 1) => {
    const next = [...lists]; const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    reorder(next)
  }
  const drop = (overId: string) => {
    if (!drag || drag === overId) return
    const from = lists.findIndex(l => l.id === drag), to = lists.findIndex(l => l.id === overId)
    const next = [...lists]; const [it] = next.splice(from, 1); next.splice(to, 0, it)
    setDrag(null); reorder(next)
  }
  const add = () => run(async () => {
    const d = await api('/api/admin/gilyonot/lists', json('POST', { name }))
    setLists(ls => [...ls, d.list as GilyonotList]); setName('')
    setMsg({ ok: true, text: 'הרשימה נוצרה. מעלים אליה כתובות בלשונית נדרים פלוס / ניוזלטר.' })
  })

  return (
    <Card>
      <div className="border-b border-slate-100 p-5">
        <h2 className="text-lg font-bold text-slate-900">רשימות תפוצה</h2>
        <p className="mt-1 text-sm text-slate-600">״מסומנת מראש״ נבחרת אוטומטית בכל שליחה. ״פעילה״ קובעת אם הרשימה מופיעה בשליחה. גררו (או השתמשו בחצים) לשינוי הסדר.</p>
      </div>
      <ul className="divide-y divide-slate-100">
        {lists.map((l, i) => (
          <li key={l.id} draggable={canEdit} onDragStart={() => setDrag(l.id)} onDragOver={e => e.preventDefault()} onDrop={() => drop(l.id)}
            className={`flex flex-wrap items-center gap-3 p-4 ${l.active ? '' : 'opacity-60'}`}>
            {canEdit && <GripVertical className="h-5 w-5 shrink-0 cursor-grab text-slate-400" aria-hidden />}
            <span className="min-w-0 flex-1 font-medium text-slate-900">{l.name}</span>
            <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" role="switch" className="h-4 w-4 accent-[#2563eb]" disabled={!canEdit || busy} checked={l.preselected} onChange={e => patch(l.id, { preselected: e.target.checked })} />מסומנת מראש
            </label>
            <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" role="switch" className="h-4 w-4 accent-[#2563eb]" disabled={!canEdit || busy} checked={l.active} onChange={e => patch(l.id, { active: e.target.checked })} />פעילה
            </label>
            {canEdit && (
              <span className="flex">
                <button type="button" aria-label="הזזה למעלה" disabled={busy || i === 0} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30" onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></button>
                <button type="button" aria-label="הזזה למטה" disabled={busy || i === lists.length - 1} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30" onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <form className="flex flex-wrap gap-2 border-t border-slate-100 p-4" onSubmit={e => { e.preventDefault(); if (name.trim()) add() }}>
          <input className={`${input} min-w-0 flex-1`} placeholder="שם רשימה חדשה" value={name} onChange={e => setName(e.target.value)} aria-label="שם רשימה חדשה" maxLength={80} />
          <button type="submit" disabled={busy || !name.trim()} className={btnPrimary}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}רשימה חדשה</button>
        </form>
      )}
      <div className="px-4 pb-4"><Notice msg={msg} /></div>
    </Card>
  )
}

/** פרסום וביטול פרסום בארכיון הציבורי. */
export function ArchivePanel({ issueId, published, topic: t0, date: d0, canEdit }: { issueId: string; published: boolean; topic: string | null; date: string | null; canEdit: boolean }) {
  const router = useRouter()
  const [topic, setTopic] = useState(t0 ?? '')
  const [date, setDate] = useState(d0 ?? '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  async function act(publish: boolean) {
    if (publish && !confirm('לפרסם את הגיליון בארכיון הציבורי? כל מי שיש לו את הקישור יוכל לצפות ולהוריד אותו.')) return
    setBusy(true); setMsg(null)
    try {
      await api(`/api/admin/gilyonot/issues/${issueId}/archive`, json('POST', { publish, topic, date: date || null }))
      setMsg({ ok: true, text: publish ? 'הגיליון פורסם בארכיון.' : 'הפרסום בוטל והקובץ הוסר מהארכיון.' }); router.refresh()
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'הפעולה נכשלה' }) } finally { setBusy(false) }
  }
  return (
    <div className="rounded-xl bg-slate-50/80 p-4 ring-1 ring-inset ring-slate-900/[0.04]">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">{published ? <Globe className="h-4 w-4 text-emerald-600" aria-hidden /> : <EyeOff className="h-4 w-4 text-slate-500" aria-hidden />}ארכיון ציבורי · {published ? 'מפורסם' : 'לא מפורסם'}</h3>
      {canEdit && (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <input className={input} placeholder="נושא (למשל: הכנסת אורחים)" value={topic} onChange={e => setTopic(e.target.value)} aria-label="נושא" maxLength={60} />
            <input className={input} type="date" value={date} onChange={e => setDate(e.target.value)} aria-label="תאריך הגיליון" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {!published && <button type="button" disabled={busy} className={btnPrimary} onClick={() => act(true)}>פרסום בארכיון</button>}
            {published && <button type="button" disabled={busy} className={btnGhost} onClick={() => act(false)}>ביטול פרסום</button>}
          </div>
        </>
      )}
      <div className="mt-2"><Notice msg={msg} /></div>
    </div>
  )
}
