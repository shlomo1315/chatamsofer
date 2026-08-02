'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { Loader2, Check, X, Pencil, GitBranch, CheckCircle2, AlertTriangle } from 'lucide-react'

interface Node {
  id: string
  name: string
  parent_id: string | null
  generation: number
  status: string
  relation?: string | null
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  verified: { label: 'מאושר', cls: 'bg-green-100 text-green-700 border-green-200' },
  pending: { label: 'ממתין', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  rejected: { label: 'נדחה', cls: 'bg-red-100 text-red-700 border-red-200' },
}
const NON_HEBREW = /[^֐-׿ ׳״'"-]/g

export default function LineageReviewClient({ token }: { token: string }) {
  const [nodes, setNodes] = useState<Node[]>([])
  const [rootId, setRootId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/lineage-review?token=${encodeURIComponent(token)}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה'); setLoading(false); return }
      setNodes(data.nodes ?? [])
      setRootId(data.rootNodeId ?? null)
    } catch { setError('שגיאת רשת') }
    finally { setLoading(false) }
  }, [token])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  // מיון היררכי — שורש, ואז ילדים בהזחה לפי דור
  const ordered = useMemo(() => {
    if (!rootId) return []
    const childrenOf = new Map<string, Node[]>()
    for (const n of nodes) {
      if (!n.parent_id) continue
      const l = childrenOf.get(n.parent_id); if (l) l.push(n); else childrenOf.set(n.parent_id, [n])
    }
    const out: { node: Node; depth: number }[] = []
    const walk = (id: string, depth: number) => {
      const n = nodes.find(x => x.id === id); if (!n) return
      out.push({ node: n, depth })
      for (const c of (childrenOf.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'he'))) walk(c.id, depth + 1)
    }
    walk(rootId, 0)
    return out
  }, [nodes, rootId])

  const act = async (nodeId: string, action: 'verify' | 'reject' | 'rename', name?: string) => {
    setBusy(nodeId); setError('')
    try {
      const res = await fetch('/api/public/lineage-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, nodeId, action, name }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) { setError(data.error || 'הפעולה נכשלה'); return }
      // עדכון אופטימי
      setNodes(ns => ns.map(n => n.id === nodeId
        ? { ...n, ...(action === 'verify' ? { status: 'verified' } : action === 'reject' ? { status: 'rejected' } : { name: name ?? n.name }) }
        : n))
      setEditing(null)
    } catch { setError('שגיאת רשת') }
    finally { setBusy(null) }
  }

  if (loading) {
    return <main dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 size={28} className="animate-spin text-indigo-500" /></main>
  }
  if (error && !nodes.length) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50">
            <AlertTriangle size={28} className="text-rose-500" />
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#1B3256' }}>הקישור אינו זמין</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{error}</p>
        </div>
      </main>
    )
  }

  return (
    <main dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-slate-100 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100">
            <GitBranch size={28} className="text-indigo-600" />
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#1B3256' }}>אישור סדר היוחסין</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            עברו על סדר היוחסין של ענף המשפחה. לכל שם ניתן לאשר, לדחות, או לתקן.
            הגישה מוגבלת לענף זה בלבד.
          </p>
        </div>

        {error && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">{error}</div>}

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
          {ordered.map(({ node, depth }) => {
            const meta = STATUS_META[node.status] ?? STATUS_META.pending
            const isBusy = busy === node.id
            return (
              <div key={node.id} className="px-4 py-3" style={{ paddingRight: `${16 + depth * 20}px` }}>
                {editing === node.id ? (
                  <div className="flex items-center gap-2">
                    <input value={editName} autoFocus
                      onChange={e => setEditName(e.target.value.replace(NON_HEBREW, ''))}
                      onKeyDown={e => e.key === 'Enter' && editName.trim() && act(node.id, 'rename', editName.trim())}
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <button onClick={() => act(node.id, 'rename', editName.trim())} disabled={isBusy || !editName.trim()}
                      className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-3 py-2 text-white"><Check size={15} /></button>
                    <button onClick={() => setEditing(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-slate-500"><X size={15} /></button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] text-slate-400 flex-shrink-0">דור {node.generation}</span>
                      <span className="font-semibold text-slate-800 truncate">{node.name}</span>
                      {(node.relation === 'son' || node.relation === 'son_in_law') && (
                        <span className="text-[10px] text-slate-400">({node.relation === 'son' ? 'בן' : 'חתן'})</span>
                      )}
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isBusy ? <Loader2 size={16} className="animate-spin text-slate-400" /> : <>
                        <button onClick={() => act(node.id, 'verify')} title="אישור"
                          className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 px-2.5 py-1.5 text-xs font-semibold"><Check size={13} /> אישור</button>
                        <button onClick={() => act(node.id, 'reject')} title="דחייה"
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 px-2.5 py-1.5 text-xs font-semibold"><X size={13} /> דחייה</button>
                        <button onClick={() => { setEditing(node.id); setEditName(node.name) }} title="תיקון שם"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 px-2.5 py-1.5 text-xs font-semibold"><Pencil size={13} /> תיקון</button>
                      </>}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={16} /> כל שינוי נשמר מיד ומתעדכן אצלנו במערכת. תודה על העזרה!
        </div>
      </div>
    </main>
  )
}
