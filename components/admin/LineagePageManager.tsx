'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  GitBranch, Plus, Trash2, ChevronDown, ChevronLeft,
  Loader2, X, Check, Pencil, RefreshCw, LayoutList, Network,
} from 'lucide-react'

interface LineageNode {
  id: string
  name: string
  parent_id: string | null
  generation: number
  notes?: string
}
interface TreeNode extends LineageNode { children: TreeNode[] }
interface EditPayload { name: string; notes: string; parent_id: string | null }

function buildTree(nodes: LineageNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  nodes.forEach(n => map.set(n.id, { ...n, children: [] }))
  const roots: TreeNode[] = []
  nodes.forEach(n => {
    if (n.parent_id && map.has(n.parent_id)) map.get(n.parent_id)!.children.push(map.get(n.id)!)
    else if (!n.parent_id) roots.push(map.get(n.id)!)
  })
  return roots
}

function descendantsOf(id: string, nodes: LineageNode[]): Set<string> {
  const childrenOf = new Map<string | null, string[]>()
  for (const n of nodes) { const a = childrenOf.get(n.parent_id) ?? []; a.push(n.id); childrenOf.set(n.parent_id, a) }
  const set = new Set<string>([id]); const stack = [id]
  while (stack.length) { const cur = stack.pop()!; for (const c of childrenOf.get(cur) ?? []) { set.add(c); stack.push(c) } }
  return set
}

const GEN_BADGE = ['bg-indigo-100 text-indigo-700','bg-blue-100 text-blue-700','bg-cyan-100 text-cyan-700','bg-teal-100 text-teal-700','bg-green-100 text-green-700','bg-emerald-100 text-emerald-700','bg-amber-100 text-amber-700','bg-orange-100 text-orange-700','bg-rose-100 text-rose-700','bg-purple-100 text-purple-700']
const GEN_DOT  = ['bg-indigo-500','bg-blue-500','bg-cyan-500','bg-teal-500','bg-green-500','bg-emerald-500','bg-amber-500','bg-orange-500','bg-rose-500','bg-purple-500']
const badge = (g: number) => GEN_BADGE[(g - 1) % GEN_BADGE.length]
const dot   = (g: number) => GEN_DOT[(g - 1) % GEN_DOT.length]

// ── Inline Edit Form ──────────────────────────────────────────────────────────
function EditForm({
  node, allNodes, onSave, onCancel, indentPx = 0,
}: {
  node: LineageNode; allNodes: LineageNode[]
  onSave: (id: string, p: EditPayload) => Promise<boolean>
  onCancel: () => void; indentPx?: number
}) {
  const [name, setName] = useState(node.name)
  const [notes, setNotes] = useState(node.notes ?? '')
  const [parent, setParent] = useState(node.parent_id ?? '')
  const [saving, setSaving] = useState(false)
  const blocked = descendantsOf(node.id, allNodes)
  const opts = allNodes.filter(n => !blocked.has(n.id)).sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name, 'he'))
  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    const ok = await onSave(node.id, { name: name.trim(), notes, parent_id: parent || null })
    setSaving(false)
    if (ok) onCancel()
  }
  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex flex-col gap-2" style={{ marginRight: `${indentPx}px` }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-indigo-800 block mb-1">שם</label>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onCancel() }}
            className="w-full rounded-lg border border-indigo-200 px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div>
          <label className="text-xs font-medium text-indigo-800 block mb-1">הערות</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="הערות (אופציונלי)"
            className="w-full rounded-lg border border-indigo-200 px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-indigo-800 block mb-1">הורה (שינוי מיקום בעץ)</label>
        <select value={parent} onChange={e => setParent(e.target.value)}
          className="w-full rounded-lg border border-indigo-200 px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
          <option value="">— שורש (ללא הורה) —</option>
          {opts.map(p => <option key={p.id} value={p.id}>{' '.repeat((p.generation - 1) * 4)}{p.name} (דור {p.generation})</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-3 py-1.5 rounded-lg">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} שמור
        </button>
        <button onClick={onCancel} className="text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5">ביטול</button>
      </div>
    </div>
  )
}

// ── Tree Node ─────────────────────────────────────────────────────────────────
function TreeItem({
  node, depth, allNodes, onAddChild, onDelete, onSave,
}: {
  node: TreeNode; depth: number; allNodes: LineageNode[]
  onAddChild: (id: string, name: string) => void
  onDelete: (id: string, name: string) => void
  onSave: (id: string, p: EditPayload) => Promise<boolean>
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const [editing, setEditing] = useState(false)
  const hasChildren = node.children.length > 0
  const indent = 12 + depth * 24

  return (
    <div>
      <div className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-slate-50 group transition-colors" style={{ paddingRight: `${indent}px` }}>
        <button onClick={() => setExpanded(!expanded)}
          className={`w-5 h-5 flex items-center justify-center text-slate-400 flex-shrink-0 ${!hasChildren ? 'invisible' : ''}`}>
          {expanded ? <ChevronDown size={14} /> : <ChevronLeft size={14} />}
        </button>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot(node.generation)}`} />
        <button onClick={() => setEditing(true)} className="flex-1 min-w-0 text-right text-sm font-medium text-slate-800 hover:text-indigo-600 truncate">
          {node.name}
          {node.notes && <span className="text-xs text-slate-400 font-normal mr-2">· {node.notes}</span>}
        </button>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 tabular-nums ${badge(node.generation)}`}>דור {node.generation}</span>
        {hasChildren && (
          <span className="text-xs text-slate-400 flex-shrink-0 tabular-nums">{node.children.length} ילדים</span>
        )}
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={13} /></button>
          <button onClick={() => onAddChild(node.id, node.name)} className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50"><Plus size={13} /></button>
          <button onClick={() => onDelete(node.id, node.name)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50"><Trash2 size={13} /></button>
        </div>
      </div>

      {editing && (
        <div className="mb-1" style={{ paddingRight: `${indent}px` }}>
          <EditForm node={node} allNodes={allNodes} onSave={onSave} onCancel={() => setEditing(false)} />
        </div>
      )}

      {expanded && hasChildren && node.children.map(child => (
        <TreeItem key={child.id} node={child} depth={depth + 1} allNodes={allNodes} onAddChild={onAddChild} onDelete={onDelete} onSave={onSave} />
      ))}
    </div>
  )
}

// ── Table Row ─────────────────────────────────────────────────────────────────
function TableItem({
  node, allNodes, onAddChild, onDelete, onSave,
}: {
  node: LineageNode; allNodes: LineageNode[]
  onAddChild: (id: string, name: string) => void
  onDelete: (id: string, name: string) => void
  onSave: (id: string, p: EditPayload) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(false)
  const parentName = node.parent_id ? (allNodes.find(n => n.id === node.parent_id)?.name ?? '—') : '—'
  const childCount = allNodes.filter(n => n.parent_id === node.id).length

  return (
    <>
      <tr className="hover:bg-slate-50 transition-colors border-b border-slate-100">
        <td className="px-4 py-3 text-center">
          <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full tabular-nums ${badge(node.generation)}`}>{node.generation}</span>
        </td>
        <td className="px-4 py-3">
          <span className="font-medium text-slate-800">{node.name}</span>
          {node.notes && <span className="block text-xs text-slate-400 mt-0.5">{node.notes}</span>}
        </td>
        <td className="px-4 py-3 text-sm text-slate-500">{parentName}</td>
        <td className="px-4 py-3 text-center">
          {childCount > 0
            ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold tabular-nums">{childCount}</span>
            : <span className="text-slate-300 text-xs">—</span>
          }
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 justify-end">
            <button onClick={() => setEditing(!editing)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil size={13} /></button>
            <button onClick={() => onAddChild(node.id, node.name)} className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50"><Plus size={13} /></button>
            <button onClick={() => onDelete(node.id, node.name)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-50"><Trash2 size={13} /></button>
          </div>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={5} className="px-4 pb-3">
            <EditForm node={node} allNodes={allNodes} onSave={onSave} onCancel={() => setEditing(false)} />
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main Manager ──────────────────────────────────────────────────────────────
export default function LineagePageManager() {
  const [nodes, setNodes] = useState<LineageNode[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'tree' | 'table'>('tree')
  const [showAdd, setShowAdd] = useState(false)
  const [addParentId, setAddParentId] = useState<string | null>(null)
  const [addParentName, setAddParentName] = useState('')
  const [addName, setAddName] = useState('')
  const [addNotes, setAddNotes] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sortGen, setSortGen] = useState<'asc' | 'desc'>('asc')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/admin/lineage', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה'); setNodes([]) }
      else setNodes(data.nodes ?? [])
    } catch { setError('שגיאת רשת') }
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [])

  const openAdd = (parentId: string | null = null, parentName = '') => {
    setAddParentId(parentId); setAddParentName(parentName)
    setAddName(''); setAddNotes(''); setShowAdd(true); setError('')
  }

  const handleAdd = async () => {
    if (!addName.trim()) { setError('שם חובה'); return }
    setAddSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/lineage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName.trim(), parent_id: addParentId, notes: addNotes }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה'); return }
      setShowAdd(false); await load()
    } catch { setError('שגיאת רשת') }
    setAddSaving(false)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`למחוק את "${name}" וכל צאצאיו?`)) return
    try { await fetch(`/api/admin/lineage?id=${id}`, { method: 'DELETE' }); await load() }
    catch { alert('שגיאה במחיקה') }
  }

  const handleSave = async (id: string, payload: EditPayload): Promise<boolean> => {
    try {
      const res = await fetch('/api/admin/lineage', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...payload }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'שגיאה'); return false }
      await load(); return true
    } catch { alert('שגיאת רשת'); return false }
  }

  const maxGen = nodes.reduce((m, n) => Math.max(m, n.generation), 0)
  const tree = buildTree(nodes)

  const q = search.trim().toLowerCase()
  const filteredNodes = q.length >= 1
    ? nodes.filter(n => n.name.toLowerCase().includes(q) || (n.notes ?? '').toLowerCase().includes(q))
    : nodes
  const sortedNodes = [...filteredNodes].sort((a, b) => {
    const cmp = a.generation - b.generation
    return sortGen === 'asc' ? cmp || a.name.localeCompare(b.name, 'he') : -cmp || a.name.localeCompare(b.name, 'he')
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center">
            <GitBranch size={18} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">עץ הדורות</h1>
            <p className="text-xs text-slate-500">{nodes.length} רשומות · {maxGen} דורות</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100" title="רענן">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          {/* View toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setView('tree')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'tree' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Network size={13} /> עץ
            </button>
            <button onClick={() => setView('table')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <LayoutList size={13} /> טבלה
            </button>
          </div>
          <button onClick={() => openAdd()} className="flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg">
            <Plus size={14} /> הוסף רשומה
          </button>
        </div>
      </div>

      {/* Stats by generation */}
      {nodes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: maxGen }, (_, i) => i + 1).map(gen => {
            const count = nodes.filter(n => n.generation === gen).length
            return (
              <span key={gen} className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${badge(gen)}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${dot(gen)}`} />
                דור {gen} · {count}
              </span>
            )
          })}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-indigo-800">
              {addParentId ? `הוסף צאצא של: ${addParentName}` : 'הוסף רשומה חדשה'}
            </p>
            <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-indigo-800 block mb-1">שם *</label>
              <input type="text" value={addName} onChange={e => setAddName(e.target.value)}
                placeholder="שם (למשל: רבי משה סופר)"
                className="w-full rounded-lg border border-indigo-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                autoFocus onKeyDown={e => e.key === 'Enter' && handleAdd()} />
            </div>
            <div>
              <label className="text-xs font-medium text-indigo-800 block mb-1">הערות</label>
              <input type="text" value={addNotes} onChange={e => setAddNotes(e.target.value)}
                placeholder="הערות (אופציונלי)"
                className="w-full rounded-lg border border-indigo-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-indigo-800 block mb-1">שייך להורה (דור קודם)</label>
            <select value={addParentId ?? ''} onChange={e => { setAddParentId(e.target.value || null); setAddParentName(nodes.find(n => n.id === e.target.value)?.name ?? '') }}
              className="w-full rounded-lg border border-indigo-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="">— ללא הורה (שורש / דור ראשון) —</option>
              {[...nodes].sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name, 'he')).map(p => (
                <option key={p.id} value={p.id}>{' '.repeat((p.generation - 1) * 3)}{p.name} (דור {p.generation})</option>
              ))}
            </select>
            <p className="text-[11px] text-indigo-500/80 mt-1">
              {addParentId
                ? `הרשומה תתווסף כצאצא של "${addParentName}" — דור ${(nodes.find(n => n.id === addParentId)?.generation ?? 0) + 1}`
                : 'הרשומה תתווסף כשורש בדור 1'}
            </p>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={addSaving}
              className="flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-3 py-1.5 rounded-lg">
              {addSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} שמור
            </button>
            <button onClick={() => setShowAdd(false)} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5">ביטול</button>
          </div>
        </div>
      )}

      {error && !showAdd && <p className="text-xs text-red-600">{error}</p>}

      {/* Content */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">טוען עץ דורות...</span>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
            <GitBranch size={40} className="text-slate-200" />
            <p className="text-sm">אין נתונים. לחץ על ״הוסף רשומה״ להתחלה.</p>
          </div>
        ) : view === 'tree' ? (
          <div className="p-2">
            {tree.map(node => (
              <TreeItem key={node.id} node={node} depth={0} allNodes={nodes}
                onAddChild={openAdd} onDelete={handleDelete} onSave={handleSave} />
            ))}
          </div>
        ) : (
          <>
            {/* Search & sort bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
              <input
                type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="חיפוש לפי שם..."
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button onClick={() => setSortGen(s => s === 'asc' ? 'desc' : 'asc')}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50">
                דור {sortGen === 'asc' ? '↑' : '↓'}
              </button>
            </div>
            <table className="w-full text-sm text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="px-4 py-3 text-center w-16">דור</th>
                  <th className="px-4 py-3">שם</th>
                  <th className="px-4 py-3">הורה</th>
                  <th className="px-4 py-3 text-center w-20">ילדים</th>
                  <th className="px-4 py-3 text-left w-28">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {sortedNodes.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">לא נמצאו תוצאות</td></tr>
                ) : sortedNodes.map(node => (
                  <TableItem key={node.id} node={node} allNodes={nodes}
                    onAddChild={openAdd} onDelete={handleDelete} onSave={handleSave} />
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Help text */}
      {nodes.length > 0 && !loading && (
        <p className="text-xs text-slate-400">
          {view === 'tree'
            ? 'לחץ על שם לעריכה · הוסף צאצא עם + · מחק עם 🗑'
            : 'לחץ על ✏ לעריכה שם / הערות / הורה · + הוסף צאצא'}
        </p>
      )}
    </div>
  )
}
