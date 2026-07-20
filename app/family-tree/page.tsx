'use client'
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { Plus, Pencil, Trash2, X, Check, Loader2, GitBranch, Users, Search } from 'lucide-react'

// ─── Types ───

interface LineageNode {
  id: string
  name: string
  generation: number
  parent_id: string | null
  status?: 'verified' | 'pending' | 'rejected'
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

type ModalState =
  | { type: 'edit'; node: TreeNode }
  | { type: 'add'; parentId: string | null; parentName: string }
  | { type: 'delete'; node: TreeNode }
  | null

// ─── Layout ───

const NW = 164, NH = 62, HGAP = 56, VGAP = 110, PAD = 80

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

function subtreeW(node: TreeNode): number {
  if (!node.children.length) return NW + HGAP
  return node.children.reduce((s, c) => s + subtreeW(c), 0)
}

function layout(roots: TreeNode[]): Positioned[] {
  const result: Positioned[] = []
  function place(node: TreeNode, x: number, y: number) {
    const sw = subtreeW(node)
    const cx = x + sw / 2
    result.push({ node, x: cx - NW / 2, y, cx, cy: y + NH / 2 })
    let childX = x
    node.children.forEach(child => { place(child, childX, y + NH + VGAP); childX += subtreeW(child) })
  }
  let startX = PAD
  roots.forEach(r => { place(r, startX, PAD); startX += subtreeW(r) })
  return result
}

function canvasSize(pos: Positioned[]) {
  if (!pos.length) return { w: 800, h: 400 }
  return { w: Math.max(...pos.map(p => p.x + NW)) + PAD, h: Math.max(...pos.map(p => p.y + NH)) + PAD }
}

// ─── Color palette ───

// סולם דורות "קלף וחותם": זהב חם → נחושת → ארד → יין → חום עתיק (זהה למסך הניהול).
const PALETTE = [
  { bg: 'linear-gradient(160deg,#e0b94a,#c69e2d)', ring: '#c69e2d', shadow: 'rgba(198,158,45,0.40)', light: '#FBF3DA', text: '#8a6a1e' },
  { bg: 'linear-gradient(160deg,#d3a344,#bf8b34)', ring: '#bf8b34', shadow: 'rgba(191,139,52,0.38)', light: '#FAEFD6', text: '#7d5a1f' },
  { bg: 'linear-gradient(160deg,#c68a4e,#b3703a)', ring: '#b3703a', shadow: 'rgba(179,112,58,0.38)', light: '#F6E9D8', text: '#7a4a26' },
  { bg: 'linear-gradient(160deg,#b56f4f,#a15a3d)', ring: '#a15a3d', shadow: 'rgba(161,90,61,0.38)',  light: '#F3E2D8', text: '#6f3a2a' },
  { bg: 'linear-gradient(160deg,#a15a58,#8c4a44)', ring: '#8c4a44', shadow: 'rgba(140,74,68,0.38)',  light: '#F0DEDC', text: '#5f3230' },
  { bg: 'linear-gradient(160deg,#867059,#6f5a44)', ring: '#6f5a44', shadow: 'rgba(111,90,68,0.38)',  light: '#EBE4D8', text: '#4d3f30' },
]
function pal(gen: number) { return PALETTE[gen % PALETTE.length] }

function collectEdges(positions: Positioned[]) {
  const byId = new Map(positions.map(p => [p.node.id, p]))
  return positions.flatMap(p =>
    p.node.children
      .map(c => { const cp = byId.get(c.id); return cp ? { from: p, to: cp } : null })
      .filter(Boolean) as { from: Positioned; to: Positioned }[]
  )
}

// ─── Modal helpers ───

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,7,40,0.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 20, padding: '24px 24px 20px', minWidth: 320, maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', direction: 'rtl' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1E1035' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: 4 }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ModalInput({ value, onChange, onEnter, placeholder = 'הכנס שם...' }: { value: string; onChange: (v: string) => void; onEnter: () => void; placeholder?: string }) {
  return (
    <input autoFocus value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => e.key === 'Enter' && onEnter()}
      placeholder={placeholder}
      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 14, fontFamily: 'inherit', direction: 'rtl', outline: 'none', boxSizing: 'border-box' }} />
  )
}

function ModalBtn({ label, color, icon, onClick, loading }: { label: string; color: string; icon: React.ReactNode; onClick: () => void; loading?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: color, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'inherit' }}>
      {icon} {label}
    </button>
  )
}

// ─── Page ───

export default function FamilyTreePage() {
  const [nodes, setNodes] = useState<LineageNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [generationFilter, setGenerationFilter] = useState<number | null>(null)
  const [zoom, setZoom] = useState(0.85)
  const [searchQuery, setSearchQuery] = useState('')
  const [modal, setModal] = useState<ModalState>(null)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const canvasRef = useRef<HTMLDivElement>(null)
  const didCenter = useRef(false)
  const dragRef = useRef<{ startX: number; startY: number; scrollX: number; scrollY: number } | null>(null)
  const draggedRef = useRef(false)
  const downBgRef = useRef(false)
  const zoomAnchor = useRef<{ px: number; py: number; offX: number; offY: number } | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/lineage?all=1')
      const d = await r.json()
      const raw = (d.nodes ?? []).filter((n: LineageNode) => (n.status ?? 'verified') === 'verified')
      const minGen = raw.length ? Math.min(...raw.map((n: LineageNode) => n.generation)) : 0
      setNodes(raw.map((n: LineageNode) => ({ ...n, generation: n.generation - minGen })))
    } catch { setError('שגיאה בטעינת הנתונים') }
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // clear selection when generation filter changes
  useEffect(() => { setSelected(null) }, [generationFilter])

  // passive wheel zoom toward cursor
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setZoom(prev => {
        const next = Math.min(2.5, Math.max(0.5, +(prev - e.deltaY * 0.0015).toFixed(3)))
        if (next === prev) return prev
        const rect = el.getBoundingClientRect()
        const offX = e.clientX - rect.left
        const offY = e.clientY - rect.top
        zoomAnchor.current = { px: (el.scrollLeft + offX) / prev, py: (el.scrollTop + offY) / prev, offX, offY }
        return next
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [loading])

  // correct scroll after zoom
  useLayoutEffect(() => {
    const el = canvasRef.current, a = zoomAnchor.current
    if (!el || !a) return
    el.scrollLeft = a.px * zoom - a.offX
    el.scrollTop = a.py * zoom - a.offY
    zoomAnchor.current = null
  }, [zoom])

  // drag-to-pan + click-on-background clears selection/filter
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      dragRef.current = { startX: e.clientX, startY: e.clientY, scrollX: el.scrollLeft, scrollY: el.scrollTop }
      draggedRef.current = false
      downBgRef.current = !(e.target as HTMLElement)?.closest?.('[data-ft-node]')
      el.style.cursor = 'grabbing'
    }
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        draggedRef.current = true
        e.preventDefault()
        el.scrollLeft = dragRef.current.scrollX - dx
        el.scrollTop = dragRef.current.scrollY - dy
      }
    }
    const onUp = () => {
      const wasDown = dragRef.current !== null
      const dragged = draggedRef.current
      const onBg = downBgRef.current
      dragRef.current = null
      el.style.cursor = 'grab'
      if (wasDown && !dragged && onBg) { setSelected(null); setGenerationFilter(null) }
    }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [loading])

  // center on load
  useEffect(() => {
    if (!positions.length || didCenter.current) return
    const el = canvasRef.current
    if (!el) return
    didCenter.current = true
    requestAnimationFrame(() => {
      if (!canvasRef.current) return
      const scrollTo = (w * zoom - canvasRef.current.clientWidth) / 2
      if (scrollTo > 0) canvasRef.current.scrollLeft = scrollTo
    })
  })

  const positions = useMemo(() => layout(buildTree(nodes)), [nodes])
  const edges = useMemo(() => collectEdges(positions), [positions])
  const { w, h } = useMemo(() => canvasSize(positions), [positions])
  const maxGen = useMemo(() => nodes.reduce((m, n) => Math.max(m, n.generation), 0), [nodes])
  const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])

  const pathBranch = useMemo(() => {
    const s = new Set<string>()
    if (!selected) return s
    const nodeMap = new Map(positions.map(p => [p.node.id, p.node]))
    let cur: TreeNode | undefined = nodeMap.get(selected)
    let guard = 0
    while (cur && guard < 60) { s.add(cur.id); cur = cur.parent_id ? nodeMap.get(cur.parent_id) : undefined; guard++ }
    return s
  }, [selected, positions])

  // יישור מסלול נבחר לטור אנכי ממורכז (שורש למעלה, הנבחר למטה) — כמו במסך הניהול.
  const alignedById = useMemo(() => {
    const m = new Map<string, { x: number; y: number; cx: number }>()
    if (!selected || pathBranch.size === 0) return m
    const chain = positions
      .filter(p => pathBranch.has(p.node.id))
      .sort((a, b) => a.node.generation - b.node.generation)
    const colCx = Math.max(w / 2, NW / 2 + PAD)
    chain.forEach((p, i) => {
      const y = PAD + i * (NH + VGAP)
      m.set(p.node.id, { x: colCx - NW / 2, y, cx: colCx })
    })
    return m
  }, [selected, pathBranch, positions, w])

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return nodes.filter(n => n.name.toLowerCase().includes(q)).slice(0, 8)
  }, [searchQuery, nodes])

  function scrollToNode(nodeId: string) {
    const pos = positions.find(p => p.node.id === nodeId)
    if (!pos || !canvasRef.current) return
    const el = canvasRef.current
    el.scrollTo({ left: Math.max(0, pos.cx * zoom - el.clientWidth / 2), top: Math.max(0, pos.y * zoom - el.clientHeight / 3), behavior: 'smooth' })
  }

  function selectAndGo(nodeId: string) {
    setSelected(nodeId)
    setSearchQuery('')
    setTimeout(() => scrollToNode(nodeId), 50)
  }

  function fitToScreen() {
    if (!canvasRef.current || !positions.length) return
    const el = canvasRef.current
    const newZoom = Math.min(1.5, Math.max(0.5, Math.min(el.clientWidth / (w + PAD * 2), el.clientHeight / (h + PAD * 2))))
    setZoom(newZoom)
    didCenter.current = false
  }

  const selectedPos = selected ? positions.find(p => p.node.id === selected) ?? null : null

  function openEdit(node: TreeNode) { setFormName(node.name); setSaveError(''); setModal({ type: 'edit', node }) }
  function openAdd(parentId: string | null, parentName: string) { setFormName(''); setSaveError(''); setModal({ type: 'add', parentId, parentName }) }
  function openDelete(node: TreeNode) { setSaveError(''); setModal({ type: 'delete', node }) }
  function closeModal() { setModal(null); setSaveError('') }

  async function handleSave() {
    if (!formName.trim()) { setSaveError('נא להזין שם'); return }
    setSaving(true); setSaveError('')
    try {
      if (modal?.type === 'edit') {
        const r = await fetch(`/api/lineage?id=${modal.node.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formName }) })
        const d = await r.json()
        if (d.error) { setSaveError(d.error); setSaving(false); return }
      } else if (modal?.type === 'add') {
        const r = await fetch('/api/lineage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formName, parent_id: modal.parentId }) })
        const d = await r.json()
        if (d.error) { setSaveError(d.error); setSaving(false); return }
      }
      await loadAll(); closeModal()
    } catch { setSaveError('שגיאה בשמירה') }
    setSaving(false)
  }

  async function handleDelete() {
    if (modal?.type !== 'delete') return
    setSaving(true); setSaveError('')
    try {
      const r = await fetch(`/api/lineage?id=${modal.node.id}`, { method: 'DELETE' })
      const d = await r.json()
      if (d.error) { setSaveError(d.error); setSaving(false); return }
      if (selected === modal.node.id) setSelected(null)
      await loadAll(); closeModal()
    } catch { setSaveError('שגיאה במחיקה') }
    setSaving(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F3F0F8', fontFamily: 'system-ui, -apple-system, Arial, sans-serif' }} dir="rtl">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <header style={{ background: '#fff', borderBottom: '1px solid #E8E0F5', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 2px 12px rgba(109,40,217,0.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(140deg,#7C3AED,#4C1D95)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(109,40,217,0.35)' }}>
            <GitBranch size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1E1035' }}>עץ הדורות</div>
            <div style={{ fontSize: 12, color: '#9D88BE', marginTop: 1 }}>{nodes.length} צמתים בשושלת</div>
          </div>
        </div>
        <button onClick={() => openAdd(null, 'שורש')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(140deg,#7C3AED,#4C1D95)', color: '#fff', border: 'none', borderRadius: 12, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(109,40,217,0.35)' }}>
          <Plus size={15} /> הוסף שורש
        </button>
      </header>

      {/* Toolbar: generation filters + search + zoom */}
      {!loading && nodes.length > 0 && (
        <div style={{ background: '#fff', borderBottom: '1px solid #EDE8F5', padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          {/* Generation chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#9D88BE', fontWeight: 600, marginLeft: 2 }}>דורות:</span>
            {Array.from({ length: maxGen + 1 }, (_, i) => i).map(g => (
              <button key={g} onClick={() => setGenerationFilter(f => f === g ? null : g)}
                style={{ padding: '3px 11px', borderRadius: 20, border: `2px solid ${generationFilter === g ? pal(g).ring : pal(g).ring + '44'}`, background: generationFilter === g ? pal(g).ring : pal(g).light, color: generationFilter === g ? '#fff' : pal(g).text, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all .15s' }}>
                דור {g + 1}
              </button>
            ))}
          </div>

          {/* Search + zoom controls */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Search */}
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 30, borderRadius: 8, border: '1px solid #E2E8F0', padding: '0 10px', background: '#fff' }}>
                <Search size={13} color="#94A3B8" />
                <input
                  type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="חיפוש שם..."
                  style={{ border: 'none', outline: 'none', fontSize: 12, color: '#334155', width: 130, direction: 'rtl', fontFamily: 'inherit', background: 'transparent' }}
                />
              </div>
              {searchResults.length > 0 && (
                <div style={{ position: 'absolute', top: 34, right: 0, minWidth: 220, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, overflow: 'hidden' }}>
                  {searchResults.map(n => {
                    const parent = n.parent_id ? nodeById.get(n.parent_id) : null
                    return (
                      <button key={n.id} onClick={() => selectAndGo(n.id)}
                        style={{ display: 'block', width: '100%', textAlign: 'right', padding: '7px 12px', border: 'none', borderBottom: '1px solid #F1F5F9', background: '#fff', cursor: 'pointer', direction: 'rtl', fontFamily: 'inherit' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{n.name}</div>
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>דור {n.generation + 1}{parent ? ` · ${parent.name}` : ''}</div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Clear selection */}
            {selected && (
              <button onClick={() => setSelected(null)} style={{ display: 'flex', alignItems: 'center', gap: 4, height: 28, borderRadius: 8, border: '1.5px solid #7C3AED44', background: '#F5F0FF', color: '#7C3AED', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '0 10px' }}>
                <X size={11} /> נקה בחירה
              </button>
            )}

            {/* Zoom */}
            <button onClick={fitToScreen} style={{ height: 28, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 11, cursor: 'pointer', padding: '0 8px', color: '#64748B', fontWeight: 600 }}>⊡ התאם</button>
            <button onClick={() => setZoom(z => Math.min(2.5, z + 0.1))} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C3AED', fontWeight: 700 }}>+</button>
            <button onClick={() => { setZoom(1); didCenter.current = false }} style={{ height: 28, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 11, cursor: 'pointer', padding: '0 8px', color: '#64748B', fontWeight: 600 }}>{Math.round(zoom * 100)}%</button>
            <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C3AED', fontWeight: 700 }}>−</button>
          </div>
        </div>
      )}

      {/* Canvas */}
      <main style={{ padding: 20 }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: '#7C3AED' }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 15, fontWeight: 600 }}>טוען עץ דורות…</span>
          </div>
        )}

        {error && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 12, padding: '12px 20px', fontSize: 14 }}>{error}</div>
          </div>
        )}

        {!loading && !error && nodes.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 340, gap: 16, color: '#B8A8D8' }}>
            <Users size={56} style={{ opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>אין צמתים בעץ עדיין</p>
            <button onClick={() => openAdd(null, 'שורש')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(140deg,#7C3AED,#4C1D95)', color: '#fff', border: 'none', borderRadius: 12, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={16} /> הוסף את הדור הראשון
            </button>
          </div>
        )}

        {!loading && !error && nodes.length > 0 && (
          <div
            ref={canvasRef}
            dir="ltr"
            style={{
              overflow: 'auto', overflowAnchor: 'none',
              borderRadius: 20,
              // רקע קלף עדין עם נקודות זהב דהויות — עקבי עם מסך הניהול
              background: 'linear-gradient(170deg,#fdfbf5 0%,#f6f1e4 100%)',
              border: '1px solid #e6ddc8',
              boxShadow: '0 4px 24px rgba(140,110,40,0.08)',
              backgroundImage: 'radial-gradient(circle, rgba(198,158,45,0.22) 1px, transparent 1px)',
              backgroundSize: '28px 28px', backgroundPosition: '14px 14px',
              height: 'calc(100vh - 220px)', minHeight: 400,
              cursor: 'grab',
            }}
          >
            <div style={{ position: 'relative', width: w * zoom, height: (h + 60) * zoom, minWidth: '100%' }}>

              {/* SVG edges */}
              <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} width={w * zoom} height={(h + 60) * zoom}>
                {edges.map((e, i) => {
                  // קצות הקו מהמיקום המיושר אם הצומת במסלול, אחרת המקורי
                  const fa = alignedById.get(e.from.node.id), ta = alignedById.get(e.to.node.id)
                  const x1 = (fa?.cx ?? e.from.cx) * zoom, y1 = ((fa?.y ?? e.from.y) + NH) * zoom
                  const x2 = (ta?.cx ?? e.to.cx) * zoom, y2 = (ta?.y ?? e.to.y) * zoom
                  const mid = (y1 + y2) / 2
                  const col = pal(e.from.node.generation).ring
                  // חיבור אורתוגונלי מסודר (יורד→אופקי→יורד, פינות מעוגלות) — זהה למסך הניהול
                  const r = Math.min(10 * zoom, Math.abs(x2 - x1) / 2, Math.abs(mid - y1))
                  const dir = x2 >= x1 ? 1 : -1
                  const d = Math.abs(x2 - x1) < 1
                    ? `M${x1},${y1} L${x2},${y2}`
                    : `M${x1},${y1} L${x1},${mid - r} Q${x1},${mid} ${x1 + dir * r},${mid} L${x2 - dir * r},${mid} Q${x2},${mid} ${x2},${mid + r} L${x2},${y2}`
                  const isPathEdge = selected && pathBranch.has(e.from.node.id) && pathBranch.has(e.to.node.id)
                  const dimEdge = selected && !isPathEdge
                  return (
                    <g key={i}>
                      <path d={d} fill="none" stroke="#fff" strokeWidth={isPathEdge ? 8 : 5} strokeLinecap="round" strokeLinejoin="round" opacity={dimEdge ? 0.1 : 0.9} />
                      <path d={d} fill="none" stroke={col} strokeWidth={isPathEdge ? 4 : 2.5} strokeLinecap="round" strokeLinejoin="round" opacity={dimEdge ? 0.08 : 0.85} />
                    </g>
                  )
                })}
              </svg>

              {/* Nodes */}
              {positions.map(pos => {
                const isSel = selected === pos.node.id
                const isDimmed = selected !== null
                  ? !pathBranch.has(pos.node.id)
                  : generationFilter !== null && pos.node.generation !== generationFilter
                const p = pal(pos.node.generation)
                const al = alignedById.get(pos.node.id)
                const rx = al?.x ?? pos.x, ry = al?.y ?? pos.y
                return (
                  <div
                    key={pos.node.id}
                    data-ft-node="1"
                    onClick={e => { e.stopPropagation(); setSelected(prev => prev === pos.node.id ? null : pos.node.id) }}
                    style={{
                      position: 'absolute', left: rx * zoom, top: ry * zoom,
                      width: NW * zoom, height: NH * zoom, borderRadius: 14 * zoom,
                      background: p.bg,
                      boxShadow: isSel
                        ? `0 0 0 3px #fff, 0 0 0 5.5px ${p.ring}, 0 12px 32px ${p.shadow}`
                        : `0 6px 22px ${p.shadow}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer',
                      transform: isSel ? 'scale(1.07) translateY(-2px)' : 'scale(1)',
                      // אנימציית מיקום רק כשיש יישור פעיל — אחרת הזום (שמשנה left/top) מקפץ
                      transition: selected
                        ? 'left .5s cubic-bezier(.4,0,.2,1), top .5s cubic-bezier(.4,0,.2,1), box-shadow .2s, transform .2s, opacity .2s'
                        : 'box-shadow .2s, transform .2s, opacity .2s',
                      opacity: isDimmed ? 0.2 : 1,
                      zIndex: isSel ? 20 : 2, userSelect: 'none',
                    }}>

                    {/* generation badge */}
                    <div style={{ position: 'absolute', top: -9 * zoom, right: 4 * zoom, background: '#fff', color: p.ring, fontSize: Math.max(8, 10 * zoom), fontWeight: 800, width: 20 * zoom, height: 20 * zoom, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 2px 6px ${p.shadow}`, border: `1.5px solid ${p.ring}` }}>
                      {pos.node.generation + 1}
                    </div>

                    {/* name */}
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: Math.max(9, (pos.node.name.length > 12 ? 11 : pos.node.name.length > 8 ? 13 : 14) * zoom), textAlign: 'center', direction: 'rtl', padding: `0 ${12 * zoom}px`, lineHeight: 1.35, textShadow: '0 1px 3px rgba(0,0,0,0.35)', maxWidth: (NW - 20) * zoom, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                      {pos.node.name}
                    </span>

                    {/* children chip */}
                    {pos.node.children.length > 0 && zoom >= 0.6 && (
                      <div style={{ position: 'absolute', bottom: -10 * zoom, left: 4 * zoom, background: '#fff', border: `1.5px solid ${p.ring}44`, color: p.ring, fontSize: Math.max(8, 9 * zoom), fontWeight: 800, padding: `${1 * zoom}px ${5 * zoom}px`, borderRadius: 20, boxShadow: `0 1px 4px ${p.shadow}`, direction: 'rtl' }}>
                        {pos.node.children.length} ילדים
                      </div>
                    )}

                    {/* action strip */}
                    {isSel && (
                      <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', bottom: -50, display: 'flex', gap: 6, background: '#fff', borderRadius: 22, padding: '6px 10px', boxShadow: '0 6px 20px rgba(0,0,0,0.14)', border: '1px solid #E2E8F0', zIndex: 30 }}>
                        {[
                          { icon: <Pencil size={12} />, color: p.ring, bg: p.light, fn: () => openEdit(pos.node), title: 'עריכה' },
                          { icon: <Plus size={13} />, color: '#059669', bg: '#ECFDF5', fn: () => openAdd(pos.node.id, pos.node.name), title: 'הוסף ילד' },
                          { icon: <Trash2 size={12} />, color: '#DC2626', bg: '#FEF2F2', fn: () => openDelete(pos.node), title: 'מחק' },
                        ].map((b, i) => (
                          <button key={i} onClick={b.fn} title={b.title} style={{ width: 30, height: 30, borderRadius: '50%', background: b.bg, color: b.color, border: `1.5px solid ${b.color}33`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{b.icon}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Selected info panel */}
        {selectedPos && (
          <div style={{ marginTop: 16, background: '#fff', borderRadius: 16, border: `2px solid ${pal(selectedPos.node.generation).ring}22`, padding: '16px 20px', boxShadow: `0 4px 20px ${pal(selectedPos.node.generation).shadow}`, borderTop: `4px solid ${pal(selectedPos.node.generation).ring}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4, fontWeight: 600 }}>צומת נבחר</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#1E1035' }}>{selectedPos.node.name}</div>
                <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>דור {selectedPos.node.generation + 1} · {selectedPos.node.children.length} ילדים ישירים</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { label: 'עריכה', icon: <Pencil size={13} />, color: pal(selectedPos.node.generation).ring, bg: pal(selectedPos.node.generation).light, fn: () => openEdit(selectedPos.node) },
                  { label: 'הוסף ילד', icon: <Plus size={13} />, color: '#16a34a', bg: '#F0FDF4', fn: () => openAdd(selectedPos.node.id, selectedPos.node.name) },
                  { label: 'מחיקה', icon: <Trash2 size={13} />, color: '#dc2626', bg: '#FEF2F2', fn: () => openDelete(selectedPos.node) },
                ].map(b => (
                  <button key={b.label} onClick={b.fn} style={{ display: 'flex', alignItems: 'center', gap: 5, background: b.bg, color: b.color, border: `1px solid ${b.color}22`, borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {b.icon} {b.label}
                  </button>
                ))}
              </div>
            </div>
            {selectedPos.node.children.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, marginBottom: 8 }}>ילדים:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {selectedPos.node.children.map(child => (
                    <button key={child.id} onClick={() => setSelected(child.id)} style={{ padding: '6px 14px', borderRadius: 20, border: 'none', background: pal(child.generation).bg, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', direction: 'rtl', boxShadow: `0 3px 10px ${pal(child.generation).shadow}` }}>
                      {child.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      {modal?.type === 'edit' && (
        <Modal title={`עריכת: ${modal.node.name}`} onClose={closeModal}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ModalInput value={formName} onChange={setFormName} onEnter={handleSave} />
            {saveError && <span style={{ color: '#dc2626', fontSize: 13 }}>{saveError}</span>}
            <div style={{ display: 'flex', gap: 8 }}><ModalBtn label="שמור" color="#7C3AED" icon={<Check size={14} />} onClick={handleSave} loading={saving} /><ModalBtn label="ביטול" color="#94A3B8" icon={<X size={14} />} onClick={closeModal} /></div>
          </div>
        </Modal>
      )}
      {modal?.type === 'add' && (
        <Modal title={modal.parentId ? `הוספת ילד ל: ${modal.parentName}` : 'הוספת שורש חדש'} onClose={closeModal}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ModalInput value={formName} onChange={setFormName} onEnter={handleSave} placeholder="הכנס שם..." />
            {saveError && <span style={{ color: '#dc2626', fontSize: 13 }}>{saveError}</span>}
            <div style={{ display: 'flex', gap: 8 }}><ModalBtn label="הוסף" color="#16a34a" icon={<Plus size={14} />} onClick={handleSave} loading={saving} /><ModalBtn label="ביטול" color="#94A3B8" icon={<X size={14} />} onClick={closeModal} /></div>
          </div>
        </Modal>
      )}
      {modal?.type === 'delete' && (
        <Modal title="מחיקת צומת" onClose={closeModal}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.6 }}>האם למחוק את <strong>{modal.node.name}</strong>?</p>
            {(modal.node.children?.length ?? 0) > 0 && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400E' }}>
                שים לב: לצומת זה {modal.node.children.length} ילדים — הם לא יימחקו אבל יאבדו את ההורה.
              </div>
            )}
            {saveError && <span style={{ color: '#dc2626', fontSize: 13 }}>{saveError}</span>}
            <div style={{ display: 'flex', gap: 8 }}><ModalBtn label="מחק" color="#dc2626" icon={<Trash2 size={14} />} onClick={handleDelete} loading={saving} /><ModalBtn label="ביטול" color="#94A3B8" icon={<X size={14} />} onClick={closeModal} /></div>
          </div>
        </Modal>
      )}
    </div>
  )
}
