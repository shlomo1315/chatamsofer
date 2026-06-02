'use client'
import { useState, useEffect, useCallback } from 'react'
import { GitBranch, Plus, Trash2, ChevronDown, ChevronLeft, Loader2, X, Check, Pencil, RefreshCw } from 'lucide-react'

interface LineageNode {
  id: string
  name: string
  parent_id: string | null
  generation: number
  notes?: string
}

interface TreeNode extends LineageNode {
  children: TreeNode[]
}

interface EditPayload {
  name: string
  notes: string
  parent_id: string | null
}

function buildTree(nodes: LineageNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  nodes.forEach(n => map.set(n.id, { ...n, children: [] }))
  const roots: TreeNode[] = []
  nodes.forEach(n => {
    if (n.parent_id && map.has(n.parent_id)) {
      map.get(n.parent_id)!.children.push(map.get(n.id)!)
    } else if (!n.parent_id) {
      roots.push(map.get(n.id)!)
    }
  })
  return roots
}

// Set of ids that are `id` itself or its descendants (cannot become its parent)
function descendantsOf(id: string, nodes: LineageNode[]): Set<string> {
  const childrenOf = new Map<string | null, string[]>()
  for (const n of nodes) {
    const arr = childrenOf.get(n.parent_id) ?? []
    arr.push(n.id)
    childrenOf.set(n.parent_id, arr)
  }
  const set = new Set<string>([id])
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    for (const c of childrenOf.get(cur) ?? []) { set.add(c); stack.push(c) }
  }
  return set
}

function NodeRow({
  node,
  depth,
  allNodes,
  onAddChild,
  onDelete,
  onSave,
}: {
  node: TreeNode
  depth: number
  allNodes: LineageNode[]
  onAddChild: (parentId: string, parentName: string) => void
  onDelete: (id: string, name: string) => void
  onSave: (id: string, payload: EditPayload) => Promise<boolean>
}) {
  const [expanded, setExpanded] = useState(false) // ברירת מחדל: הכל מכווץ; נפתח רק בלחיצה
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(node.name)
  const [editNotes, setEditNotes] = useState(node.notes ?? '')
  const [editParent, setEditParent] = useState<string>(node.parent_id ?? '')
  const [savingEdit, setSavingEdit] = useState(false)
  const hasChildren = node.children.length > 0

  const startEdit = () => {
    setEditName(node.name)
    setEditNotes(node.notes ?? '')
    setEditParent(node.parent_id ?? '')
    setEditing(true)
  }
  const cancelEdit = () => setEditing(false)
  const saveEdit = async () => {
    if (!editName.trim()) return
    setSavingEdit(true)
    const ok = await onSave(node.id, {
      name: editName.trim(),
      notes: editNotes,
      parent_id: editParent || null,
    })
    setSavingEdit(false)
    if (ok) setEditing(false)
  }

  // Valid parents = every node except this node and its descendants
  const blocked = descendantsOf(node.id, allNodes)
  const parentOptions = allNodes
    .filter((n) => !blocked.has(n.id))
    .sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name, 'he'))

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-3 rounded-lg hover:bg-slate-50 group transition-colors"
        style={{ paddingRight: `${12 + depth * 20}px` }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className={`w-5 h-5 flex items-center justify-center text-slate-400 flex-shrink-0 ${!hasChildren && 'invisible'}`}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
          <div className={`w-2 h-2 rounded-full ${depth === 0 ? 'bg-indigo-500' : depth === 1 ? 'bg-blue-400' : 'bg-slate-300'}`} />
        </div>

        <button
          onClick={startEdit}
          className="flex-1 min-w-0 text-right text-sm text-slate-800 font-medium hover:text-indigo-600 truncate"
          title="לחץ לעריכה"
        >
          {node.name}
          {node.notes ? <span className="text-xs text-slate-400 font-normal mr-2">· {node.notes}</span> : null}
        </button>
        <span className="text-xs text-slate-400 ml-2 flex-shrink-0">דור {node.generation}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={startEdit} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700" title="ערוך">
            <Pencil size={14} />
          </button>
          <button onClick={() => onAddChild(node.id, node.name)} className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50" title="הוסף צאצא">
            <Plus size={14} />
          </button>
          <button onClick={() => onDelete(node.id, node.name)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50" title="מחק">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Inline edit panel */}
      {editing && (
        <div
          className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 mb-1 flex flex-col gap-2"
          style={{ marginRight: `${12 + depth * 20}px` }}
        >
          <label className="text-xs font-medium text-indigo-800">שם</label>
          <input
            type="text"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit() }}
            className="rounded-lg border border-indigo-200 px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <label className="text-xs font-medium text-indigo-800">הערות</label>
          <input
            type="text"
            value={editNotes}
            onChange={e => setEditNotes(e.target.value)}
            placeholder="הערות (אופציונלי)"
            className="rounded-lg border border-indigo-200 px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <label className="text-xs font-medium text-indigo-800">הורה (העברה בעץ)</label>
          <select
            value={editParent}
            onChange={e => setEditParent(e.target.value)}
            className="rounded-lg border border-indigo-200 px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            <option value="">— שורש (ללא הורה) —</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>{' '.repeat((p.generation - 1) * 2)}{p.name} (דור {p.generation})</option>
            ))}
          </select>
          <div className="flex gap-2 mt-1">
            <button
              onClick={saveEdit}
              disabled={savingEdit}
              className="flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              {savingEdit ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              שמור
            </button>
            <button onClick={cancelEdit} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5">ביטול</button>
          </div>
        </div>
      )}

      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <NodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              allNodes={allNodes}
              onAddChild={onAddChild}
              onDelete={onDelete}
              onSave={onSave}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function LineageTreeManager() {
  const [nodes, setNodes] = useState<LineageNode[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formParentId, setFormParentId] = useState<string | null>(null)
  const [formParentName, setFormParentName] = useState('')
  const [formName, setFormName] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadNodes = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/lineage', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה בטעינה'); setNodes([]) }
      else setNodes(data.nodes ?? [])
    } catch {
      setError('שגיאה בטעינת הנתונים')
    }
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadNodes() }, [loadNodes])

  const openAddChild = (parentId: string, parentName: string) => {
    setFormParentId(parentId)
    setFormParentName(parentName)
    setFormName('')
    setFormNotes('')
    setShowForm(true)
    setError('')
  }

  const openAddRoot = () => {
    setFormParentId(null)
    setFormParentName('')
    setFormName('')
    setFormNotes('')
    setShowForm(true)
    setError('')
  }

  const handleSave = async () => {
    if (!formName.trim()) { setError('שם חובה'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/lineage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName, parent_id: formParentId, notes: formNotes }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה'); return }
      setShowForm(false)
      await loadNodes()
    } catch {
      setError('שגיאת רשת')
    }
    setSaving(false)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`למחוק את "${name}" וכל צאצאיו?`)) return
    try {
      await fetch(`/api/admin/lineage?id=${id}`, { method: 'DELETE' })
      await loadNodes()
    } catch {
      alert('שגיאה במחיקה')
    }
  }

  const handleNodeSave = async (id: string, payload: EditPayload): Promise<boolean> => {
    try {
      const res = await fetch('/api/admin/lineage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...payload }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error || 'שגיאה בעריכה'); return false }
      await loadNodes()
      return true
    } catch {
      alert('שגיאת רשת')
      return false
    }
  }

  const tree = buildTree(nodes)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch size={18} className="text-indigo-500" />
          <h2 className="text-sm font-semibold text-slate-700">עץ הדורות</h2>
          <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{nodes.length} רשומות</span>
          <button onClick={loadNodes} className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100" title="רענן">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
        <button
          onClick={openAddRoot}
          className="flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={14} />
          הוסף שורש
        </button>
      </div>

      <p className="text-xs text-slate-500 -mt-1">
        לחץ על שם כדי לערוך שם / הערות / להעביר להורה אחר · <Plus size={11} className="inline -mt-0.5 text-indigo-600" /> צאצא · <Trash2 size={11} className="inline -mt-0.5 text-red-500" /> מחיקה
      </p>

      {showForm && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-indigo-800">
              {formParentId ? `הוסף צאצא של: ${formParentName}` : 'הוסף שורש חדש'}
            </p>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <input
            type="text" value={formName} onChange={e => setFormName(e.target.value)}
            placeholder="שם (למשל: רבי אברהם שמואל בנימין סופר)"
            className="rounded-lg border border-indigo-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            autoFocus onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          <input
            type="text" value={formNotes} onChange={e => setFormNotes(e.target.value)}
            placeholder="הערות (אופציונלי)"
            className="rounded-lg border border-indigo-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              שמור
            </button>
            <button onClick={() => setShowForm(false)} className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1.5">ביטול</button>
          </div>
        </div>
      )}

      {error && !showForm && <p className="text-xs text-red-600">{error}</p>}

      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">טוען עץ דורות...</span>
          </div>
        ) : tree.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">אין נתונים. הוסף שורש ראשון.</div>
        ) : (
          <div className="p-2">
            {tree.map(node => (
              <NodeRow
                key={node.id}
                node={node}
                depth={0}
                allNodes={nodes}
                onAddChild={openAddChild}
                onDelete={handleDelete}
                onSave={handleNodeSave}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
