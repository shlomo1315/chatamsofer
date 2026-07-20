'use client'
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { Plus, RefreshCw, Loader2, ChevronRight, ChevronDown, Pencil, Trash2, X, Users, Check } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useCan } from '@/components/StaffPermissions'

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

// סולם דורות "קלף וחותם": כל דור בגוון מלא מעט מתקדם — זהב חם → נחושת → ארד → יין → חום עתיק.
// מבנה האובייקט זהה (bg/ring/shadow/light/text) כדי שכל שאר הקוד המשתמש ב-pal(g) לא ישתנה.
const PALETTE = [
  { bg: 'linear-gradient(160deg,#e0b94a 0%,#c69e2d 78%)', ring: '#c69e2d', shadow: 'rgba(198,158,45,0.34)', light: '#FBF3DA', text: '#8a6a1e' },
  { bg: 'linear-gradient(160deg,#d3a344 0%,#bf8b34 78%)', ring: '#bf8b34', shadow: 'rgba(191,139,52,0.32)', light: '#FAEFD6', text: '#7d5a1f' },
  { bg: 'linear-gradient(160deg,#c68a4e 0%,#b3703a 78%)', ring: '#b3703a', shadow: 'rgba(179,112,58,0.32)', light: '#F6E9D8', text: '#7a4a26' },
  { bg: 'linear-gradient(160deg,#b56f4f 0%,#a15a3d 78%)', ring: '#a15a3d', shadow: 'rgba(161,90,61,0.32)',  light: '#F3E2D8', text: '#6f3a2a' },
  { bg: 'linear-gradient(160deg,#a15a58 0%,#8c4a44 78%)', ring: '#8c4a44', shadow: 'rgba(140,74,68,0.32)',  light: '#F0DEDC', text: '#5f3230' },
  { bg: 'linear-gradient(160deg,#867059 0%,#6f5a44 78%)', ring: '#6f5a44', shadow: 'rgba(111,90,68,0.32)',  light: '#EBE4D8', text: '#4d3f30' },
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
function RelationPicker({ value, onChange, required }: { value: 'son' | 'son_in_law' | null; onChange: (v: 'son' | 'son_in_law' | null) => void; required?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>קשר להורה (הדור הקודם){required && <span style={{ color: '#DC2626' }}> *</span>}</label>
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

function TreeView({ nodes, onRefresh, onStatusChange, onRelationChange, onClearFilters, statusFilter, generationFilter, mergeMode, mergeSel, dupIds, onToggleMerge, dupFilter, onMergeGroup }: { nodes: LineageNode[]; onRefresh: () => void; onStatusChange: (id: string, status: 'verified' | 'pending' | 'rejected') => void; onRelationChange: (id: string, relation: 'son' | 'son_in_law' | null) => void; onClearFilters: () => void; statusFilter: StatusFilter; generationFilter: number | null; mergeMode: boolean; mergeSel: Set<string>; dupIds: Set<string>; onToggleMerge: (id: string) => void; dupFilter: boolean; onMergeGroup: (id: string) => void }) {
  const toast = useToast()
  const canAdd = useCan('lineage', 'add')
  const canEdit = useCan('lineage', 'edit')
  const canDelete = useCan('lineage', 'delete')
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  // hover עם השהיה לסגירה — מאפשר להזיז את העכבר אל החלונית בלי שהיא תיעלם
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showHover = useCallback((id: string) => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
    setHovered(id)
  }, [])
  const scheduleHideHover = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHovered(null), 280)
  }, [])
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
        const next = Math.min(2.5, Math.max(0.1, +(prev - e.deltaY * 0.0015).toFixed(3)))
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
      toast.error(`שגיאה בשמירה: ${res.status} — ${err.error ?? 'שגיאה לא ידועה'}`)
      return
    }
    onRefresh()
  }

  // סימון בן/חתן מהיר (מ-hover) — עדכון אופטימי + שמירה
  async function patchRelation(node: LineageNode, relation: 'son' | 'son_in_law') {
    const next = node.relation === relation ? null : relation
    onRelationChange(node.id, next)
    const res = await fetch('/api/admin/lineage', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ id: node.id, relation: next }),
    })
    if (!res.ok) { onRelationChange(node.id, node.relation ?? null); toast.error('שגיאה בשמירת בן/חתן'); return }
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
    const newZoom = Math.min(1.5, Math.max(0.1, Math.min(el.clientWidth / (w + PAD * 2), el.clientHeight / (h + PAD * 2))))
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
      {canAdd && (
        <button onClick={() => { setFormName(''); setModal({ type: 'add', parentId: null, parentName: '' }) }} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'linear-gradient(135deg,#7C3AED,#5B21B6)', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(124,58,237,0.4)' }}>
          <Plus size={16} /> הוסף שורש ראשון
        </button>
      )}
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
          <button onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C3AED', fontWeight: 700 }}>−</button>
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
          // רקע קלף עדין מאוד — נגיעת זהב + קווי סרגל דהויים, משתלב ב-slate/זהב של האתר
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(198,158,45,0.05), transparent 70%),' +
            'repeating-linear-gradient(0deg, transparent 0 39px, rgba(27,50,86,0.025) 39px 40px),' +
            'linear-gradient(170deg,#fdfbf5 0%,#f6f1e4 100%)',
          border: '1.5px solid #e6ddc8',
          boxShadow: '0 4px 32px rgba(140,110,40,0.08)',
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
              // חיבור אורתוגונלי מסודר (כמו אילן יוחסין קלאסי): יורד מההורה לגובה האמצע,
              // אופקי לעמודת הילד, ואז יורד לילד. פינות מעוגלות עדין לרכות.
              const r = Math.min(10 * zoom, Math.abs(x2 - x1) / 2, Math.abs(mid - y1))
              const dir = x2 >= x1 ? 1 : -1
              const d = Math.abs(x2 - x1) < 1
                ? `M${x1},${y1} L${x2},${y2}`
                : `M${x1},${y1} L${x1},${mid - r} Q${x1},${mid} ${x1 + dir * r},${mid} L${x2 - dir * r},${mid} Q${x2},${mid} ${x2},${mid + r} L${x2},${y2}`
              const isPathEdge = selected && pathBranch.has(e.from.node.id) && pathBranch.has(e.to.node.id)
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke="#fff" strokeWidth={isPathEdge ? 8 : 5} strokeLinecap="round" strokeLinejoin="round" opacity={selected && !isPathEdge ? 0.1 : 0.9} />
                  <path d={d} fill="none" stroke={col} strokeWidth={isPathEdge ? 4 : 2.5} strokeLinecap="round" strokeLinejoin="round" opacity={selected && !isPathEdge ? 0.08 : 0.85} />
                </g>
              )
            })}
          </svg>

          {positions.map(pos => {
            const nodeStatus = pos.node.status ?? 'verified'
            const genPal = pal(pos.node.generation)
            // הבדל בתוך צבע הדור בלי להחוויר: בן = צבע הדור המלא · חתן = אותו גוון, כהה יותר
            const relOverlay = pos.node.relation === 'son_in_law'
              ? 'linear-gradient(rgba(0,0,0,0.30),rgba(0,0,0,0.30)), '
              : ''
            const isSel = selected === pos.node.id
            const inMerge = mergeMode && mergeSel.has(pos.node.id)
            const isDup = dupIds.has(pos.node.id)
            const isDimmed = mergeMode
              ? false
              : selected !== null
                ? !pathBranch.has(pos.node.id)
                : dupFilter
                  ? !isDup
                  : (statusFilter !== null && nodeStatus !== statusFilter) || (generationFilter !== null && pos.node.generation !== generationFilter)
            const p = nodeStatus === 'verified' ? genPal
              : nodeStatus === 'rejected'
                ? { bg: 'linear-gradient(135deg,#EF4444 0%,#DC2626 100%)', ring: '#DC2626', shadow: 'rgba(220,38,38,0.4)', light: '#FEF2F2', text: '#991B1B' }
                : { bg: 'linear-gradient(135deg,#FB923C 0%,#EA580C 100%)', ring: '#EA580C', shadow: 'rgba(234,88,12,0.4)', light: '#FFF7ED', text: '#9A3412' }
            return (
              <div
                key={pos.node.id}
                data-lin-node="1"
                onMouseEnter={() => showHover(pos.node.id)}
                onMouseLeave={scheduleHideHover}
                onClick={e => { e.stopPropagation(); if (mergeMode) { onToggleMerge(pos.node.id); return } setSelected(prev => prev === pos.node.id ? null : pos.node.id) }}
                style={{
                  position: 'absolute', left: pos.x * zoom, top: pos.y * zoom,
                  width: NW * zoom, height: NH * zoom, borderRadius: 16 * zoom,
                  background: relOverlay + p.bg,
                  boxShadow: inMerge
                    ? `0 0 0 3px #fff, 0 0 0 6px #16A34A, 0 12px 32px rgba(22,163,74,0.4)`
                    : isSel
                      ? `0 0 0 3px #fff, 0 0 0 5.5px ${p.ring}, 0 12px 32px ${p.shadow}`
                      : `0 4px 18px ${p.shadow}`,
                  border: nodeStatus === 'verified' ? 'none' : `${Math.max(2, 2.5 * zoom)}px dashed #fff`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  transform: isSel ? 'scale(1.07) translateY(-2px)' : 'scale(1)',
                  transition: 'box-shadow .2s, transform .2s, opacity .2s',
                  opacity: isDimmed ? 0.25 : 1,
                  zIndex: (isSel || hovered === pos.node.id) ? 50 : 2, userSelect: 'none',
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

                {/* תג "כפול" — שם המופיע ביותר מצומת אחד */}
                {isDup && zoom >= 0.5 && (
                  <div style={{ position: 'absolute', bottom: -10 * zoom, left: '50%', transform: 'translateX(-50%)', background: '#9333EA', color: '#fff', fontSize: Math.max(7, 8 * zoom), fontWeight: 800, padding: `${1 * zoom}px ${7 * zoom}px`, borderRadius: 20, border: '1.5px solid #fff', whiteSpace: 'nowrap', zIndex: 26 }}>כפול</div>
                )}

                {/* כיסוי בחירה במצב מיזוג */}
                {inMerge && (
                  <div style={{ position: 'absolute', inset: 0, borderRadius: 16 * zoom, background: 'rgba(22,163,74,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 24 }}>
                    <div style={{ background: '#16A34A', borderRadius: '50%', width: 26 * zoom, height: 26 * zoom, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}><Check size={14 * zoom} color="#fff" strokeWidth={3} /></div>
                  </div>
                )}

                {/* status indicator dot */}
                <div
                  onClick={e => { e.stopPropagation(); if (canEdit) handleToggleStatus(pos.node) }}
                  title={nodeStatus === 'verified' ? 'מאומת → לחץ לממתין' : nodeStatus === 'pending' ? 'ממתין → לחץ ללא מאושר' : 'לא מאושר → לחץ לאימות'}
                  style={{
                    position: 'absolute', top: -10 * zoom, left: 6 * zoom,
                    width: 20 * zoom, height: 20 * zoom, borderRadius: '50%',
                    background: statusColor(nodeStatus),
                    border: `2px solid #fff`,
                    boxShadow: `0 1px 5px rgba(0,0,0,0.3)`,
                    cursor: canEdit ? 'pointer' : 'default',
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

                {/* actions strip — מתחת לקובייה, גם בלחיצה וגם במעבר עכבר (hover) */}
                {!mergeMode && (isSel || hovered === pos.node.id) && (
                  <div onClick={e => e.stopPropagation()}
                    onMouseEnter={() => showHover(pos.node.id)}
                    onMouseLeave={scheduleHideHover}
                    style={{
                      // top:100% צמוד לתחתית הקוביה + padding-top שקוף כ"גשר" — כך המעבר עם העכבר לחלונית אינו מאבד את ה-hover
                      position: 'absolute', top: '100%', paddingTop: 12, left: '50%', transform: 'translateX(-50%)',
                      display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', zIndex: 40,
                    }}>
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center',
                    background: '#fff', borderRadius: 16, padding: '8px 10px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.16)', border: '1px solid #E2E8F0',
                  }}>
                    {/* כפתור מיזוג כפילים — מופיע רק לצומת ששמו כפול באותו גזע */}
                    {isDup && (
                      <button onClick={() => onMergeGroup(pos.node.id)} title="מזג את הכפילויות של שם זה באותו גזע"
                        style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', justifyContent: 'center', padding: '7px 12px', borderRadius: 10, background: '#9333EA', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: 'inherit' }}>
                        ⚯ מזג כפילים
                      </button>
                    )}
                    {/* שורת אייקונים */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[
                        ...(canEdit ? [{ icon: <Pencil size={13} />, color: p.ring, bg: p.light, fn: () => { setFormName(pos.node.name); setFormRelation(pos.node.relation ?? null); setModal({ type: 'edit', node: pos.node }) }, title: 'ערוך' }] : []),
                        ...(canAdd ? [{ icon: <Plus size={14} />, color: '#059669', bg: '#ECFDF5', fn: () => { setFormName(''); setFormRelation(null); setModal({ type: 'add', parentId: pos.node.id, parentName: pos.node.name }) }, title: 'הוסף ילד' }] : []),
                        ...(canEdit && nodeStatus !== 'verified' ? [{ icon: <Check size={13} />, color: '#16A34A', bg: '#F0FDF4', fn: () => handleSetStatus(pos.node, 'verified' as const), title: 'אשר' }] : []),
                        ...(canEdit && nodeStatus !== 'rejected' ? [{ icon: <X size={13} />, color: '#DC2626', bg: '#FEF2F2', fn: () => handleSetStatus(pos.node, 'rejected' as const), title: 'דחה' }] : []),
                        ...(canDelete ? [{ icon: <Trash2 size={13} />, color: '#64748B', bg: '#F1F5F9', fn: () => setModal({ type: 'delete', node: pos.node }), title: 'מחק' }] : []),
                      ].map((b, i) => (
                        <button key={i} onClick={b.fn} title={b.title} style={{ width: 32, height: 32, borderRadius: '50%', background: b.bg, color: b.color, border: `1.5px solid ${b.color}33`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{b.icon}</button>
                      ))}
                    </div>
                    {/* שורת בן/חתן — מתחת לכל האייקונים (רק לצומת שאינו השורש) */}
                    {pos.node.parent_id && (
                      <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                        {([['son', 'בן', '#1E40AF', '#BFDBFE', '#EFF6FF'], ['son_in_law', 'חתן', '#92400E', '#FDE68A', '#FFFBEB']] as const).map(([v, l, fg, selBg, bg]) => (
                          <button key={v} onClick={() => patchRelation(pos.node, v)} title={`סמן ${l}`}
                            style={{ flex: 1, padding: '5px 0', borderRadius: 9, background: pos.node.relation === v ? selBg : bg, color: fg, border: `1.5px solid ${pos.node.relation === v ? fg : fg + '33'}`, cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: 'inherit' }}>{l}</button>
                        ))}
                      </div>
                    )}
                  </div>
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
                ...(canEdit ? [{ label: 'עריכה', fn: () => { setFormName(selPos.node.name); setFormRelation(selPos.node.relation ?? null); setModal({ type: 'edit', node: selPos.node }) }, color: pal(selPos.node.generation).ring, bg: pal(selPos.node.generation).light }] : []),
                ...(canAdd ? [{ label: 'הוסף ילד', fn: () => { setFormName(''); setModal({ type: 'add', parentId: selPos.node.id, parentName: selPos.node.name }) }, color: '#059669', bg: '#ECFDF5' }] : []),
                ...(canEdit && (selPos.node.status ?? 'verified') !== 'verified' ? [{ label: '✓ אמת', fn: () => handleSetStatus(selPos.node, 'verified' as const), color: '#16A34A', bg: '#F0FDF4' }] : []),
                ...(canEdit && (selPos.node.status ?? 'verified') !== 'rejected' ? [{ label: '✗ דחה', fn: () => handleSetStatus(selPos.node, 'rejected' as const), color: '#DC2626', bg: '#FEF2F2' }] : []),
                ...(canDelete ? [{ label: 'מחיקה', fn: () => setModal({ type: 'delete', node: selPos.node }), color: '#64748B', bg: '#F1F5F9' }] : []),
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
              {canEdit && <MBtn label="שמור" color="#7C3AED" onClick={handleSave} loading={saving} />}
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
              {canAdd && <MBtn label="הוסף" color="#059669" onClick={handleSave} loading={saving} />}
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
              {canDelete && <MBtn label="מחק" color="#DC2626" onClick={handleDelete} loading={saving} />}
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ─── Table view ───

function TableView({ nodes, onRefresh, onAdd, onEdit, onDelete, statusFilter, generationFilter, mergeMode, mergeSel, dupIds, onToggleMerge, dupFilter, onMergeGroup }: {
  nodes: LineageNode[]
  onRefresh: () => void
  onAdd: (parentId: string | null, parentName: string) => void
  onEdit: (node: LineageNode) => void
  onDelete: (node: LineageNode) => void
  statusFilter: StatusFilter
  generationFilter: number | null
  mergeMode: boolean
  mergeSel: Set<string>
  dupIds: Set<string>
  onToggleMerge: (id: string) => void
  dupFilter: boolean
  onMergeGroup: (id: string) => void
}) {
  const canAdd = useCan('lineage', 'add')
  const canEdit = useCan('lineage', 'edit')
  const canDelete = useCan('lineage', 'delete')
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
    const isDup = dupIds.has(node.id)
    const isDimmed = (statusFilter !== null && nodeStatus !== statusFilter)
      || (generationFilter !== null && node.generation !== generationFilter)
      || (dupFilter && !isDup)
    const p = pal(node.generation)
    const hasChildren = node.children.length > 0
    const isExpanded = expanded.has(node.id)
    return (
      <div key={node.id}>
        <div
          style={{ display: 'flex', alignItems: 'center', padding: '10px 18px', borderBottom: '1px solid #F1F5F9', direction: 'rtl', gap: 8, background: '#fff', transition: 'background .12s, opacity .2s', minWidth: 0, opacity: isDimmed ? 0.25 : 1 }}
          onMouseEnter={e => (e.currentTarget.style.background = '#FAFAFE')}
          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
          {mergeMode && (
            <input type="checkbox" checked={mergeSel.has(node.id)} onChange={() => onToggleMerge(node.id)}
              style={{ width: 16, height: 16, accentColor: '#9333EA', cursor: 'pointer', flexShrink: 0 }} />
          )}
          <div style={{ width: depth * 22, flexShrink: 0 }} />
          <button onClick={() => toggle(node.id)} style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hasChildren ? p.light : 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default', color: p.ring, flexShrink: 0, borderRadius: 6 }}>
            {hasChildren ? (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span style={{ width: 13 }} />}
          </button>
          {/* status dot */}
          <button
            onClick={() => { if (canEdit) handleToggleStatus(node) }}
            title={nodeStatus === 'verified' ? 'מאומת → ממתין' : nodeStatus === 'pending' ? 'ממתין → לא מאושר' : 'לא מאושר → אמת'}
            style={{ width: 14, height: 14, borderRadius: '50%', background: statusColor(nodeStatus), border: 'none', cursor: canEdit ? 'pointer' : 'default', flexShrink: 0,
              boxShadow: nodeStatus === 'verified' ? '0 0 0 3px #DCFCE7' : nodeStatus === 'rejected' ? '0 0 0 3px #FEE2E2' : '0 0 0 3px #FEF3C7' }}
          />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {node.name}
            {dupIds.has(node.id) && <span style={{ marginRight: 6, background: '#F3E8FF', color: '#7C2D92', fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 20, border: '1px solid #E9D5FF' }}>כפול</span>}
          </span>
          <div style={{ padding: '3px 10px', borderRadius: 20, background: p.light, color: p.text, fontSize: 11, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>דור {node.generation}</div>
          <div style={{ minWidth: 56, textAlign: 'center', fontSize: 12, color: '#94A3B8', flexShrink: 0 }}>
            {childCount.get(node.id) ? `${childCount.get(node.id)}` : '—'}
          </div>
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
            {isDup && !mergeMode && (
              <button onClick={() => onMergeGroup(node.id)} title="מזג כפילים (אותו גזע)" style={{ width: 28, height: 28, borderRadius: 7, background: '#F3E8FF', border: '1.5px solid #E9D5FF', color: '#9333EA', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>⚯</button>
            )}
            {canAdd && <button onClick={() => onAdd(node.id, node.name)} title="הוסף ילד" style={{ width: 28, height: 28, borderRadius: 7, background: '#ECFDF5', border: '1.5px solid #BBF7D0', color: '#059669', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={12} /></button>}
            {canEdit && <button onClick={() => onEdit(node)} title="עריכה" style={{ width: 28, height: 28, borderRadius: 7, background: p.light, border: `1.5px solid ${p.ring}33`, color: p.ring, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={11} /></button>}
            {canDelete && <button onClick={() => onDelete(node)} title="מחיקה" style={{ width: 28, height: 28, borderRadius: 7, background: '#FEF2F2', border: '1.5px solid #FECACA', color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={11} /></button>}
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
  const canAdd = useCan('lineage', 'add')
  const canEdit = useCan('lineage', 'edit')
  const canDelete = useCan('lineage', 'delete')
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
  // ── מצב מיזוג כפולים ──
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeSel, setMergeSel] = useState<Set<string>>(new Set())
  const [keepId, setKeepId] = useState<string | null>(null)
  const [mergeConfirm, setMergeConfirm] = useState(false)
  const [merging, setMerging] = useState(false)
  // סינון "הצג רק כפולים" (לחיצה על תג השמות הכפולים)
  const [dupFilter, setDupFilter] = useState(false)
  // לאחר מיזוג — הצעה לאשר את הייחוס
  const [approvePrompt, setApprovePrompt] = useState<{ keepId: string; keepName: string } | null>(null)
  const [approveDesc, setApproveDesc] = useState(true)
  const [approving, setApproving] = useState(false)
  const toast = useToast()

  function close() { setModal(null); setSaveErr(''); setFormParentId(null); setFormRelation(null) }

  // קבוצות שמות כפולים — אותו שם מנורמל, תחת *אותו אב* (אותו parent_id) ובאותו דור.
  // כך בני דודים (אבות שונים) עם אותו שם אינם נחשבים כפילות; רק אותו אדם שנרשם פעמיים
  // תחת אותו אב (למשל ע"י שני בניו בנפרד) נחשב כפילות למיזוג.
  const dupKey = useCallback(
    (parentId: string | null, generation: number, name: string) =>
      `${parentId ?? 'root'}|${generation}|${name.trim().replace(/\s+/g, ' ')}`,
    [],
  )
  const { dupIds, dupGroups } = useMemo(() => {
    const byKey = new Map<string, string[]>()
    for (const n of nodes) {
      const name = n.name.trim().replace(/\s+/g, ' ')
      if (!name) continue
      const key = dupKey(n.parent_id, n.generation, name)
      const arr = byKey.get(key) ?? []
      arr.push(n.id)
      byKey.set(key, arr)
    }
    const ids = new Set<string>()
    const groups = new Map<string, string[]>()
    for (const [key, arr] of byKey) if (arr.length > 1) { arr.forEach(id => ids.add(id)); groups.set(key, arr) }
    return { dupIds: ids, dupGroups: groups }
  }, [nodes, dupKey])

  // מזהה → רשימת הצמתים בקבוצת הכפילות שלו (אותו אב + אותו דור + אותו שם)
  const dupGroupOf = useCallback((id: string): string[] => {
    const n = nodes.find(x => x.id === id)
    if (!n) return []
    return dupGroups.get(dupKey(n.parent_id, n.generation, n.name)) ?? []
  }, [nodes, dupGroups, dupKey])

  const dupNameCount = dupGroups.size

  function exitMerge() { setMergeMode(false); setMergeSel(new Set()); setKeepId(null); setMergeConfirm(false) }
  function enterMerge() { setStatusFilter(null); setGenerationFilter(null); setDupFilter(false); setMergeMode(true); setMergeSel(new Set()); setKeepId(null) }

  // התחלת מיזוג ממוקד מצומת כפול — מסמן אוטומטית את כל הקבוצה (אותו גזע + שם), הצומת שנלחץ נשאר
  const startGroupMerge = useCallback((id: string) => {
    const group = dupGroupOf(id)
    if (group.length < 2) return
    setStatusFilter(null); setGenerationFilter(null); setDupFilter(false)
    setMergeMode(true); setMergeSel(new Set(group)); setKeepId(id)
  }, [dupGroupOf])

  function toggleDupFilter() {
    setStatusFilter(null); setGenerationFilter(null)
    if (mergeMode) exitMerge()
    setDupFilter(f => !f)
  }
  const toggleMerge = useCallback((id: string) => {
    setMergeSel(prev => {
      const s = new Set(prev)
      if (s.has(id)) { s.delete(id); setKeepId(k => (k === id ? null : k)) }
      else { s.add(id); setKeepId(k => k ?? id) }
      return s
    })
  }, [])

  const selectedNodes = useMemo(() => nodes.filter(n => mergeSel.has(n.id)), [nodes, mergeSel])
  // ברירת מחדל ל-keep: הצומת המאומת בבחירה, אחרת הראשון
  const effectiveKeepId = keepId && mergeSel.has(keepId)
    ? keepId
    : (selectedNodes.find(n => (n.status ?? 'verified') === 'verified')?.id ?? selectedNodes[0]?.id ?? null)

  async function handleMerge() {
    const ids = [...mergeSel]
    if (!effectiveKeepId || ids.length < 2) return
    const mergeIds = ids.filter(id => id !== effectiveKeepId)
    setMerging(true)
    try {
      const res = await fetch('/api/admin/lineage/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepId: effectiveKeepId, mergeIds }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error || 'שגיאה במיזוג'); setMerging(false); return }
      toast.success(`מוזגו ${d.mergedCount} צמתים · ${d.reassignedChildren} ילדים · ${d.reassignedBeneficiaries} נרשמים`)
      const keepName = nodes.find(n => n.id === effectiveKeepId)?.name ?? ''
      await loadAll()
      exitMerge()
      // לאחר מיזוג — להציע לאשר את הייחוס של הצומת שנשאר
      setApprovePrompt({ keepId: effectiveKeepId, keepName })
      setApproveDesc(true)
    } catch { toast.error('שגיאת רשת') }
    setMerging(false)
  }

  // כל הצאצאים (המשורשרים) של צומת — לפי קשרי האב במצב הנוכחי
  const descendantsOf = useCallback((rootId: string): string[] => {
    const childrenBy = new Map<string, string[]>()
    nodes.forEach(n => { if (n.parent_id) { const a = childrenBy.get(n.parent_id) ?? []; a.push(n.id); childrenBy.set(n.parent_id, a) } })
    const out: string[] = []
    const stack = [...(childrenBy.get(rootId) ?? [])]
    while (stack.length) {
      const id = stack.pop()!
      out.push(id)
      for (const c of childrenBy.get(id) ?? []) stack.push(c)
    }
    return out
  }, [nodes])

  async function handleApproveLineage(includeDescendants: boolean) {
    if (!approvePrompt) return
    const ids = [approvePrompt.keepId, ...(includeDescendants ? descendantsOf(approvePrompt.keepId) : [])]
    setApproving(true)
    try {
      // עדכון אופטימי
      setNodes(prev => prev.map(n => ids.includes(n.id) ? { ...n, status: 'verified' } : n))
      await Promise.all(ids.map(id =>
        fetch('/api/admin/lineage', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status: 'verified' }),
        })
      ))
      toast.success(includeDescendants ? `אושר הייחוס + ${ids.length - 1} משורשרים` : 'הייחוס אושר')
      await softRefresh()
    } catch { toast.error('שגיאה באישור הייחוס') }
    setApproving(false)
    setApprovePrompt(null)
  }

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
    const addParentId = modal?.type === 'add' ? (modal.parentId ?? formParentId) : null
    // בהוספת דור חדש (כשכבר יש עץ) — אבא ובן/חתן חובה
    if (modal?.type === 'add' && nodes.length > 0) {
      if (!addParentId) { setSaveErr('יש לבחור את האב/האם (הדור הקודם)'); return }
      if (!formRelation) { setSaveErr('יש לבחור האם הוא בן או חתן'); return }
    }
    setSaving(true); setSaveErr('')
    try {
      if (modal?.type === 'edit') {
        await fetch('/api/admin/lineage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: modal.node.id, name: formName, relation: formRelation }) })
      } else if (modal?.type === 'add') {
        await fetch('/api/admin/lineage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formName, parent_id: addParentId, relation: formRelation }) })
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
              {dupNameCount > 0 && (
                <button onClick={toggleDupFilter}
                  title="הצג רק שמות כפולים (באותו גזע) · לחיצה נוספת לביטול"
                  className="text-xs px-2.5 py-1 rounded-full font-bold transition-all"
                  style={{ background: dupFilter ? '#9333EA' : '#F3E8FF', color: dupFilter ? '#fff' : '#7C2D92', border: `2px solid ${dupFilter ? '#9333EA' : '#E9D5FF'}`, cursor: 'pointer' }}>
                  ⚠ {dupNameCount} שמות כפולים
                </button>
              )}
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
          <button onClick={() => (mergeMode ? exitMerge() : enterMerge())}
            className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
            style={{ background: mergeMode ? '#9333EA' : '#fff', color: mergeMode ? '#fff' : '#7C2D92', border: '1px solid #E9D5FF' }}>
            {mergeMode ? 'סיום מיזוג' : '⚯ מזג כפולים'}
          </button>
          {canAdd && (
            <button
              onClick={() => { setFormName(''); setFormParentId(null); setModal({ type: 'add', parentId: null, parentName: '' }) }}
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm">
              <Plus size={14} /> הוסף דור חדש
            </button>
          )}
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
        <TreeView nodes={nodes} onRefresh={softRefresh} onStatusChange={(id, status) => setNodes(prev => prev.map(n => n.id === id ? { ...n, status } : n))} onRelationChange={(id, relation) => setNodes(prev => prev.map(n => n.id === id ? { ...n, relation } : n))} onClearFilters={() => { setStatusFilter(null); setGenerationFilter(null); setDupFilter(false) }} statusFilter={statusFilter} generationFilter={generationFilter} mergeMode={mergeMode} mergeSel={mergeSel} dupIds={dupIds} onToggleMerge={toggleMerge} dupFilter={dupFilter} onMergeGroup={startGroupMerge} />
      ) : (
        <TableView
          nodes={nodes}
          onRefresh={loadAll}
          statusFilter={statusFilter}
          generationFilter={generationFilter}
          mergeMode={mergeMode}
          mergeSel={mergeSel}
          dupIds={dupIds}
          onToggleMerge={toggleMerge}
          dupFilter={dupFilter}
          onMergeGroup={startGroupMerge}
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
              {canEdit && <MBtn label="שמור" color="#7C3AED" onClick={handleSave} loading={saving} />}
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'add' && (
        <Modal title={modal.parentId ? `הוסף ילד ל: ${modal.parentName}` : 'הוסף דור חדש'} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B' }}>שם <span style={{ color: '#DC2626' }}>*</span></label>
              <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="הכנס שם..." style={{ border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit', background: '#FAFBFF' }} />
            </div>
            {!modal.parentId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B' }}>מי האב/האם שלו? <span style={{ color: '#DC2626' }}>*</span></label>
                <select value={formParentId ?? ''} onChange={e => setFormParentId(e.target.value || null)}
                  style={{ border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit', background: '#FAFBFF', cursor: 'pointer' }}>
                  <option value="">— בחר אב/אם —</option>
                  {[...nodes].filter(n => (n.status ?? 'verified') === 'verified').sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name, 'he')).map(n => (
                    <option key={n.id} value={n.id}>{n.name} (דור {n.generation})</option>
                  ))}
                </select>
              </div>
            )}
            {(modal.parentId || formParentId) && <RelationPicker value={formRelation} onChange={setFormRelation} required />}
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              {canAdd && <MBtn label="הוסף" color="#059669" onClick={handleSave} loading={saving} />}
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
              {canDelete && <MBtn label="מחק" color="#DC2626" onClick={handleDelete} loading={saving} />}
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}

      {/* באנר הדרכה במצב מיזוג */}
      {mergeMode && mergeSel.size === 0 && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 120, background: '#FAF5FF', border: '1.5px solid #E9D5FF', color: '#7C2D92', borderRadius: 14, padding: '10px 18px', fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(124,58,237,0.18)' }}>
          מצב מיזוג: סמן 2 צמתים או יותר (אותו אדם) למיזוג · <button onClick={exitMerge} style={{ color: '#9333EA', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit' }}>סיום</button>
        </div>
      )}

      {/* בר מיזוג צף — נבחרו צמתים */}
      {mergeMode && mergeSel.size > 0 && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 120, background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: 16, padding: '12px 16px', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', maxWidth: '92vw', direction: 'rtl' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#64748B', marginBottom: 8 }}>נבחרו {mergeSel.size} צמתים — בחר איזה <span style={{ color: '#16A34A' }}>נשאר</span>:</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', maxWidth: 720 }}>
            {selectedNodes.map(n => {
              const isKeep = effectiveKeepId === n.id
              return (
                <button key={n.id} onClick={() => setKeepId(n.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    background: isKeep ? '#DCFCE7' : '#F1F5F9', color: isKeep ? '#166534' : '#475569', border: `1.5px solid ${isKeep ? '#16A34A' : '#E2E8F0'}` }}>
                  {isKeep ? '★ נשאר' : '○'} {n.name} <span style={{ opacity: 0.6 }}>(דור {n.generation})</span>
                  <span onClick={e => { e.stopPropagation(); toggleMerge(n.id) }} style={{ color: '#94A3B8', cursor: 'pointer', marginRight: 2 }}>✕</span>
                </button>
              )
            })}
            <div style={{ flex: 1 }} />
            <button onClick={() => setMergeConfirm(true)} disabled={mergeSel.size < 2}
              style={{ background: mergeSel.size < 2 ? '#C4B5FD' : '#9333EA', color: '#fff', border: 'none', borderRadius: 11, padding: '9px 18px', fontSize: 13, fontWeight: 800, cursor: mergeSel.size < 2 ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              מזג {mergeSel.size} צמתים
            </button>
            <button onClick={exitMerge} style={{ background: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: 11, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>ביטול</button>
          </div>
        </div>
      )}

      {/* מודאל אישור מיזוג */}
      {mergeConfirm && effectiveKeepId && (
        <Modal title="אישור מיזוג צמתים" onClose={() => setMergeConfirm(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.7 }}>
              {mergeSel.size - 1} צמתים ימוזגו אל <strong style={{ color: '#166534' }}>{nodes.find(n => n.id === effectiveKeepId)?.name}</strong>.
              <br />כל הילדים והנרשמים המשויכים יועברו אליו, והכפילים יימחקו.
            </p>
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 11, padding: '10px 14px', fontSize: 12, color: '#92400E' }}>
              ⚠ פעולה זו אינה הפיכה.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="מזג עכשיו" color="#9333EA" onClick={() => { setMergeConfirm(false); handleMerge() }} loading={merging} />
              <MBtn label="ביטול" color="#94A3B8" onClick={() => setMergeConfirm(false)} />
            </div>
          </div>
        </Modal>
      )}

      {/* מודאל אישור ייחוס לאחר מיזוג */}
      {approvePrompt && (
        <Modal title="אישור ייחוס" onClose={() => setApprovePrompt(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.7 }}>
              המיזוג הושלם. האם לאשר את הייחוס של <strong style={{ color: '#166534' }}>{approvePrompt.keepName}</strong> ולסמן אותו כ<strong>מאומת</strong>?
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155', cursor: 'pointer', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 11, padding: '10px 14px' }}>
              <input type="checkbox" checked={approveDesc} onChange={e => setApproveDesc(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#16A34A', cursor: 'pointer' }} />
              לאשר גם את כל המשורשרים אליו (הצאצאים)
            </label>
            <p style={{ margin: 0, fontSize: 12, color: '#94A3B8', lineHeight: 1.5 }}>
              ניתן גם להשאיר בסטטוס &quot;ממתין לאימות&quot; ולאשר ידנית בהמשך.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="אשר ייחוס" color="#16A34A" onClick={() => handleApproveLineage(approveDesc)} loading={approving} />
              <MBtn label="השאר ממתין לאימות" color="#94A3B8" onClick={() => setApprovePrompt(null)} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
