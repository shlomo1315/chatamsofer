'use client'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Plus, Pencil, Trash2, X, Check, Loader2, GitBranch, Users, ChevronRight } from 'lucide-react'

// ─── Types ───

interface LineageNode {
  id: string
  name: string
  generation: number
  parent_id: string | null
}

interface TreeNode extends LineageNode {
  children: TreeNode[]
}

interface Positioned {
  node: TreeNode
  x: number
  y: number
  cx: number
  cy: number
}

// ─── Layout constants ───

const NW = 148   // node width
const NH = 58    // node height
const HGAP = 50  // horizontal gap between siblings
const VGAP = 96  // vertical gap between generations
const PAD = 60   // canvas padding

// ─── Tree layout helpers ───

function buildTree(flat: LineageNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  flat.forEach(n => map.set(n.id, { ...n, children: [] }))
  const roots: TreeNode[] = []
  flat.forEach(n => {
    const node = map.get(n.id)!
    if (n.parent_id && map.has(n.parent_id)) {
      map.get(n.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  })
  return roots
}

function subtreeWidth(node: TreeNode): number {
  if (node.children.length === 0) return NW + HGAP
  return node.children.reduce((s, c) => s + subtreeWidth(c), 0)
}

function layoutTree(roots: TreeNode[]): Positioned[] {
  const result: Positioned[] = []

  function place(node: TreeNode, x: number, y: number) {
    const sw = subtreeWidth(node)
    const cx = x + sw / 2
    result.push({ node, x: cx - NW / 2, y, cx, cy: y + NH / 2 })
    let childX = x
    node.children.forEach(child => {
      place(child, childX, y + NH + VGAP)
      childX += subtreeWidth(child)
    })
  }

  let startX = PAD
  roots.forEach(root => {
    place(root, startX, PAD)
    startX += subtreeWidth(root)
  })

  return result
}

function canvasSize(positions: Positioned[]) {
  if (positions.length === 0) return { w: 800, h: 400 }
  const maxX = Math.max(...positions.map(p => p.x + NW)) + PAD
  const maxY = Math.max(...positions.map(p => p.y + NH)) + PAD
  return { w: Math.max(maxX, 600), h: Math.max(maxY, 300) }
}

// ─── Modal ───

function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" dir="rtl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

// ─── Node oval ───

function OvalNode({
  pos, selected, onEdit, onAddChild, onDelete,
  onClick, dimmed,
}: {
  pos: Positioned
  selected: boolean
  onClick: () => void
  onEdit: () => void
  onAddChild: () => void
  onDelete: () => void
  dimmed: boolean
}) {
  const gen = pos.node.generation
  const palettes = [
    { bg: '#7C3AED', border: '#5B21B6', text: '#fff', shadow: 'rgba(124,58,237,0.35)' },
    { bg: '#1D4ED8', border: '#1E40AF', text: '#fff', shadow: 'rgba(29,78,216,0.3)' },
    { bg: '#0369A1', border: '#075985', text: '#fff', shadow: 'rgba(3,105,161,0.3)' },
    { bg: '#047857', border: '#065F46', text: '#fff', shadow: 'rgba(4,120,87,0.3)' },
    { bg: '#B45309', border: '#92400E', text: '#fff', shadow: 'rgba(180,83,9,0.3)' },
    { bg: '#BE185D', border: '#9D174D', text: '#fff', shadow: 'rgba(190,24,93,0.3)' },
  ]
  const pal = palettes[gen % palettes.length]

  return (
    <g
      transform={`translate(${pos.x}, ${pos.y})`}
      className="cursor-pointer"
      style={{ opacity: dimmed ? 0.3 : 1, transition: 'opacity .2s' }}
    >
      {/* shadow ellipse */}
      <ellipse
        cx={NW / 2} cy={NH / 2 + 4}
        rx={NW / 2 - 2} ry={NH / 2 - 2}
        fill={pal.shadow}
        style={{ filter: 'blur(8px)' }}
      />
      {/* main oval */}
      <ellipse
        cx={NW / 2} cy={NH / 2}
        rx={NW / 2 - 1} ry={NH / 2 - 1}
        fill={selected ? pal.border : pal.bg}
        stroke={pal.border}
        strokeWidth={selected ? 3 : 1.5}
        style={{ transition: 'fill .15s' }}
        onClick={onClick}
      />
      {/* name text */}
      <text
        x={NW / 2} y={NH / 2}
        textAnchor="middle" dominantBaseline="middle"
        fill={pal.text}
        fontSize={13}
        fontWeight="600"
        fontFamily="'Segoe UI', Tahoma, Arial, sans-serif"
        style={{ pointerEvents: 'none', userSelect: 'none' }}
      >
        {pos.node.name.length > 16
          ? pos.node.name.slice(0, 14) + '…'
          : pos.node.name}
      </text>

      {/* action buttons — only visible on hover via CSS group */}
      <g className="node-actions" style={{ opacity: selected ? 1 : 0, transition: 'opacity .15s' }}>
        {/* edit */}
        <circle cx={NW - 10} cy={10} r={10} fill="#fff" stroke={pal.border} strokeWidth={1.5}
          style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onEdit() }} />
        <text x={NW - 10} y={10} textAnchor="middle" dominantBaseline="middle"
          fontSize={10} fill={pal.border} style={{ pointerEvents: 'none' }}>✎</text>
        {/* add child */}
        <circle cx={NW - 10} cy={NH - 10} r={10} fill="#fff" stroke="#16a34a" strokeWidth={1.5}
          style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onAddChild() }} />
        <text x={NW - 10} y={NH - 10} textAnchor="middle" dominantBaseline="middle"
          fontSize={14} fill="#16a34a" style={{ pointerEvents: 'none' }}>+</text>
        {/* delete */}
        <circle cx={10} cy={10} r={10} fill="#fff" stroke="#dc2626" strokeWidth={1.5}
          style={{ cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onDelete() }} />
        <text x={10} y={10} textAnchor="middle" dominantBaseline="middle"
          fontSize={10} fill="#dc2626" style={{ pointerEvents: 'none' }}>✕</text>
      </g>
    </g>
  )
}

// ─── Edge (curved line) ───

function Edge({ from, to }: { from: Positioned; to: Positioned }) {
  const x1 = from.cx
  const y1 = from.y + NH
  const x2 = to.cx
  const y2 = to.y
  const my = (y1 + y2) / 2

  return (
    <path
      d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`}
      fill="none"
      stroke="#94A3B8"
      strokeWidth={2}
      strokeDasharray="none"
    />
  )
}

// ─── Build edge list ───

function collectEdges(positions: Positioned[]): { from: Positioned; to: Positioned }[] {
  const byId = new Map(positions.map(p => [p.node.id, p]))
  return positions.flatMap(p =>
    p.node.children.map(child => {
      const childPos = byId.get(child.id)
      return childPos ? { from: p, to: childPos } : null
    }).filter(Boolean) as { from: Positioned; to: Positioned }[]
  )
}

// ─── Main page ───

export default function FamilyTreePage() {
  const [nodes, setNodes] = useState<LineageNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  const [modal, setModal] = useState<
    | { type: 'edit'; node: LineageNode }
    | { type: 'add'; parentId: string | null; parentName: string }
    | { type: 'delete'; node: TreeNode }
    | null
  >(null)

  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // ─── Load all nodes ───

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/lineage?all=1')
      const data = await res.json()
      setNodes(data.nodes ?? [])
    } catch {
      setError('שגיאה בטעינת העץ')
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ─── Tree layout ───

  const positions = useMemo(() => {
    const roots = buildTree(nodes)
    return layoutTree(roots)
  }, [nodes])

  const edges = useMemo(() => collectEdges(positions), [positions])
  const { w, h } = useMemo(() => canvasSize(positions), [positions])

  const selectedPos = selected ? positions.find(p => p.node.id === selected) ?? null : null

  // ─── Actions ───

  function openEdit(node: LineageNode) {
    setFormName(node.name)
    setSaveError('')
    setModal({ type: 'edit', node })
  }

  function openAdd(parentId: string | null, parentName: string) {
    setFormName('')
    setSaveError('')
    setModal({ type: 'add', parentId, parentName })
  }

  function openDelete(node: TreeNode) {
    setSaveError('')
    setModal({ type: 'delete', node })
  }

  async function handleSave() {
    if (!formName.trim()) { setSaveError('נא להזין שם'); return }
    setSaving(true); setSaveError('')
    try {
      if (modal?.type === 'edit') {
        const res = await fetch(`/api/lineage?id=${modal.node.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName }),
        })
        const data = await res.json()
        if (data.error) { setSaveError(data.error); setSaving(false); return }
      } else if (modal?.type === 'add') {
        const res = await fetch('/api/lineage', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName, parent_id: modal.parentId }),
        })
        const data = await res.json()
        if (data.error) { setSaveError(data.error); setSaving(false); return }
      }
      await loadAll()
      setModal(null)
    } catch {
      setSaveError('שגיאה בשמירה')
    }
    setSaving(false)
  }

  async function handleDelete() {
    if (modal?.type !== 'delete') return
    setSaving(true); setSaveError('')
    try {
      const res = await fetch(`/api/lineage?id=${modal.node.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) { setSaveError(data.error); setSaving(false); return }
      await loadAll()
      if (selected === modal.node.id) setSelected(null)
      setModal(null)
    } catch {
      setSaveError('שגיאה במחיקה')
    }
    setSaving(false)
  }

  // ─── Render ───

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100" dir="rtl">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center">
            <GitBranch size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-800">עץ הדורות</h1>
            <p className="text-xs text-slate-500">{nodes.length} צמתים</p>
          </div>
        </div>
        <button
          onClick={() => openAdd(null, 'שורש')}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-sm"
        >
          <Plus size={15} />
          הוסף שורש
        </button>
      </header>

      {/* Canvas area */}
      <main className="p-4">
        {loading && (
          <div className="flex items-center justify-center h-64 gap-3 text-slate-500">
            <Loader2 size={22} className="animate-spin" />
            <span>טוען עץ דורות…</span>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-64">
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-3 text-sm">
              {error}
            </div>
          </div>
        )}

        {!loading && !error && nodes.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-400">
            <Users size={48} className="opacity-30" />
            <p className="text-sm">אין צמתים בעץ עדיין</p>
            <button
              onClick={() => openAdd(null, 'שורש')}
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            >
              <Plus size={15} /> הוסף את הדור הראשון
            </button>
          </div>
        )}

        {!loading && !error && nodes.length > 0 && (
          <div className="overflow-auto rounded-2xl bg-white shadow-sm border border-slate-200">
            <svg
              width={w}
              height={h}
              style={{ display: 'block', minWidth: '100%' }}
            >
              {/* edges */}
              {edges.map((e, i) => (
                <Edge key={i} from={e.from} to={e.to} />
              ))}

              {/* nodes */}
              {positions.map(pos => (
                <OvalNode
                  key={pos.node.id}
                  pos={pos}
                  selected={selected === pos.node.id}
                  dimmed={selected !== null && selected !== pos.node.id}
                  onClick={() => setSelected(prev => prev === pos.node.id ? null : pos.node.id)}
                  onEdit={() => openEdit(pos.node)}
                  onAddChild={() => openAdd(pos.node.id, pos.node.name)}
                  onDelete={() => openDelete(pos.node)}
                />
              ))}
            </svg>
          </div>
        )}

        {/* Side info panel when a node is selected */}
        {selectedPos && (
          <div className="mt-4 bg-white rounded-2xl border border-slate-200 shadow-sm p-5" dir="rtl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-400 mb-1">צומת נבחר</p>
                <h2 className="text-xl font-bold text-slate-800">{selectedPos.node.name}</h2>
                <p className="text-sm text-slate-500 mt-1">
                  דור {selectedPos.node.generation + 1} &middot; {selectedPos.node.children.length} ילדים
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => openEdit(selectedPos.node)}
                  className="flex items-center gap-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Pencil size={13} /> עריכה
                </button>
                <button
                  onClick={() => openAdd(selectedPos.node.id, selectedPos.node.name)}
                  className="flex items-center gap-1.5 text-sm bg-green-50 hover:bg-green-100 text-green-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus size={13} /> הוסף ילד
                </button>
                <button
                  onClick={() => openDelete(selectedPos.node)}
                  className="flex items-center gap-1.5 text-sm bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Trash2 size={13} /> מחיקה
                </button>
              </div>
            </div>

            {selectedPos.node.children.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-medium text-slate-500 mb-2">ילדים:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedPos.node.children.map(child => (
                    <button
                      key={child.id}
                      onClick={() => setSelected(child.id)}
                      className="text-sm px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700 transition-colors flex items-center gap-1"
                    >
                      <ChevronRight size={12} /> {child.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ─── Modals ─── */}

      {modal?.type === 'edit' && (
        <Modal title={`עריכת: ${modal.node.name}`} onClose={() => setModal(null)}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">שם</label>
              <input
                autoFocus
                className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>
            {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            <div className="flex gap-2 justify-start">
              <button
                onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                שמור
              </button>
              <button onClick={() => setModal(null)}
                className="text-sm px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors">
                ביטול
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modal?.type === 'add' && (
        <Modal
          title={modal.parentId ? `הוספת ילד ל: ${modal.parentName}` : 'הוספת שורש חדש'}
          onClose={() => setModal(null)}
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">שם</label>
              <input
                autoFocus
                className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="הכנס שם..."
                value={formName}
                onChange={e => setFormName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>
            {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            <div className="flex gap-2 justify-start">
              <button
                onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                הוסף
              </button>
              <button onClick={() => setModal(null)}
                className="text-sm px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors">
                ביטול
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modal?.type === 'delete' && (
        <Modal title="מחיקת צומת" onClose={() => setModal(null)}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-700">
              האם למחוק את <strong>{modal.node.name}</strong>?
              {modal.node.children?.length > 0 && (
                <span className="block mt-1 text-amber-700 bg-amber-50 rounded-lg px-3 py-2 text-xs border border-amber-200">
                  שים לב: לצומת זה יש {modal.node.children.length} ילדים. המחיקה עלולה להשפיע עליהם.
                </span>
              )}
            </p>
            {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            <div className="flex gap-2 justify-start">
              <button
                onClick={handleDelete} disabled={saving}
                className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                מחק
              </button>
              <button onClick={() => setModal(null)}
                className="text-sm px-4 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors">
                ביטול
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
