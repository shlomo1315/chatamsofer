'use client'
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { Plus, RefreshCw, Loader2, ChevronRight, ChevronDown, Pencil, Trash2, X, Users, Check } from 'lucide-react'

// ─── Types ───

interface LineageNode {
  id: string
  name: string
  generation: number
  parent_id: string | null
  status?: 'verified' | 'pending' | 'rejected'
  relation?: 'son' | 'son_in_law' | null
}

type StatusFilter = 'verified' | 'pending' | 'rejected' | null

function nextStatus(cur: LineageNode['status']): 'verified' | 'pending' | 'rejected' {
  if (cur === 'verified') return 'pending'
  if (cur === 'pending') return 'rejected'
  return 'verified'
}

function statusColor(s: LineageNode['status']) {
  if (s === 'verified') return '#22C55E'
  if (s === 'rejected') return '#EF4444'
  return '#F59E0B'
}

interface TreeNode extends LineageNode {
  children: TreeNode[]
}

interface Positioned {
  node: TreeNode
  x: number; y: number; cx: number; cy: number
}

// ─── Tree layout ───

const NW = 172, NH = 58, HGAP = 48, VGAP = 96, PAD = 72

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
  { bg: 'linear-gradient(135deg,#7C3AED 0%,#5B21B6 100%)', ring: '#7C3AED', shadow: 'rgba(124,58,237,0.38)', light: '#F5F0FF', text: '#5B21B6' },
  { bg: 'linear-gradient(135deg,#2563EB 0%,#1E40AF 100%)', ring: '#2563EB', shadow: 'rgba(37,99,235,0.32)',  light: '#EFF6FF', text: '#1E40AF' },
  { bg: 'linear-gradient(135deg,#0891B2 0%,#0E7490 100%)', ring: '#0891B2', shadow: 'rgba(8,145,178,0.32)',  light: '#ECFEFF', text: '#0E7490' },
  { bg: 'linear-gradient(135deg,#059669 0%,#047857 100%)', ring: '#059669', shadow: 'rgba(5,150,105,0.32)',  light: '#ECFDF5', text: '#047857' },
  { bg: 'linear-gradient(135deg,#D97706 0%,#B45309 100%)', ring: '#D97706', shadow: 'rgba(217,119,6,0.32)',  light: '#FFFBEB', text: '#B45309' },
  { bg: 'linear-gradient(135deg,#DB2777 0%,#BE185D 100%)', ring: '#DB2777', shadow: 'rgba(219,39,119,0.32)', light: '#FDF2F8', text: '#BE185D' },
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,5,25,0.55)', backdropFilter: 'blur(6px)', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 22, width: '100%', maxWidth: 400, boxShadow: '0 32px 72px rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.8)' }} dir="rtl" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 16px', borderBottom: '1px solid #F1F5F9' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0F172A' }}>{title}</h2>
          <button onClick={onClose} style={{ background: '#F1F5F9', border: 'none', cursor: 'pointer', color: '#64748B', width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={15} /></button>
        </div>
        <div style={{ padding: '18px 22px 22px' }}>{children}</div>
      </div>
    </div>
  )
}

function MBtn({ label, color, onClick, loading }: { label: string; color: string; onClick: () => void; loading?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, background: color, color: '#fff', border: 'none', borderRadius: 11, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.65 : 1, fontFamily: 'inherit', transition: 'opacity .15s' }}>
      {loading && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
      {label}
    </button>
  )
}

// בורר קשר בן/חתן של הצומת ביחס להורה שלו (לשורש אין קשר)
function RelationPicker({ value, onChange }: { value: 'son' | 'son_in_law' | null; onChange: (v: 'son' | 'son_in_law' | null) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>קשר להורה (הדור הקודם)</label>
      <div style={{ display: 'flex', gap: 8 }}>
        {([['son', 'בן', '#DBEAFE', '#1E40AF', '#93C5FD'], ['son_in_law', 'חתן', '#FEF3C7', '#92400E', '#FCD34D']] as const).map(([v, l, bg, fg, br]) => (
          <button key={v} type="button" onClick={() => onChange(value === v ? null : v)}
            style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: `1.5px solid ${value === v ? br : '#E2E8F0'}`, background: value === v ? bg : '#fff', color: value === v ? fg : '#94A3B8', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Tree view ───

function TreeView({ nodes, onRefresh, onStatusChange, onClearFilters, statusFilter, generationFilter }: { nodes: LineageNode[]; onRefresh: () => void; onStatusChange: (id: string, status: 'verified' | 'pending' | 'rejected') => void; onClearFilters: () => void; statusFilter: StatusFilter; generationFilter: number | null }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [formName, setFormName] = useState('')
  const [formRelation, setFormRelation] = useState<'son' | 'son_in_law' | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const [zoom, setZoom] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const didCenter = useRef(false)
  const dragRef = useRef<{ startX: number; startY: number; scrollX: number; scrollY: number } | null>(null)
  const draggedRef = useRef(false)
  const downBgRef = useRef(false)
  const zoomAnchor = useRef<{ px: number; py: number; offX: number; offY: number } | null>(null)

  // clear node-path selection whenever a top filter changes, so the filter takes over
  useEffect(() => { setSelected(null) }, [statusFilter, generationFilter])

  const positions = useMemo(() => layoutTree(buildTree(nodes)), [nodes])
  const edges = useMemo(() => collectEdges(positions), [positions])
  const { w, h } = useMemo(() => canvasSize(positions), [positions])

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
        zoomAnchor.current = {
          px: (el.scrollLeft + offX) / prev,
          py: (el.scrollTop + offY) / prev,
          offX, offY,
        }
        return next
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [nodes.length])

  useLayoutEffect(() => {
    const el = canvasRef.current
    const a = zoomAnchor.current
    if (!el || !a) return
    el.scrollLeft = a.px * zoom - a.offX
    el.scrollTop = a.py * zoom - a.offY
    zoomAnchor.current = null
  }, [zoom])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      dragRef.current = { startX: e.clientX, startY: e.clientY, scrollX: el.scrollLeft, scrollY: el.scrollTop }
      draggedRef.current = false
      // did the press start on empty canvas (not on a node)?
      downBgRef.current = !(e.target as HTMLElement)?.closest?.('[data-lin-node]')
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
        el.scrollTop  = dragRef.current.scrollY - dy
      }
    }
    const onUp = () => {
      const wasDown = dragRef.current !== null
      const dragged = draggedRef.current
      const onBg = downBgRef.current
      dragRef.current = null
      el.style.cursor = 'grab'
      // plain click on empty canvas → clear node selection and any active filter
      if (wasDown && !dragged && onBg) { setSelected(null); onClearFilters() }
    }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [nodes.length])

  useEffect(() => {
    if (!positions.length || didCenter.current) return
    const el = canvasRef.current
    if (!el) return
    didCenter.current = true
    requestAnimationFrame(() => {
      if (!canvasRef.current) return
      const c = canvasRef.current
      const scrollTo = (w * zoom - c.clientWidth) / 2
      if (scrollTo > 0) c.scrollLeft = scrollTo
    })
  }, [positions.length, w, zoom])

  function close() { setModal(null); setSaveErr(''); setFormRelation(null) }

  async function handleSave() {
    if (!formName.trim()) { setSaveErr('נא להזין שם'); return }
    setSaving(true); setSaveErr('')
    try {
      if (modal?.type === 'edit') {
        await fetch('/api/admin/lineage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: modal.node.id, name: formName, relation: formRelation }) })
      } else if (modal?.type === 'add') {
        await fetch('/api/admin/lineage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formName, parent_id: modal.parentId, relation: formRelation }) })
      }
      onRefresh(); close()
    } catch { setSaveErr('שגיאה בשמירה') }
    setSaving(false)
  }

  async function handleDelete() {
    if (modal?.type !== 'delete') return
    setSaving(true)
    try {
      await fetch(`/api/admin/lineage?id=${modal.node.id}`, { method: 'DELETE' })
      if (selected === modal.node.id) setSelected(null)
      onRefresh(); close()
    } catch { setSaveErr('שגיאה במחיקה') }
    setSaving(false)
  }

  async function patchStatus(node: LineageNode, status: 'verified' | 'pending' | 'rejected') {
    onStatusChange(node.id, status)
    const res = await fetch('/api/admin/lineage', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: node.id, status }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      onStatusChange(node.id, node.status ?? 'pending')
      alert(`שגיאה בשמירה: ${res.status} — ${err.error ?? 'שגיאה לא ידועה'}`)
      return
    }
    onRefresh()
  }

  async function handleToggleStatus(node: LineageNode) {
    await patchStatus(node, nextStatus(node.status))
  }

  async function handleSetStatus(node: LineageNode, status: 'verified' | 'pending' | 'rejected') {
    await patchStatus(node, status)
  }

  const selPos = selected ? positions.find(p => p.node.id === selected) ?? null : null

  const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.trim().toLowerCase()
    return nodes.filter(n => n.name.toLowerCase().includes(q)).slice(0, 8)
  }, [searchQuery, nodes])

  function scrollToNode(nodeId: string) {
    const pos = positions.find(p => p.node.id === nodeId)
    if (!pos || !canvasRef.current) return
    const el = canvasRef.current
    const targetX = pos.cx * zoom - el.clientWidth / 2
    const targetY = pos.y * zoom - el.clientHeight / 3
    el.scrollTo({ left: Math.max(0, targetX), top: Math.max(0, targetY), behavior: 'smooth' })
  }

  function selectAndGo(nodeId: string) {
    setSelected(nodeId)
    setSearchQuery('')
    setShowSearch(false)
    setTimeout(() => scrollToNode(nodeId), 50)
  }

  function fitToScreen() {
    if (!canvasRef.current || !positions.length) return
    const el = canvasRef.current
    const newZoom = Math.min(1.5, Math.max(0.5, Math.min(el.clientWidth / (w + PAD * 2), el.clientHeight / (h + PAD * 2))))
    setZoom(newZoom)
    didCenter.current = false
  }

  const pathBranch = useMemo(() => {
    const s = new Set<string>()
    if (!selected) return s
    const nodeMap = new Map(positions.map(p => [p.node.id, p.node]))
    let cur: TreeNode | undefined = nodeMap.get(selected)
    let guard = 0
    while (cur && guard < 60) { s.add(cur.id); cur = cur.parent_id ? nodeMap.get(cur.parent_id) : undefined; guard++ }
    return s
  }, [selected, positions])

  if (!nodes.length) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 320, gap: 18, color: '#94A3B8' }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg,#F5F0FF,#EFF6FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #C4B5FD' }}>
        <Users size={30} style={{ color: '#7C3AED', opacity: 0.5 }} />
      </div>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#64748B' }}>אין צמתים בעץ עדיין</p>
      <button onClick={() => { setFormName(''); setModal({ type: 'add', parentId: null, parentName: '' }) }} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'linear-gradient(135deg,#7C3AED,#5B21B6)', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(124,58,237,0.4)' }}>
        <Plus size={16} /> הוסף שורש ראשון
      </button>
    </div>
  )

  return (
    <>
      {/* search + zoom controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
        {/* search box */}
        <div style={{ position: 'relative', flex: 1, maxWidth: 260 }}>
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setShowSearch(true) }}
            onFocus={() => setShowSearch(true)}
            onBlur={() => setTimeout(() => setShowSearch(false), 150)}
            placeholder="🔍 חיפוש שם..."
            dir="rtl"
            style={{ width: '100%', height: 28, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 12, padding: '0 10px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
          {showSearch && searchResults.length > 0 && (
            <div style={{ position: 'absolute', top: 32, right: 0, left: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, maxHeight: 260, overflowY: 'auto' }}>
              {searchResults.map(n => {
                const parent = n.parent_id ? nodeById.get(n.parent_id) : null
                return (
                  <div key={n.id} onMouseDown={() => selectAndGo(n.id)}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9', direction: 'rtl' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F5F0FF')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{n.name}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                      דור {n.generation}{parent ? ` · ${parent.name}` : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {selected && (
            <button onClick={() => setSelected(null)} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 28, borderRadius: 8, border: '1.5px solid #7C3AED44', background: '#F5F0FF', color: '#7C3AED', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '0 10px' }}>
              <X size={12} /> נקה בחירה
            </button>
          )}
          <button onClick={fitToScreen} style={{ height: 28, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 11, cursor: 'pointer', padding: '0 8px', color: '#64748B', fontWeight: 600 }}>⊡ התאם</button>
          <button onClick={() => setZoom(z => Math.min(2.5, z + 0.1))} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C3AED', fontWeight: 700 }}>+</button>
          <button onClick={() => { setZoom(1); didCenter.current = false }} style={{ height: 28, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 11, cursor: 'pointer', padding: '0 8px', color: '#64748B', fontWeight: 600 }}>{Math.round(zoom * 100)}%</button>
          <button onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C3AED', fontWeight: 700 }}>−</button>
        </div>
      </div>

      {/* canvas */}
      <div
        ref={canvasRef}
        dir="ltr"
        style={{
          overflow: 'auto',
          overflowAnchor: 'none',
          borderRadius: 18,
          background: 'linear-gradient(180deg,#FCFCFF 0%,#F7F5FF 100%)',
          border: '1.5px solid #E8E0F5',
          boxShadow: '0 4px 32px rgba(109,40,217,0.07)',
          height: 'calc(100vh - 260px)',
          minHeight: 400,
          cursor: 'grab',
        }}
      >
        <div style={{ position: 'relative', width: w * zoom, height: (h + 60) * zoom, minWidth: '100%' }}>
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} width={w * zoom} height={(h + 60) * zoom}>
            {edges.map((e, i) => {
              const x1 = e.from.cx * zoom, y1 = (e.from.y + NH) * zoom, x2 = e.to.cx * zoom, y2 = e.to.y * zoom
              const mid = (y1 + y2) / 2
              const col = pal(e.from.node.generation).ring
              const d = `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`
              const isPathEdge = selected && pathBranch.has(e.from.node.id) && pathBranch.has(e.to.node.id)
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke="#fff" strokeWidth={isPathEdge ? 8 : 5} strokeLinecap="round" opacity={selected && !isPathEdge ? 0.1 : 0.9} />
                  <path d={d} fill="none" stroke={col} strokeWidth={isPathEdge ? 4 : 2.5} strokeLinecap="round" opacity={selected && !isPathEdge ? 0.08 : 0.85} />
                </g>
              )
            })}
          </svg>

          {positions.map(pos => {
            const nodeStatus = pos.node.status ?? 'verified'
            const genPal = pal(pos.node.generation)
            // הבדל עדין מאוד בתוך צבע הדור: בן = מעט בהיר יותר · חתן = מעט כהה יותר
            const relOverlay = pos.node.relation === 'son'
              ? 'linear-gradient(rgba(255,255,255,0.42),rgba(255,255,255,0.42)), '
              : pos.node.relation === 'son_in_law'
                ? 'linear-gradient(rgba(15,23,42,0.34),rgba(15,23,42,0.34)), '
                : ''
            const isSel = selected === pos.node.id
            const isDimmed = selected !== null
              ? !pathBranch.has(pos.node.id)
              : (statusFilter !== null && nodeStatus !== statusFilter) || (generationFilter !== null && pos.node.generation !== generationFilter)
            const p = nodeStatus === 'verified' ? genPal
              : nodeStatus === 'rejected'
                ? { bg: 'linear-gradient(135deg,#EF4444 0%,#DC2626 100%)', ring: '#DC2626', shadow: 'rgba(220,38,38,0.4)', light: '#FEF2F2', text: '#991B1B' }
                : { bg: 'linear-gradient(135deg,#FB923C 0%,#EA580C 100%)', ring: '#EA580C', shadow: 'rgba(234,88,12,0.4)', light: '#FFF7ED', text: '#9A3412' }
            return (
              <div
                key={pos.node.id}
                data-lin-node="1"
                onClick={e => { e.stopPropagation(); setSelected(prev => prev === pos.node.id ? null : pos.node.id) }}
                style={{
                  position: 'absolute', left: pos.x * zoom, top: pos.y * zoom,
                  width: NW * zoom, height: NH * zoom, borderRadius: 16 * zoom,
                  background: relOverlay + p.bg,
                  boxShadow: isSel
                    ? `0 0 0 3px #fff, 0 0 0 5.5px ${p.ring}, 0 12px 32px ${p.shadow}`
                    : `0 4px 18px ${p.shadow}`,
                  border: nodeStatus === 'verified' ? 'none' : `${Math.max(2, 2.5 * zoom)}px dashed #fff`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  transform: isSel ? 'scale(1.07) translateY(-2px)' : 'scale(1)',
                  transition: 'box-shadow .2s, transform .2s, opacity .2s',
                  opacity: isDimmed ? 0.25 : 1,
                  zIndex: isSel ? 20 : 2, userSelect: 'none',
                }}>

                {/* generation badge */}
                <div style={{
                  position: 'absolute', top: -10 * zoom, right: 6 * zoom,
                  background: '#fff', color: p.ring,
                  fontSize: Math.max(8, 10 * zoom), fontWeight: 900,
                  width: 22 * zoom, height: 22 * zoom, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 2px 8px ${p.shadow}`,
                  border: `2px solid ${p.ring}`,
                }}>{pos.node.generation}</div>

                {/* status indicator dot */}
                <div
                  onClick={e => { e.stopPropagation(); handleToggleStatus(pos.node) }}
                  title={nodeStatus === 'verified' ? 'מאומת → לחץ לממתין' : nodeStatus === 'pending' ? 'ממתין → לחץ ללא מאושר' : 'לא מאושר → לחץ לאימות'}
                  style={{
                    position: 'absolute', top: -10 * zoom, left: 6 * zoom,
                    width: 20 * zoom, height: 20 * zoom, borderRadius: '50%',
                    background: statusColor(nodeStatus),
                    border: `2px solid #fff`,
                    boxShadow: `0 1px 5px rgba(0,0,0,0.3)`,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 25, fontSize: Math.max(8, 11 * zoom), fontWeight: 900, color: '#fff',
                  }}>
                  {zoom >= 0.5 && (nodeStatus === 'verified'
                    ? <Check size={10 * zoom} color="#fff" strokeWidth={3} />
                    : <span style={{ fontSize: Math.max(7, 9 * zoom) }}>{nodeStatus === 'rejected' ? '✗' : '⏳'}</span>
                  )}
                </div>

                {/* name */}
                <span style={{
                  color: '#fff', fontWeight: 700,
                  fontSize: Math.max(9, (pos.node.name.length > 14 ? 11 : pos.node.name.length > 10 ? 13 : 14) * zoom),
                  textAlign: 'center', direction: 'rtl',
                  padding: `0 ${14 * zoom}px`, lineHeight: 1.35,
                  textShadow: '0 1px 4px rgba(0,0,0,0.3)',
                  maxWidth: (NW - 16) * zoom,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical' as const,
                }}>{pos.node.name}</span>

                {/* children count chip */}
                {pos.node.children.length > 0 && zoom >= 0.6 && (
                  <div style={{
                    position: 'absolute', bottom: -11 * zoom, left: 6 * zoom,
                    background: '#fff',
                    border: `1.5px solid ${p.ring}44`,
                    color: p.ring, fontSize: Math.max(8, 9 * zoom), fontWeight: 800,
                    padding: `${1 * zoom}px ${6 * zoom}px`, borderRadius: 20,
                    boxShadow: `0 1px 4px ${p.shadow}`, direction: 'rtl',
                  }}>{pos.node.children.length} ילדים</div>
                )}

                {/* בן/חתן badge — קשר הצומת להורה (מקור אחד: lineage_nodes.relation) */}
                {pos.node.relation && zoom >= 0.5 && (
                  <div style={{
                    position: 'absolute', bottom: -11 * zoom, right: 6 * zoom,
                    background: pos.node.relation === 'son' ? '#DBEAFE' : '#FEF3C7',
                    color: pos.node.relation === 'son' ? '#1E40AF' : '#92400E',
                    fontSize: Math.max(8, 9 * zoom), fontWeight: 800,
                    padding: `${1 * zoom}px ${8 * zoom}px`, borderRadius: 20,
                    boxShadow: `0 1px 4px rgba(0,0,0,0.12)`, direction: 'rtl',
                    border: `1.5px solid ${pos.node.relation === 'son' ? '#93C5FD' : '#FCD34D'}`,
                  }}>{pos.node.relation === 'son' ? 'בן' : 'חתן'}</div>
                )}

                {/* actions strip */}
                {isSel && (
                  <div onClick={e => e.stopPropagation()} style={{
                    position: 'absolute', bottom: -54,
                    display: 'flex', gap: 6,
                    background: '#fff', borderRadius: 22,
                    padding: '6px 10px',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.14)',
                    border: '1px solid #E2E8F0', zIndex: 30,
                  }}>
                    {[
                      { icon: <Pencil size={12} />, color: p.ring, bg: p.light, fn: () => { setFormName(pos.node.name); setFormRelation(pos.node.relation ?? null); setModal({ type: 'edit', node: pos.node }) }, title: 'ערוך' },
                      { icon: <Plus size={13} />, color: '#059669', bg: '#ECFDF5', fn: () => { setFormName(''); setModal({ type: 'add', parentId: pos.node.id, parentName: pos.node.name }) }, title: 'הוסף ילד' },
                      ...(nodeStatus !== 'verified' ? [{ icon: <Check size={12} />, color: '#16A34A', bg: '#F0FDF4', fn: () => handleSetStatus(pos.node, 'verified' as const), title: 'אמת' }] : []),
                      ...(nodeStatus !== 'rejected' ? [{ icon: <X size={12} />, color: '#DC2626', bg: '#FEF2F2', fn: () => handleSetStatus(pos.node, 'rejected' as const), title: 'דחה' }] : []),
                      { icon: <Trash2 size={12} />, color: '#64748B', bg: '#F1F5F9', fn: () => setModal({ type: 'delete', node: pos.node }), title: 'מחק' },
                    ].map((b, i) => (
                      <button key={i} onClick={b.fn} title={(b as {title?: string}).title} style={{ width: 30, height: 30, borderRadius: '50%', background: b.bg, color: b.color, border: `1.5px solid ${b.color}33`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .1s' }}>{b.icon}</button>
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
        <div style={{ marginTop: 16, background: '#fff', borderRadius: 16, border: `2px solid ${pal(selPos.node.generation).ring}22`, padding: '16px 20px', boxShadow: `0 4px 24px ${pal(selPos.node.generation).shadow}`, direction: 'rtl', borderTop: `4px solid ${pal(selPos.node.generation).ring}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>צומת נבחר</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>{selPos.node.name}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ background: pal(selPos.node.generation).light, color: pal(selPos.node.generation).text, padding: '2px 10px', borderRadius: 20, fontWeight: 700 }}>דור {selPos.node.generation}</span>
                <span>{selPos.node.children.length} ילדים</span>
                <span style={{ padding: '2px 10px', borderRadius: 20, fontWeight: 700,
                  background: (selPos.node.status ?? 'verified') === 'verified' ? '#DCFCE7' : (selPos.node.status === 'rejected' ? '#FEE2E2' : '#FEF3C7'),
                  color: (selPos.node.status ?? 'verified') === 'verified' ? '#166534' : (selPos.node.status === 'rejected' ? '#991B1B' : '#92400E') }}>
                  {(selPos.node.status ?? 'verified') === 'verified' ? '✓ מאומת' : (selPos.node.status === 'rejected' ? '✗ לא מאושר' : '⏳ ממתין')}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'עריכה', fn: () => { setFormName(selPos.node.name); setFormRelation(selPos.node.relation ?? null); setModal({ type: 'edit', node: selPos.node }) }, color: pal(selPos.node.generation).ring, bg: pal(selPos.node.generation).light },
                { label: 'הוסף ילד', fn: () => { setFormName(''); setModal({ type: 'add', parentId: selPos.node.id, parentName: selPos.node.name }) }, color: '#059669', bg: '#ECFDF5' },
                ...((selPos.node.status ?? 'verified') !== 'verified' ? [{ label: '✓ אמת', fn: () => handleSetStatus(selPos.node, 'verified' as const), color: '#16A34A', bg: '#F0FDF4' }] : []),
                ...((selPos.node.status ?? 'verified') !== 'rejected' ? [{ label: '✗ דחה', fn: () => handleSetStatus(selPos.node, 'rejected' as const), color: '#DC2626', bg: '#FEF2F2' }] : []),
                { label: 'מחיקה', fn: () => setModal({ type: 'delete', node: selPos.node }), color: '#64748B', bg: '#F1F5F9' },
              ].map(b => (
                <button key={b.label} onClick={b.fn} style={{ background: b.bg, color: b.color, border: `1.5px solid ${b.color}22`, borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity .15s' }}>{b.label}</button>
              ))}
            </div>
          </div>
          {selPos.node.children.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, marginBottom: 7, letterSpacing: '0.05em' }}>ילדים:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selPos.node.children.map(c => (
                  <button key={c.id} onClick={() => setSelected(c.id)} style={{ padding: '5px 14px', borderRadius: 20, border: 'none', background: pal(c.generation).bg, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', direction: 'rtl', boxShadow: `0 2px 8px ${pal(c.generation).shadow}`, transition: 'opacity .15s' }}>{c.name}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* modals */}
      {modal?.type === 'edit' && (
        <Modal title={`עריכת: ${modal.node.name}`} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} style={{ border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit', background: '#FAFBFF' }} />
            {modal.node.parent_id && <RelationPicker value={formRelation} onChange={setFormRelation} />}
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
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
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="הכנס שם..." style={{ border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit', background: '#FAFBFF' }} />
            {modal.parentId && <RelationPicker value={formRelation} onChange={setFormRelation} />}
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="הוסף" color="#059669" onClick={handleSave} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'delete' && (
        <Modal title="מחיקת צומת" onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.6 }}>האם למחוק את <strong style={{ color: '#0F172A' }}>{modal.node.name}</strong>?</p>
            {(modal.node.children?.length ?? 0) > 0 && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 11, padding: '11px 14px', fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
                שים לב: {modal.node.children.length} ילדים יאבדו את הקישור להורה זה.
              </div>
            )}
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="מחק" color="#DC2626" onClick={handleDelete} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ─── Table view ───

function TableView({ nodes, onRefresh, onAdd, onEdit, onDelete, statusFilter, generationFilter }: {
  nodes: LineageNode[]
  onRefresh: () => void
  onAdd: (parentId: string | null, parentName: string) => void
  onEdit: (node: LineageNode) => void
  onDelete: (node: LineageNode) => void
  statusFilter: StatusFilter
  generationFilter: number | null
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const roots = useMemo(() => buildTree(nodes), [nodes])
  const childCount = useMemo(() => {
    const map = new Map<string, number>()
    nodes.forEach(n => { if (n.parent_id) map.set(n.parent_id, (map.get(n.parent_id) ?? 0) + 1) })
    return map
  }, [nodes])

  async function handleToggleStatus(node: LineageNode) {
    const newStatus = nextStatus(node.status)
    await fetch('/api/admin/lineage', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: node.id, status: newStatus }),
    })
    onRefresh()
  }

  function toggle(id: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function renderRows(node: TreeNode, depth: number): React.ReactNode {
    const nodeStatus = node.status ?? 'verified'
    const isDimmed = (statusFilter !== null && nodeStatus !== statusFilter)
      || (generationFilter !== null && node.generation !== generationFilter)
    const p = pal(node.generation)
    const hasChildren = node.children.length > 0
    const isExpanded = expanded.has(node.id)
    return (
      <div key={node.id}>
        <div
          style={{ display: 'flex', alignItems: 'center', padding: '10px 18px', borderBottom: '1px solid #F1F5F9', direction: 'rtl', gap: 8, background: '#fff', transition: 'background .12s, opacity .2s', minWidth: 0, opacity: isDimmed ? 0.25 : 1 }}
          onMouseEnter={e => (e.currentTarget.style.background = '#FAFAFE')}
          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
          <div style={{ width: depth * 22, flexShrink: 0 }} />
          <button onClick={() => toggle(node.id)} style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hasChildren ? p.light : 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default', color: p.ring, flexShrink: 0, borderRadius: 6 }}>
            {hasChildren ? (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span style={{ width: 13 }} />}
          </button>
          {/* status dot */}
          <button
            onClick={() => handleToggleStatus(node)}
            title={nodeStatus === 'verified' ? 'מאומת → ממתין' : nodeStatus === 'pending' ? 'ממתין → לא מאושר' : 'לא מאושר → אמת'}
            style={{ width: 14, height: 14, borderRadius: '50%', background: statusColor(nodeStatus), border: 'none', cursor: 'pointer', flexShrink: 0,
              boxShadow: nodeStatus === 'verified' ? '0 0 0 3px #DCFCE7' : nodeStatus === 'rejected' ? '0 0 0 3px #FEE2E2' : '0 0 0 3px #FEF3C7' }}
          />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{node.name}</span>
          <div style={{ padding: '3px 10px', borderRadius: 20, background: p.light, color: p.text, fontSize: 11, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>דור {node.generation}</div>
          <div style={{ minWidth: 56, textAlign: 'center', fontSize: 12, color: '#94A3B8', flexShrink: 0 }}>
            {childCount.get(node.id) ? `${childCount.get(node.id)}` : '—'}
          </div>
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
            <button onClick={() => onAdd(node.id, node.name)} title="הוסף ילד" style={{ width: 28, height: 28, borderRadius: 7, background: '#ECFDF5', border: '1.5px solid #BBF7D0', color: '#059669', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={12} /></button>
            <button onClick={() => onEdit(node)} title="עריכה" style={{ width: 28, height: 28, borderRadius: 7, background: p.light, border: `1.5px solid ${p.ring}33`, color: p.ring, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={11} /></button>
            <button onClick={() => onDelete(node)} title="מחיקה" style={{ width: 28, height: 28, borderRadius: 7, background: '#FEF2F2', border: '1.5px solid #FECACA', color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={11} /></button>
          </div>
        </div>
        {isExpanded && node.children.map(c => renderRows(c, depth + 1))}
      </div>
    )
  }

  return (
    <div style={{ borderRadius: 18, border: '1.5px solid #E8E0F5', overflow: 'hidden', background: '#fff', boxShadow: '0 4px 24px rgba(109,40,217,0.06)', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 18px', background: 'linear-gradient(135deg,#F8F6FF,#F0EDFF)', borderBottom: '1px solid #E8E0F5', direction: 'rtl', gap: 8 }}>
        <div style={{ width: 22, flexShrink: 0 }} />
        <div style={{ width: 14, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 800, color: '#7C3AED', letterSpacing: '0.04em', minWidth: 0 }}>שם</span>
        <span style={{ width: 80, textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#7C3AED', flexShrink: 0 }}>דור</span>
        <span style={{ minWidth: 56, textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#7C3AED', flexShrink: 0 }}>ילדים</span>
        <span style={{ width: 96, flexShrink: 0 }} />
      </div>
      {roots.length === 0
        ? <div style={{ padding: 48, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>אין נתונים</div>
        : roots.map(r => renderRows(r, 0))
      }
    </div>
  )
}

// ─── Main page ───

type View = 'tree' | 'table'

export default function LineagePage() {
  const [nodes, setNodes] = useState<LineageNode[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('tree')
  const [modal, setModal] = useState<ModalState>(null)
  const [formName, setFormName] = useState('')
  const [formRelation, setFormRelation] = useState<'son' | 'son_in_law' | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const [formParentId, setFormParentId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null)
  const [generationFilter, setGenerationFilter] = useState<number | null>(null)

  function close() { setModal(null); setSaveErr(''); setFormParentId(null); setFormRelation(null) }

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/lineage', { cache: 'no-store' })
      const raw: LineageNode[] = (await r.json()).nodes ?? []
      const minGen = raw.length ? Math.min(...raw.map(n => n.generation)) : 0
      // החתם סופר (הדור הנמוך ביותר) תמיד דור 1, וממשיך משם
      setNodes(raw.map(n => ({ ...n, generation: n.generation - minGen + 1 })))
    } catch {}
    setLoading(false)
  }, [])

  const softRefresh = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/lineage', { cache: 'no-store' })
      const raw: LineageNode[] = (await r.json()).nodes ?? []
      const minGen = raw.length ? Math.min(...raw.map(n => n.generation)) : 0
      setNodes(raw.map(n => ({ ...n, generation: n.generation - minGen + 1 })))
    } catch {}
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const maxGen = nodes.length ? Math.max(...nodes.map(n => n.generation)) : 0
  const genCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    nodes.forEach(n => { counts[n.generation] = (counts[n.generation] ?? 0) + 1 })
    return counts
  }, [nodes])

  const verifiedCount = useMemo(() => nodes.filter(n => (n.status ?? 'verified') === 'verified').length, [nodes])
  const pendingCount = useMemo(() => nodes.filter(n => n.status === 'pending').length, [nodes])
  const rejectedCount = useMemo(() => nodes.filter(n => n.status === 'rejected').length, [nodes])

  async function handleSave() {
    if (!formName.trim()) { setSaveErr('נא להזין שם'); return }
    setSaving(true); setSaveErr('')
    try {
      if (modal?.type === 'edit') {
        await fetch('/api/admin/lineage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: modal.node.id, name: formName, relation: formRelation }) })
      } else if (modal?.type === 'add') {
        const parentId = modal.parentId ?? formParentId
        await fetch('/api/admin/lineage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formName, parent_id: parentId, relation: formRelation }) })
      }
      await loadAll(); close()
    } catch { setSaveErr('שגיאה') }
    setSaving(false)
  }

  async function handleDelete() {
    if (modal?.type !== 'delete') return
    setSaving(true)
    try {
      await fetch(`/api/admin/lineage?id=${modal.node.id}`, { method: 'DELETE' })
      await loadAll(); close()
    } catch { setSaveErr('שגיאה') }
    setSaving(false)
  }

  return (
    <div dir="rtl">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">עץ הדורות</h1>
          {!loading && (
            <span className="text-sm text-gray-400 font-medium">{nodes.length} רשומות</span>
          )}
          {!loading && (
            <>
              <button onClick={() => { setGenerationFilter(null); setStatusFilter(f => f === 'verified' ? null : 'verified') }}
                className="text-xs px-2.5 py-1 rounded-full font-bold transition-all"
                style={{ background: statusFilter === 'verified' ? '#166534' : '#DCFCE7', color: statusFilter === 'verified' ? '#fff' : '#166534', border: `2px solid ${statusFilter === 'verified' ? '#166534' : 'transparent'}`, cursor: 'pointer' }}>
                ✓ {verifiedCount} מאומתים
              </button>
              <button onClick={() => { setGenerationFilter(null); setStatusFilter(f => f === 'pending' ? null : 'pending') }}
                className="text-xs px-2.5 py-1 rounded-full font-bold transition-all"
                style={{ background: statusFilter === 'pending' ? '#92400E' : '#FEF3C7', color: statusFilter === 'pending' ? '#fff' : '#92400E', border: `2px solid ${statusFilter === 'pending' ? '#92400E' : 'transparent'}`, cursor: 'pointer' }}>
                ⏳ {pendingCount} ממתינים לאימות
              </button>
              <button onClick={() => { setGenerationFilter(null); setStatusFilter(f => f === 'rejected' ? null : 'rejected') }}
                className="text-xs px-2.5 py-1 rounded-full font-bold transition-all"
                style={{ background: statusFilter === 'rejected' ? '#991B1B' : '#FEE2E2', color: statusFilter === 'rejected' ? '#fff' : '#DC2626', border: `2px solid ${statusFilter === 'rejected' ? '#991B1B' : '#FECACA'}`, cursor: 'pointer' }}>
                ✗ {rejectedCount} נדחים
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {(['tree', 'table'] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${view === v ? 'bg-white shadow-sm text-violet-700' : 'text-gray-400 hover:text-gray-600'}`}>
                {v === 'tree' ? '🌳 עץ' : '📋 טבלה'}
              </button>
            ))}
          </div>
          <button onClick={loadAll} disabled={loading} title="רענן"
            className="w-9 h-9 rounded-xl bg-white border border-gray-200 text-violet-600 flex items-center justify-center hover:bg-violet-50 transition-colors disabled:opacity-50">
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <button
            onClick={() => { setFormName(''); setFormParentId(null); setModal({ type: 'add', parentId: null, parentName: '' }) }}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm">
            <Plus size={14} /> הוסף דור חדש
          </button>
        </div>
      </div>

      {/* generation legend — clickable filters */}
      {nodes.length > 0 && !loading && (
        <div className="flex gap-2 flex-wrap mb-4">
          {Array.from({ length: maxGen }, (_, i) => i + 1).map(g => (
            <button key={g} onClick={() => { setStatusFilter(null); setGenerationFilter(f => f === g ? null : g) }}
              className="flex items-center px-3 py-1 rounded-full text-xs font-bold border transition-all"
              style={{
                background: generationFilter === g ? pal(g).ring : pal(g).light,
                borderColor: generationFilter === g ? pal(g).ring : `${pal(g).ring}33`,
                color: generationFilter === g ? '#fff' : pal(g).text,
                cursor: 'pointer',
                boxShadow: generationFilter === g ? `0 2px 8px ${pal(g).shadow}` : 'none',
              }}>
              דור {g} · {genCounts[g] ?? 0}
            </button>
          ))}
        </div>
      )}

      {/* content */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, gap: 12, color: '#7C3AED' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>טוען נתונים…</span>
        </div>
      ) : view === 'tree' ? (
        <TreeView nodes={nodes} onRefresh={softRefresh} onStatusChange={(id, status) => setNodes(prev => prev.map(n => n.id === id ? { ...n, status } : n))} onClearFilters={() => { setStatusFilter(null); setGenerationFilter(null) }} statusFilter={statusFilter} generationFilter={generationFilter} />
      ) : (
        <TableView
          nodes={nodes}
          onRefresh={loadAll}
          statusFilter={statusFilter}
          generationFilter={generationFilter}
          onAdd={(parentId, parentName) => { setFormName(''); setModal({ type: 'add', parentId, parentName }) }}
          onEdit={node => { setFormName(node.name); setFormRelation(node.relation ?? null); setModal({ type: 'edit', node }) }}
          onDelete={node => setModal({ type: 'delete', node: { ...node, children: buildTree(nodes).find(n => n.id === node.id)?.children ?? [] } })}
        />
      )}

      {/* page-level modals (table view) */}
      {modal?.type === 'edit' && (
        <Modal title={`עריכת: ${modal.node.name}`} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} style={{ border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit', background: '#FAFBFF' }} />
            {modal.node.parent_id && <RelationPicker value={formRelation} onChange={setFormRelation} />}
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="שמור" color="#7C3AED" onClick={handleSave} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'add' && (
        <Modal title={modal.parentId ? `הוסף ילד ל: ${modal.parentName}` : 'הוסף דור חדש'} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="הכנס שם..." style={{ border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit', background: '#FAFBFF' }} />
            {(modal.parentId || formParentId) && <RelationPicker value={formRelation} onChange={setFormRelation} />}
            {!modal.parentId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B' }}>מי האב/האם שלו?</label>
                <select value={formParentId ?? ''} onChange={e => setFormParentId(e.target.value || null)}
                  style={{ border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit', background: '#FAFBFF', cursor: 'pointer' }}>
                  <option value="">— ללא הורה (שורש ראשי) —</option>
                  {[...nodes].filter(n => (n.status ?? 'verified') === 'verified').sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name, 'he')).map(n => (
                    <option key={n.id} value={n.id}>{n.name} (דור {n.generation})</option>
                  ))}
                </select>
              </div>
            )}
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="הוסף" color="#059669" onClick={handleSave} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'delete' && (
        <Modal title="מחיקת צומת" onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.6 }}>האם למחוק את <strong style={{ color: '#0F172A' }}>{modal.node.name}</strong>?</p>
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="מחק" color="#DC2626" onClick={handleDelete} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
