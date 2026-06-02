'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Plus, RefreshCw, Loader2, ChevronRight, ChevronDown,
  Pencil, Trash2, X, Check, Users,
} from 'lucide-react'

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
  x: number; y: number; cx: number; cy: number
}

// ─── Tree layout ───

const NW = 160, NH = 54, HGAP = 52, VGAP = 100, PAD = 80

function buildTree(flat: LineageNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  flat.forEach(n => map.set(n.id, { ...n, children: [] }))
  const roots: TreeNode[] = []
  flat.forEach(n => {
    const node = map.get(n.id)!
    if (n.parent_id && map.has(n.parent_id)) map.get(n.parent_id)!.children.push(node)
    else roots.push(node)
  })
  return roots
}

function subtreeW(n: TreeNode): number {
  return n.children.length ? n.children.reduce((s, c) => s + subtreeW(c), 0) : NW + HGAP
}

function layoutTree(roots: TreeNode[]): Positioned[] {
  const result: Positioned[] = []
  function place(n: TreeNode, x: number, y: number) {
    const sw = subtreeW(n), cx = x + sw / 2
    result.push({ node: n, x: cx - NW / 2, y, cx, cy: y + NH / 2 })
    let cx2 = x
    n.children.forEach(c => { place(c, cx2, y + NH + VGAP); cx2 += subtreeW(c) })
  }
  let sx = PAD
  roots.forEach(r => { place(r, sx, PAD); sx += subtreeW(r) })
  return result
}

function canvasSize(pos: Positioned[]) {
  if (!pos.length) return { w: 800, h: 400 }
  return { w: Math.max(...pos.map(p => p.x + NW)) + PAD, h: Math.max(...pos.map(p => p.y + NH)) + PAD }
}

function collectEdges(positions: Positioned[]) {
  const byId = new Map(positions.map(p => [p.node.id, p]))
  return positions.flatMap(p =>
    p.node.children.map(c => { const cp = byId.get(c.id); return cp ? { from: p, to: cp } : null })
      .filter(Boolean) as { from: Positioned; to: Positioned }[]
  )
}

// ─── Colors ───

const PALETTE = [
  { bg: 'linear-gradient(140deg,#7C3AED,#4C1D95)', ring: '#7C3AED', shadow: 'rgba(109,40,217,0.40)', light: '#F5F0FF', text: '#5B21B6' },
  { bg: 'linear-gradient(140deg,#1D4ED8,#1E3A8A)', ring: '#1D4ED8', shadow: 'rgba(29,78,216,0.35)',  light: '#EFF6FF', text: '#1E40AF' },
  { bg: 'linear-gradient(140deg,#0369A1,#0C4A6E)', ring: '#0369A1', shadow: 'rgba(3,105,161,0.35)',  light: '#E0F2FE', text: '#075985' },
  { bg: 'linear-gradient(140deg,#047857,#064E3B)', ring: '#047857', shadow: 'rgba(4,120,87,0.35)',   light: '#ECFDF5', text: '#065F46' },
  { bg: 'linear-gradient(140deg,#B45309,#78350F)', ring: '#B45309', shadow: 'rgba(180,83,9,0.35)',   light: '#FFFBEB', text: '#92400E' },
  { bg: 'linear-gradient(140deg,#BE185D,#831843)', ring: '#BE185D', shadow: 'rgba(190,24,93,0.35)',  light: '#FDF2F8', text: '#9D174D' },
]
const pal = (g: number) => PALETTE[g % PALETTE.length]

// ─── Modal ───

type ModalState =
  | { type: 'edit';   node: LineageNode }
  | { type: 'add';    parentId: string | null; parentName: string }
  | { type: 'delete'; node: TreeNode }
  | null

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,10,30,0.5)', backdropFilter: 'blur(4px)', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 380, boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }} dir="rtl" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid #F1F5F9' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1E293B' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '16px 20px 20px' }}>{children}</div>
      </div>
    </div>
  )
}

// ─── Tree view ───

function TreeView({ nodes, onRefresh }: { nodes: LineageNode[]; onRefresh: () => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  const positions = useMemo(() => layoutTree(buildTree(nodes)), [nodes])
  const edges = useMemo(() => collectEdges(positions), [positions])
  const { w, h } = useMemo(() => canvasSize(positions), [positions])

  function close() { setModal(null); setSaveErr('') }

  async function handleSave() {
    if (!formName.trim()) { setSaveErr('נא להזין שם'); return }
    setSaving(true); setSaveErr('')
    try {
      if (modal?.type === 'edit') {
        await fetch(`/api/lineage?id=${modal.node.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formName }) })
      } else if (modal?.type === 'add') {
        await fetch('/api/lineage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formName, parent_id: modal.parentId }) })
      }
      onRefresh(); close()
    } catch { setSaveErr('שגיאה') }
    setSaving(false)
  }

  async function handleDelete() {
    if (modal?.type !== 'delete') return
    setSaving(true)
    try {
      await fetch(`/api/lineage?id=${modal.node.id}`, { method: 'DELETE' })
      if (selected === modal.node.id) setSelected(null)
      onRefresh(); close()
    } catch { setSaveErr('שגיאה') }
    setSaving(false)
  }

  const selPos = selected ? positions.find(p => p.node.id === selected) ?? null : null

  if (!nodes.length) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 16, color: '#B8A8D8' }}>
      <Users size={52} style={{ opacity: 0.3 }} />
      <p style={{ margin: 0, fontSize: 14 }}>אין צמתים בעץ עדיין</p>
      <button onClick={() => { setFormName(''); setModal({ type: 'add', parentId: null, parentName: '' }) }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(140deg,#7C3AED,#4C1D95)', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
        <Plus size={16} /> הוסף שורש
      </button>
    </div>
  )

  return (
    <>
      {/* canvas */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', borderRadius: 16, background: '#fff', border: '1px solid #E8E0F5', boxShadow: '0 4px 24px rgba(109,40,217,0.06)', backgroundImage: 'radial-gradient(circle,#D8CCF0 1px,transparent 1px)', backgroundSize: '28px 28px', backgroundPosition: '14px 14px', minHeight: 260 }}>
        <div style={{ position: 'relative', width: w, height: h + 60, minWidth: '100%' }}>
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} width={w} height={h + 60}>
            {edges.map((e, i) => {
              const x1 = e.from.cx, y1 = e.from.y + NH, x2 = e.to.cx, y2 = e.to.y, mid = (y1 + y2) / 2
              return <path key={i} d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`} fill="none" stroke="#C8B8D8" strokeWidth={2.5} strokeLinecap="round" />
            })}
          </svg>

          {positions.map(pos => {
            const p = pal(pos.node.generation)
            const isSel = selected === pos.node.id
            return (
              <div key={pos.node.id} onClick={() => setSelected(prev => prev === pos.node.id ? null : pos.node.id)} style={{ position: 'absolute', left: pos.x, top: pos.y, width: NW, height: NH, borderRadius: 14, background: p.bg, boxShadow: isSel ? `0 0 0 3px #fff,0 0 0 5px ${p.ring},0 8px 24px ${p.shadow}` : `0 4px 16px ${p.shadow}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transform: isSel ? 'scale(1.06)' : 'scale(1)', transition: 'box-shadow .2s,transform .2s', zIndex: isSel ? 20 : 2, userSelect: 'none' }}>
                {/* badge */}
                <div style={{ position: 'absolute', top: -9, right: 4, background: '#fff', color: p.ring, fontSize: 10, fontWeight: 800, width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 2px 6px ${p.shadow}`, border: `1.5px solid ${p.ring}` }}>{pos.node.generation + 1}</div>
                {/* name */}
                <span style={{ color: '#fff', fontWeight: 700, fontSize: pos.node.name.length > 12 ? 12 : 14, textAlign: 'center', direction: 'rtl', padding: '0 14px', lineHeight: 1.35, textShadow: '0 1px 3px rgba(0,0,0,0.35)', maxWidth: NW - 20, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{pos.node.name}</span>
                {/* actions strip */}
                {isSel && (
                  <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: -44, display: 'flex', gap: 6, background: '#fff', borderRadius: 20, padding: '5px 10px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', border: '1px solid #E2E8F0', zIndex: 30 }}>
                    {[
                      { icon: '✎', color: p.ring,    fn: () => { setFormName(pos.node.name); setModal({ type: 'edit', node: pos.node }) } },
                      { icon: '+', color: '#16a34a',  fn: () => { setFormName(''); setModal({ type: 'add', parentId: pos.node.id, parentName: pos.node.name }) } },
                      { icon: '✕', color: '#dc2626',  fn: () => setModal({ type: 'delete', node: pos.node }) },
                    ].map((b, i) => (
                      <button key={i} onClick={b.fn} style={{ width: 28, height: 28, borderRadius: '50%', background: b.color, color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>{b.icon}</button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* selected info panel */}
      {selPos && (
        <div style={{ marginTop: 14, background: '#fff', borderRadius: 14, border: `2px solid ${pal(selPos.node.generation).ring}`, padding: '14px 18px', boxShadow: `0 4px 20px ${pal(selPos.node.generation).shadow}`, direction: 'rtl' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 3, fontWeight: 600 }}>צומת נבחר</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1E1035' }}>{selPos.node.name}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>דור {selPos.node.generation + 1} · {selPos.node.children.length} ילדים</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'עריכה',    fn: () => { setFormName(selPos.node.name); setModal({ type: 'edit',   node: selPos.node }) }, color: '#7C3AED', bg: '#F5F0FF' },
                { label: 'הוסף ילד', fn: () => { setFormName(''); setModal({ type: 'add',    parentId: selPos.node.id, parentName: selPos.node.name }) }, color: '#16a34a', bg: '#F0FDF4' },
                { label: 'מחיקה',    fn: () => setModal({ type: 'delete', node: selPos.node }),  color: '#dc2626', bg: '#FEF2F2' },
              ].map(b => (
                <button key={b.label} onClick={b.fn} style={{ background: b.bg, color: b.color, border: `1px solid ${b.color}33`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{b.label}</button>
              ))}
            </div>
          </div>
          {selPos.node.children.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, marginBottom: 6 }}>ילדים:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selPos.node.children.map(c => (
                  <button key={c.id} onClick={() => setSelected(c.id)} style={{ padding: '4px 12px', borderRadius: 16, border: 'none', background: pal(c.generation).bg, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', direction: 'rtl', boxShadow: `0 2px 8px ${pal(c.generation).shadow}` }}>{c.name}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* floating add root btn */}
      <button onClick={() => { setFormName(''); setModal({ type: 'add', parentId: null, parentName: '' }) }} title="הוסף שורש" style={{ position: 'fixed', bottom: 28, left: 28, width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(140deg,#7C3AED,#4C1D95)', color: '#fff', border: 'none', fontSize: 24, fontWeight: 700, cursor: 'pointer', zIndex: 50, boxShadow: '0 6px 20px rgba(109,40,217,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>

      {/* modals */}
      {modal?.type === 'edit' && (
        <Modal title={`עריכת: ${modal.node.name}`} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} style={{ border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '10px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit' }} />
            {saveErr && <span style={{ color: '#dc2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="שמור" color="#7C3AED" onClick={handleSave} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'add' && (
        <Modal title={modal.parentId ? `הוסף ילד ל: ${modal.parentName}` : 'הוסף שורש חדש'} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="הכנס שם..." style={{ border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '10px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit' }} />
            {saveErr && <span style={{ color: '#dc2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="הוסף" color="#16a34a" onClick={handleSave} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'delete' && (
        <Modal title="מחיקת צומת" onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#334155' }}>האם למחוק את <strong>{modal.node.name}</strong>?</p>
            {(modal.node.children?.length ?? 0) > 0 && <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#92400E' }}>{modal.node.children.length} ילדים יאבדו את ההורה</div>}
            {saveErr && <span style={{ color: '#dc2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="מחק" color="#dc2626" onClick={handleDelete} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ─── Table view ───

function TableView({ nodes, onAdd, onEdit, onDelete }: {
  nodes: LineageNode[]
  onAdd: (parentId: string | null, parentName: string) => void
  onEdit: (node: LineageNode) => void
  onDelete: (node: LineageNode) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const roots = useMemo(() => buildTree(nodes), [nodes])
  const childCount = useMemo(() => {
    const map = new Map<string, number>()
    nodes.forEach(n => {
      if (n.parent_id) map.set(n.parent_id, (map.get(n.parent_id) ?? 0) + 1)
    })
    return map
  }, [nodes])

  function toggle(id: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function renderRows(node: TreeNode, depth: number): React.ReactNode {
    const p = pal(node.generation)
    const hasChildren = node.children.length > 0
    const isExpanded = expanded.has(node.id)
    return (
      <div key={node.id}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #F1F5F9', direction: 'rtl', gap: 10, background: '#fff', transition: 'background .15s' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#FAFAF8')}
          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
          {/* indent */}
          <div style={{ width: depth * 24, flexShrink: 0 }} />
          {/* expand btn */}
          <button onClick={() => toggle(node.id)} style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default', color: '#94A3B8', flexShrink: 0 }}>
            {hasChildren ? (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span style={{ width: 14 }} />}
          </button>
          {/* dot */}
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.ring, flexShrink: 0 }} />
          {/* name */}
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{node.name}</span>
          {/* generation badge */}
          <div style={{ padding: '2px 10px', borderRadius: 20, background: p.light, color: p.text, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>דור {node.generation + 1}</div>
          {/* children count */}
          <div style={{ minWidth: 60, textAlign: 'center', fontSize: 12, color: '#64748B', flexShrink: 0 }}>
            {childCount.get(node.id) ? `${childCount.get(node.id)} ילדים` : '—'}
          </div>
          {/* actions */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => onAdd(node.id, node.name)} title="הוסף ילד" style={{ width: 28, height: 28, borderRadius: 8, background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#16a34a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={13} /></button>
            <button onClick={() => onEdit(node)} title="עריכה" style={{ width: 28, height: 28, borderRadius: 8, background: '#F5F0FF', border: '1px solid #DDD6FE', color: '#7C3AED', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={12} /></button>
            <button onClick={() => onDelete(node)} title="מחיקה" style={{ width: 28, height: 28, borderRadius: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={12} /></button>
          </div>
        </div>
        {isExpanded && node.children.map(c => renderRows(c, depth + 1))}
      </div>
    )
  }

  return (
    <div style={{ borderRadius: 16, border: '1px solid #E8E0F5', overflow: 'hidden', background: '#fff', boxShadow: '0 4px 24px rgba(109,40,217,0.06)' }}>
      {/* table header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', background: '#F8F6FF', borderBottom: '1px solid #E8E0F5', direction: 'rtl', gap: 10 }}>
        <div style={{ width: 54, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#64748B' }}>שם</span>
        <span style={{ minWidth: 80, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#64748B', flexShrink: 0 }}>דור</span>
        <span style={{ minWidth: 60, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#64748B', flexShrink: 0 }}>ילדים</span>
        <span style={{ width: 96, flexShrink: 0 }} />
      </div>
      {roots.length === 0
        ? <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>אין נתונים</div>
        : roots.map(r => renderRows(r, 0))
      }
    </div>
  )
}

function MBtn({ label, color, onClick, loading }: { label: string; color: string; onClick: () => void; loading?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, background: color, color: '#fff', border: 'none', borderRadius: 10, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1, fontFamily: 'inherit' }}>
      {loading && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
      {label}
    </button>
  )
}

// ─── Main page ───

type View = 'tree' | 'table'

export default function LineagePage() {
  const [nodes,   setNodes]   = useState<LineageNode[]>([])
  const [loading, setLoading] = useState(true)
  const [view,    setView]    = useState<View>('tree')
  const [modal,   setModal]   = useState<ModalState>(null)
  const [formName, setFormName] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [saveErr, setSaveErr] = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/lineage?all=1')
      setNodes((await r.json()).nodes ?? [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const maxGen = nodes.length ? Math.max(...nodes.map(n => n.generation)) : -1
  const genCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    nodes.forEach(n => { counts[n.generation] = (counts[n.generation] ?? 0) + 1 })
    return counts
  }, [nodes])

  function close() { setModal(null); setSaveErr('') }

  async function handleSave() {
    if (!formName.trim()) { setSaveErr('נא להזין שם'); return }
    setSaving(true); setSaveErr('')
    try {
      if (modal?.type === 'edit') {
        await fetch(`/api/lineage?id=${modal.node.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formName }) })
      } else if (modal?.type === 'add') {
        await fetch('/api/lineage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formName, parent_id: modal.parentId }) })
      }
      await loadAll(); close()
    } catch { setSaveErr('שגיאה') }
    setSaving(false)
  }

  async function handleDelete() {
    if (modal?.type !== 'delete') return
    setSaving(true)
    try {
      await fetch(`/api/lineage?id=${modal.node.id}`, { method: 'DELETE' })
      await loadAll(); close()
    } catch { setSaveErr('שגיאה') }
    setSaving(false)
  }

  return (
    <div dir="rtl">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* ── toolbar ── */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-800">עץ הדורות</h1>
          <span className="text-sm text-gray-400">{nodes.length} רשומות · {maxGen + 1} דורות</span>
        </div>
        <div className="flex items-center gap-2">
          {/* view toggle */}
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {(['tree', 'table'] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${view === v ? 'bg-white shadow text-violet-700' : 'text-gray-400 hover:text-gray-600'}`}>
                {v === 'tree' ? '🌳 עץ' : '📋 טבלה'}
              </button>
            ))}
          </div>
          {/* refresh */}
          <button onClick={loadAll} disabled={loading} title="רענן"
            className="w-9 h-9 rounded-xl bg-white border border-gray-200 text-violet-600 flex items-center justify-center hover:bg-gray-50 transition-colors">
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          {/* add */}
          <button onClick={() => { setFormName(''); setModal({ type: 'add', parentId: null, parentName: '' }) }}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm">
            <Plus size={14} /> הוסף רשומה
          </button>
        </div>
      </div>

      {/* generation legend */}
      {nodes.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {Array.from({ length: maxGen + 1 }, (_, i) => i).map(g => (
            <div key={g} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
              style={{ background: pal(g).light, borderColor: `${pal(g).ring}44`, color: pal(g).text }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: pal(g).ring }} />
              דור {g + 1} · {genCounts[g] ?? 0}
            </div>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      <div>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 10, color: '#7C3AED' }}>
            <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 15, fontWeight: 600 }}>טוען…</span>
          </div>
        ) : view === 'tree' ? (
          <TreeView nodes={nodes} onRefresh={loadAll} />
        ) : (
          <TableView
            nodes={nodes}
            onAdd={(parentId, parentName) => { setFormName(''); setModal({ type: 'add', parentId, parentName }) }}
            onEdit={node => { setFormName(node.name); setModal({ type: 'edit', node }) }}
            onDelete={node => setModal({ type: 'delete', node: { ...node, children: buildTree(nodes).find(n => n.id === node.id)?.children ?? [] } })}
          />
        )}
      </div>

      {/* ── Page-level modals (for table view) ── */}
      {modal?.type === 'edit' && (
        <Modal title={`עריכת: ${modal.node.name}`} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} style={{ border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '10px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit' }} />
            {saveErr && <span style={{ color: '#dc2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="שמור" color="#7C3AED" onClick={handleSave} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'add' && (
        <Modal title={modal.parentId ? `הוסף ילד ל: ${modal.parentName}` : 'הוסף שורש חדש'} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="הכנס שם..." style={{ border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '10px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit' }} />
            {saveErr && <span style={{ color: '#dc2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="הוסף" color="#16a34a" onClick={handleSave} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'delete' && (
        <Modal title="מחיקת צומת" onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#334155' }}>האם למחוק את <strong>{modal.node.name}</strong>?</p>
            {saveErr && <span style={{ color: '#dc2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="מחק" color="#dc2626" onClick={handleDelete} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  const parentId = request.nextUrl.searchParams.get('parent_id')
  const all = request.nextUrl.searchParams.get('all')

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let query = admin.from('lineage_nodes').select('*').order('generation').order('name')

  if (all === '1') {
    // return all nodes (for tree view)
  } else if (parentId) {
    query = query.eq('parent_id', parentId)
  } else {
    query = query.is('parent_id', null)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ nodes: data ?? [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { name, parent_id } = body

  if (!name?.trim()) return NextResponse.json({ error: 'שם הוא שדה חובה' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let generation = 0
  if (parent_id) {
    const { data: parent } = await admin
      .from('lineage_nodes').select('generation').eq('id', parent_id).single()
    if (parent) generation = (parent.generation ?? 0) + 1
  }

  const { data, error } = await admin
    .from('lineage_nodes')
    .insert({ name: name.trim(), parent_id: parent_id ?? null, generation })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ node: data })
}

export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'חסר id' }, { status: 400 })

  const body = await request.json().catch(() => ({}))
  const { name } = body
  if (!name?.trim()) return NextResponse.json({ error: 'שם הוא שדה חובה' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await admin
    .from('lineage_nodes').update({ name: name.trim() }).eq('id', id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ node: data })
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'חסר id' }, { status: 400 })

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { error } = await admin.from('lineage_nodes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
