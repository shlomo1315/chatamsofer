'use client'
import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import EmailInput from '@/components/ui/EmailInput'
import { GitBranch, ChevronLeft, Loader2, Heart, User, Phone, MapPin, Users, FileText, Plus, X, CheckCircle2, Check } from 'lucide-react'
import { validateIsraeliId, validatePhone } from '@/lib/validation'
import CityStreetPicker from '@/components/ui/CityStreetPicker'
import HebrewDatePicker from '@/components/ui/HebrewDatePicker'

const GENDER_BTN_SEL: Record<string, string> = {
  male: 'bg-blue-100 text-blue-800 border-blue-400',
  female: 'bg-pink-100 text-pink-800 border-pink-400',
}
const GENDER_BTN_UNSEL = 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'

const MARITAL_OPTIONS = ['נשואים', 'גרוש', 'גרושה', 'אלמן', 'אלמנה']
const WIFE_PRIMARY_STATUSES = ['גרושה', 'אלמנה']
const MARRIED_STATUS = 'נשואים'

const STATUS_OPTIONS = [
  { value: 'pending', label: 'ממתין לאישור', sel: 'bg-amber-500 text-white border-amber-500', unsel: 'border-amber-300 text-amber-700 hover:bg-amber-50' },
  { value: 'approved', label: 'מאושר', sel: 'bg-green-600 text-white border-green-600', unsel: 'border-green-300 text-green-700 hover:bg-green-50' },
  { value: 'rejected', label: 'לא מאושר', sel: 'bg-red-600 text-white border-red-600', unsel: 'border-red-300 text-red-700 hover:bg-red-50' },
]

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface ChildEntry {
  name: string
  id_number: string
  doc_type: 'id' | 'passport'
  gender: string
  birth_date: string
  marital_status: string
  // נשמרים עבור ילדים שנכנסו דרך תיק יולדת — לא לאבד אותם בעריכה
  birth_status?: 'pending' | 'approved'
  maternity_aid_id?: string
}

function emptyChild(): ChildEntry {
  return { name: '', id_number: '', doc_type: 'id', gender: '', birth_date: '', marital_status: '' }
}

// סטטוס משפחתי לילד לפי מין: בן → נשוי/לא נשוי, בת → נשואה/לא נשואה
function maritalOptionsFor(gender: string): { value: string; label: string }[] {
  if (gender === 'male') return [{ value: 'married', label: 'נשוי' }, { value: 'single', label: 'לא נשוי' }]
  if (gender === 'female') return [{ value: 'married', label: 'נשואה' }, { value: 'single', label: 'לא נשואה' }]
  return []
}

interface LineageNode {
  id: string
  name: string
  generation: number
  parent_id: string | null
  status?: 'verified' | 'pending' | 'rejected'
}

// ─── Tree layout for picker ───

interface TreePickerNode extends LineageNode { children: TreePickerNode[] }
interface TreePickerPos { node: TreePickerNode; x: number; y: number; cx: number; cy: number }

const TP_NW = 172, TP_NH = 58, TP_HGAP = 48, TP_VGAP = 96, TP_PAD = 72

const TP_PALETTE = [
  { bg: 'linear-gradient(135deg,#7C3AED 0%,#5B21B6 100%)', ring: '#7C3AED', shadow: 'rgba(124,58,237,0.38)' },
  { bg: 'linear-gradient(135deg,#2563EB 0%,#1E40AF 100%)', ring: '#2563EB', shadow: 'rgba(37,99,235,0.32)'  },
  { bg: 'linear-gradient(135deg,#0891B2 0%,#0E7490 100%)', ring: '#0891B2', shadow: 'rgba(8,145,178,0.32)'  },
  { bg: 'linear-gradient(135deg,#059669 0%,#047857 100%)', ring: '#059669', shadow: 'rgba(5,150,105,0.32)'  },
  { bg: 'linear-gradient(135deg,#D97706 0%,#B45309 100%)', ring: '#D97706', shadow: 'rgba(217,119,6,0.32)'  },
  { bg: 'linear-gradient(135deg,#DB2777 0%,#BE185D 100%)', ring: '#DB2777', shadow: 'rgba(219,39,119,0.32)' },
]
const tpPal = (g: number) => TP_PALETTE[g % TP_PALETTE.length]

function tpBuildTree(flat: LineageNode[]): TreePickerNode[] {
  const map = new Map<string, TreePickerNode>()
  flat.forEach(n => map.set(n.id, { ...n, children: [] }))
  const roots: TreePickerNode[] = []
  flat.forEach(n => {
    const node = map.get(n.id)!
    if (n.parent_id && map.has(n.parent_id)) map.get(n.parent_id)!.children.push(node)
    else roots.push(node)
  })
  return roots
}

function tpSubtreeW(n: TreePickerNode): number {
  return n.children.length ? n.children.reduce((s, c) => s + tpSubtreeW(c), 0) : TP_NW + TP_HGAP
}

function tpLayout(roots: TreePickerNode[]): TreePickerPos[] {
  const result: TreePickerPos[] = []
  function place(n: TreePickerNode, x: number, y: number) {
    const sw = tpSubtreeW(n), cx = x + sw / 2
    result.push({ node: n, x: cx - TP_NW / 2, y, cx, cy: y + TP_NH / 2 })
    let cx2 = x
    n.children.forEach(c => { place(c, cx2, y + TP_NH + TP_VGAP); cx2 += tpSubtreeW(c) })
  }
  let sx = TP_PAD
  roots.forEach(r => { place(r, sx, TP_PAD); sx += tpSubtreeW(r) })
  return result
}

function tpCanvasSize(pos: TreePickerPos[]) {
  if (!pos.length) return { w: 800, h: 400 }
  return { w: Math.max(...pos.map(p => p.x + TP_NW)) + TP_PAD, h: Math.max(...pos.map(p => p.y + TP_NH)) + TP_PAD }
}

function tpEdges(positions: TreePickerPos[]) {
  const byId = new Map(positions.map(p => [p.node.id, p]))
  return positions.flatMap(p =>
    p.node.children.map(c => { const cp = byId.get(c.id); return cp ? { from: p, to: cp } : null })
      .filter(Boolean) as { from: TreePickerPos; to: TreePickerPos }[]
  )
}

function buildNodePath(nodeId: string, allNodes: LineageNode[]): string[] {
  const nodeMap = new Map(allNodes.map(n => [n.id, n]))
  const path: string[] = []
  let curr = nodeMap.get(nodeId)
  while (curr) {
    path.unshift(curr.name)
    curr = curr.parent_id ? nodeMap.get(curr.parent_id) : undefined
  }
  return path
}

function LineageTreePicker({
  initialNodeId,
  onSelect,
}: {
  initialNodeId?: string
  onSelect: (nodeId: string, path: string[]) => void
}) {
  const [allNodes, setAllNodes] = useState<LineageNode[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string>(initialNodeId ?? '')
  const [zoom, setZoom] = useState(0.65)
  const [tpSearch, setTpSearch] = useState('')
  const canvasRef = useRef<HTMLDivElement>(null)
  const didCenter = useRef(false)
  const tpDragRef = useRef<{ startX: number; startY: number; scrollX: number; scrollY: number } | null>(null)
  const tpZoomAnchor = useRef<{ px: number; py: number; offX: number; offY: number } | null>(null)

  useEffect(() => {
    fetch('/api/lineage?all=1')
      .then(r => r.json())
      .then(d => {
        const nodes: LineageNode[] = (d.nodes ?? []).filter((n: LineageNode) => (n.status ?? 'verified') === 'verified')
        setAllNodes(nodes)
        if (initialNodeId && nodes.length > 0) {
          const path = buildNodePath(initialNodeId, nodes)
          if (path.length > 0) onSelect(initialNodeId, path)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Passive wheel — שומר עוגן ומשנה zoom
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
        tpZoomAnchor.current = {
          px: (el.scrollLeft + offX) / prev,
          py: (el.scrollTop + offY) / prev,
          offX, offY,
        }
        return next
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [loading])

  // תיקון גלילה אחרי שינוי zoom — שמירת הנקודה מתחת לעכבר
  useLayoutEffect(() => {
    const el = canvasRef.current
    const a = tpZoomAnchor.current
    if (!el || !a) return
    el.scrollLeft = a.px * zoom - a.offX
    el.scrollTop = a.py * zoom - a.offY
    tpZoomAnchor.current = null
  }, [zoom])

  // Drag-to-pan
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      tpDragRef.current = { startX: e.clientX, startY: e.clientY, scrollX: el.scrollLeft, scrollY: el.scrollTop }
      el.style.cursor = 'grabbing'
    }
    const onMove = (e: MouseEvent) => {
      if (!tpDragRef.current) return
      const dx = e.clientX - tpDragRef.current.startX
      const dy = e.clientY - tpDragRef.current.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        e.preventDefault()
        el.scrollLeft = tpDragRef.current.scrollX - dx
        el.scrollTop  = tpDragRef.current.scrollY - dy
      }
    }
    const onUp = () => { tpDragRef.current = null; el.style.cursor = 'grab' }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [loading])

  const positions = useMemo(() => tpLayout(tpBuildTree(allNodes)), [allNodes])
  const edges = useMemo(() => tpEdges(positions), [positions])
  const { w, h } = useMemo(() => tpCanvasSize(positions), [positions])

  // הנתיב שנבחר: מהצומת הנבחר ועד השורש — כל הצמתים האלו יודגשו ויוגדלו
  const branch = useMemo(() => {
    const s = new Set<string>()
    if (!selected) return s
    const map = new Map(allNodes.map(n => [n.id, n]))
    let cur = map.get(selected)
    let guard = 0
    while (cur && guard < 60) { s.add(cur.id); cur = cur.parent_id ? map.get(cur.parent_id) : undefined; guard++ }
    return s
  }, [selected, allNodes])

  // Center horizontally on first load
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
  }, [positions.length, w, zoom])

  const nodeById = useMemo(() => new Map(allNodes.map(n => [n.id, n])), [allNodes])

  const searchResults = useMemo(() => {
    const q = tpSearch.trim().toLowerCase()
    if (!q) return []
    return allNodes.filter(n => n.name.toLowerCase().includes(q)).slice(0, 8)
  }, [tpSearch, allNodes])

  function scrollToNode(nodeId: string) {
    const pos = positions.find(p => p.node.id === nodeId)
    if (!pos || !canvasRef.current) return
    const el = canvasRef.current
    el.scrollTo({ left: Math.max(0, pos.cx * zoom - el.clientWidth / 2), top: Math.max(0, pos.y * zoom - el.clientHeight / 3), behavior: 'smooth' })
  }

  function handleNodeClick(pos: TreePickerPos) {
    const nodeId = pos.node.id
    setSelected(nodeId)
    onSelect(nodeId, buildNodePath(nodeId, allNodes))
  }

  function selectFromSearch(nodeId: string) {
    setSelected(nodeId)
    onSelect(nodeId, buildNodePath(nodeId, allNodes))
    setTpSearch('')
    setTimeout(() => scrollToNode(nodeId), 50)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 0', color: '#7C3AED' }}>
      <Loader2 size={16} className="animate-spin" />
      <span style={{ fontSize: 13 }}>טוען עץ דורות...</span>
    </div>
  )

  if (!allNodes.length) return (
    <div style={{ padding: 16, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>לא נמצאו נתוני שושלת</div>
  )

  return (
    <div style={{ direction: 'rtl' }}>
      {/* search + zoom controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 260 }}>
          <input
            type="text"
            value={tpSearch}
            onChange={e => setTpSearch(e.target.value)}
            placeholder="🔍 חיפוש שם בשושלת..."
            style={{ width: '100%', height: 30, borderRadius: 8, border: '1px solid #E2E8F0', padding: '0 10px', fontSize: 12, color: '#334155', outline: 'none', direction: 'rtl', fontFamily: 'inherit', background: '#fff' }}
          />
          {searchResults.length > 0 && (
            <div style={{ position: 'absolute', top: 34, right: 0, left: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
              {searchResults.map(n => {
                const parent = n.parent_id ? nodeById.get(n.parent_id) : null
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => selectFromSearch(n.id)}
                    style={{ display: 'block', width: '100%', textAlign: 'right', padding: '7px 11px', border: 'none', borderBottom: '1px solid #F1F5F9', background: '#fff', cursor: 'pointer', direction: 'rtl', fontFamily: 'inherit' }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{n.name}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>דור {n.generation}{parent ? ` · ${parent.name}` : ''}</div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
          <button type="button" onClick={() => setZoom(z => Math.min(2.5, z + 0.1))} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1', fontWeight: 700 }}>+</button>
          <button type="button" onClick={() => { setZoom(0.65); didCenter.current = false }} style={{ height: 26, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', fontSize: 10, cursor: 'pointer', padding: '0 7px', color: '#64748B', fontWeight: 600 }}>{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1', fontWeight: 700 }}>−</button>
        </div>
      </div>

      {/* tree canvas */}
      <div
        ref={canvasRef}
        dir="ltr"
        style={{
          overflow: 'auto',
          overflowAnchor: 'none',
          borderRadius: 14,
          background: 'linear-gradient(180deg,#FCFCFF 0%,#F7F5FF 100%)',
          border: '1.5px solid #E8E0F5',
          height: 380,
          cursor: 'grab',
        }}
      >
        <div style={{ position: 'relative', width: w * zoom, height: (h + 60) * zoom, minWidth: '100%' }}>
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} width={w * zoom} height={(h + 60) * zoom}>
            {edges.map((e, i) => {
              const x1 = e.from.cx * zoom, y1 = (e.from.y + TP_NH) * zoom
              const x2 = e.to.cx * zoom, y2 = e.to.y * zoom
              const mid = (y1 + y2) / 2
              const onBranch = branch.has(e.from.node.id) && branch.has(e.to.node.id)
              const col = onBranch ? tpPal(e.from.node.generation).ring : '#CBD5E1'
              const d = `M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" opacity={0.9} />
                  <path d={d} fill="none" stroke={col} strokeWidth={onBranch ? 3 : 2} strokeLinecap="round" opacity={onBranch ? 0.95 : 0.5} />
                </g>
              )
            })}
          </svg>

          {positions.map(pos => {
            const p = tpPal(pos.node.generation)
            const isSel = selected === pos.node.id   // הצומת האחרון שנבחר
            const onBranch = branch.has(pos.node.id)  // כל הצמתים בנתיב הנבחר
            return (
              <div
                key={pos.node.id}
                onClick={() => handleNodeClick(pos)}
                style={{
                  position: 'absolute',
                  left: pos.x * zoom, top: pos.y * zoom,
                  width: TP_NW * zoom, height: TP_NH * zoom,
                  borderRadius: 16 * zoom,
                  background: p.bg,
                  boxShadow: onBranch
                    ? `0 0 0 3px #fff, 0 0 0 ${isSel ? 6 : 5}px ${isSel ? '#22C55E' : p.ring}, 0 10px 28px ${p.shadow}`
                    : `0 4px 16px ${p.shadow}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  transform: isSel ? 'scale(1.12) translateY(-2px)' : onBranch ? 'scale(1.06)' : 'scale(1)',
                  transition: 'box-shadow .2s, transform .2s, opacity .2s',
                  zIndex: isSel ? 21 : onBranch ? 15 : 2, userSelect: 'none',
                  opacity: !selected || onBranch ? 1 : 0.4,
                }}>
                {/* generation badge */}
                <div style={{
                  position: 'absolute', top: -10 * zoom, right: 6 * zoom,
                  background: '#fff', color: p.ring,
                  fontSize: Math.max(7, 9 * zoom), fontWeight: 900,
                  width: 20 * zoom, height: 20 * zoom, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1.5px solid ${p.ring}`,
                }}>{pos.node.generation}</div>

                {/* checkmark on every node along the selected branch */}
                {onBranch && (
                  <div style={{
                    position: 'absolute', top: -10 * zoom, left: 6 * zoom,
                    width: 20 * zoom, height: 20 * zoom, borderRadius: '50%',
                    background: '#22C55E', border: '2px solid #fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Check size={9 * zoom} color="#fff" strokeWidth={3} />
                  </div>
                )}

                {/* name */}
                <span style={{
                  color: '#fff', fontWeight: 700,
                  fontSize: Math.max(8, (pos.node.name.length > 14 ? 10 : pos.node.name.length > 10 ? 12 : 13) * zoom),
                  textAlign: 'center', direction: 'rtl',
                  padding: `0 ${12 * zoom}px`, lineHeight: 1.3,
                  textShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  maxWidth: (TP_NW - 14) * zoom,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical' as const,
                }}>{pos.node.name}</span>
              </div>
            )
          })}
        </div>
      </div>
      <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 5, textAlign: 'center' }}>
        לחץ על שם לבחירה · גלגל עכבר להגדלה/הקטנה
      </p>
    </div>
  )
}

function Section({ title, icon: Icon, children }: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Field({ label, required, error, children }: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">
        {label}{required && <span className="text-red-500 mr-1">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

function FInput({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400 w-full ${className}`}
      {...props}
    />
  )
}

// Reusable ID / passport selector + matching input
function DocTypeField({
  label,
  required,
  docType,
  value,
  error,
  onDocType,
  onValue,
  onBlur,
  checking,
}: {
  label: string
  required?: boolean
  docType: 'id' | 'passport'
  value: string
  error?: string
  onDocType: (t: 'id' | 'passport') => void
  onValue: (v: string) => void
  onBlur?: () => void
  checking?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-slate-600">
        {label}{required && <span className="text-red-500 mr-1">*</span>}
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onDocType('id')}
          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
            docType === 'id'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
          }`}
        >
          תעודת זהות
        </button>
        <button
          type="button"
          onClick={() => onDocType('passport')}
          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
            docType === 'passport'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
          }`}
        >
          דרכון
        </button>
      </div>
      <FInput
        value={value}
        onChange={e => onValue(e.target.value)}
        onBlur={onBlur}
        placeholder={docType === 'id' ? '123456789' : 'מספר דרכון'}
        dir="ltr"
        inputMode={docType === 'id' ? 'numeric' : 'text'}
        maxLength={docType === 'id' ? 9 : 20}
        required={required}
      />
      {checking && <p className="text-xs text-slate-400">בודק אם תעודת הזהות כבר קיימת...</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

interface FormState {
  family_name: string
  id_number: string
  id_doc_type: 'id' | 'passport'
  full_name: string
  phone: string
  phone2: string
  email: string
  address: string
  city: string
  birth_date: string
  gender: string
  marital_status: string
  spouse_name: string
  spouse_id_number: string
  spouse_doc_type: 'id' | 'passport'
  spouse_birth_date: string
  spouse_phone: string
  children_count: string
  notes: string
  lineage_node_id: string
  eligibility_status: string
}

interface Props {
  defaultValues?: Partial<FormState & { lineage_node_id: string; children: ChildEntry[]; lineage_manual: string[] }>
  beneficiaryId?: string
}

export default function BeneficiaryForm({ defaultValues, beneficiaryId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const isEdit = !!beneficiaryId

  const [form, setForm] = useState<FormState>({
    family_name: defaultValues?.family_name ?? '',
    id_number: defaultValues?.id_number ?? '',
    id_doc_type: defaultValues?.id_doc_type ?? 'id',
    full_name: defaultValues?.full_name ?? '',
    phone: defaultValues?.phone ?? '',
    phone2: defaultValues?.phone2 ?? '',
    email: defaultValues?.email ?? '',
    address: defaultValues?.address ?? '',
    city: defaultValues?.city ?? '',
    birth_date: defaultValues?.birth_date ?? '',
    gender: defaultValues?.gender ?? '',
    marital_status: defaultValues?.marital_status ?? '',
    spouse_name: defaultValues?.spouse_name ?? '',
    spouse_id_number: defaultValues?.spouse_id_number ?? '',
    spouse_doc_type: defaultValues?.spouse_doc_type ?? 'id',
    spouse_birth_date: defaultValues?.spouse_birth_date ?? '',
    spouse_phone: defaultValues?.spouse_phone ?? '',
    children_count: String(defaultValues?.children_count ?? '0'),
    notes: defaultValues?.notes ?? '',
    lineage_node_id: defaultValues?.lineage_node_id ?? '',
    eligibility_status: defaultValues?.eligibility_status ?? 'pending',
  })
  const [lineagePath, setLineagePath] = useState<string[]>([])
  const [manualLineage, setManualLineage] = useState<string[]>(
    Array.isArray(defaultValues?.lineage_manual) ? defaultValues!.lineage_manual : []
  )
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestName, setSuggestName] = useState('')
  const [suggestParentId, setSuggestParentId] = useState('')
  const [suggestSubmitting, setSuggestSubmitting] = useState(false)
  const [suggestError, setSuggestError] = useState('')
  const [allLineageNodes, setAllLineageNodes] = useState<{ id: string; name: string; generation: number }[]>([])
  const [children, setChildren] = useState<ChildEntry[]>(
    Array.isArray(defaultValues?.children) ? defaultValues!.children : []
  )
  const [childErrors, setChildErrors] = useState<Partial<Record<keyof ChildEntry, string>>[]>([])
  const [checkingId, setCheckingId] = useState(false)
  // חלונית הצלחה לאחר שמירה (נסגרת אוטומטית אחרי 3 שניות)
  const [savedInfo, setSavedInfo] = useState<{ name: string; details: string[] } | null>(null)

  // בדיקת כפילות תעודת זהות בזמן אמת (כשעוזבים את השדה)
  const checkDuplicateId = useCallback(async () => {
    const raw = form.id_number.trim()
    if (!raw) return
    const normalized = form.id_doc_type === 'id' ? raw.replace(/\D/g, '') : raw
    if (!normalized) return
    setCheckingId(true)
    try {
      let q = supabase.from('beneficiaries').select('id, full_name, family_name').eq('id_number', normalized)
      if (isEdit && beneficiaryId) q = q.neq('id', beneficiaryId)
      const { data } = await q.maybeSingle()
      if (data) {
        const who = [data.family_name, data.full_name].filter(Boolean).join(' ')
        setErrors(prev => ({ ...prev, id_number: `תעודת זהות זו כבר קיימת במערכת${who ? ` (${who})` : ''} — לא ניתן לרשום אותה שוב` }))
      } else {
        setErrors(prev => {
          if (!prev.id_number?.includes('כבר קיימת')) return prev
          const next = { ...prev }; delete next.id_number; return next
        })
      }
    } catch { /* שגיאת רשת — נבדוק שוב בשמירה */ }
    setCheckingId(false)
  }, [form.id_number, form.id_doc_type, isEdit, beneficiaryId, supabase])

  const set = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const handleChildrenCount = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setForm(f => ({ ...f, children_count: raw }))
    const n = Math.max(0, Math.min(30, parseInt(raw) || 0))
    setChildren(prev => {
      const next = prev.slice(0, n)
      while (next.length < n) next.push(emptyChild())
      return next
    })
  }

  const setChild = <K extends keyof ChildEntry>(idx: number, key: K, value: ChildEntry[K]) =>
    setChildren(prev => prev.map((c, i) => (i === idx ? { ...c, [key]: value } : c)))

  // אישור לידה מתוך עריכת המשפחה — מסנכרן את תיק היולדת ל"מאושר" ומסמן את הילד
  const [approvingIdx, setApprovingIdx] = useState<number | null>(null)
  const approveBirth = async (idx: number) => {
    const child = children[idx]
    if (!child.maternity_aid_id) return
    setApprovingIdx(idx)
    try {
      const { error } = await supabase.from('maternity_aids').update({ status: 'active' }).eq('id', child.maternity_aid_id)
      if (error) throw error
      setChild(idx, 'birth_status', 'approved')
    } catch (e) {
      alert(`שגיאה באישור הלידה: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setApprovingIdx(null)
    }
  }

  // Derived flags
  const hasMaritalStatus = !!form.marital_status              // personal details appear only after a status is chosen
  const primaryIsWife = WIFE_PRIMARY_STATUSES.includes(form.marital_status)
  const primaryGender = primaryIsWife ? 'female' : 'male'
  const showWifeFields = form.marital_status === MARRIED_STATUS  // spouse data exists only when married
  const showHusbandSection = hasMaritalStatus && !primaryIsWife        // גרוש, אלמן, נשואים
  const showWifeSection = hasMaritalStatus && (primaryIsWife || showWifeFields) // גרושה, אלמנה, נשואים

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {}

    if (!form.marital_status) errs.marital_status = 'יש לבחור מצב משפחתי'

    if (!form.family_name.trim()) errs.family_name = 'שדה חובה'

    if (!form.id_number.trim()) errs.id_number = 'שדה חובה'
    else if (form.id_doc_type === 'id' && !validateIsraeliId(form.id_number)) {
      errs.id_number = 'תעודת זהות ישראלית לא תקינה (כולל ספרת ביקורת)'
    }

    if (!form.full_name.trim()) errs.full_name = 'שדה חובה'
    if (!form.birth_date) errs.birth_date = 'שדה חובה'

    if (showWifeFields) {
      if (!form.spouse_name.trim()) errs.spouse_name = 'שדה חובה'
      if (!form.spouse_id_number.trim()) errs.spouse_id_number = 'שדה חובה'
      else if (form.spouse_doc_type === 'id' && !validateIsraeliId(form.spouse_id_number)) {
        errs.spouse_id_number = 'תעודת זהות ישראלית לא תקינה (כולל ספרת ביקורת)'
      } else if (form.id_doc_type === 'id' && form.spouse_doc_type === 'id' && form.spouse_id_number.replace(/\D/g, '') === form.id_number.replace(/\D/g, '')) {
        errs.spouse_id_number = 'תעודת הזהות של האישה זהה לתעודת הזהות של הבעל'
      }
      if (!form.spouse_birth_date) errs.spouse_birth_date = 'שדה חובה'
      if (form.spouse_phone && !validatePhone(form.spouse_phone)) {
        errs.spouse_phone = 'אנא הזן מספר נייד תקין המתחיל ב-05'
      } else if (form.spouse_phone && form.phone && form.spouse_phone.replace(/\D/g, '') === form.phone.replace(/\D/g, '')) {
        errs.spouse_phone = 'מספר הטלפון של האישה זהה למספר הטלפון של הבעל'
      }
    }

    if (!form.phone.trim()) errs.phone = 'שדה חובה'
    if (!form.email.trim()) errs.email = 'שדה חובה'
    else if (!EMAIL_REGEX.test(form.email.trim())) errs.email = 'אימייל לא תקין'

    if (!form.address.trim()) errs.address = 'שדה חובה'
    if (!form.city.trim()) errs.city = 'שדה חובה'

    if (!form.lineage_node_id) errs.lineage_node_id = 'יש לבחור שיוך שושלת'

    const childErrs: Partial<Record<keyof ChildEntry, string>>[] = children.map(c => {
      const ce: Partial<Record<keyof ChildEntry, string>> = {}
      if (!c.name.trim()) ce.name = 'שדה חובה'
      if (!c.gender) ce.gender = 'שדה חובה'
      if (!c.marital_status) ce.marital_status = 'שדה חובה'
      if (!c.birth_date) ce.birth_date = 'שדה חובה'
      if (!c.id_number.trim()) ce.id_number = 'שדה חובה'
      else if (c.doc_type === 'id' && !validateIsraeliId(c.id_number)) {
        ce.id_number = 'תעודת זהות ישראלית לא תקינה (כולל ספרת ביקורת)'
      }
      return ce
    })
    setChildErrors(childErrs)
    const hasChildErrors = childErrs.some(ce => Object.keys(ce).length > 0)

    setErrors(errs)
    return Object.keys(errs).length === 0 && !hasChildErrors
  }

  const handleSuggestLineage = async () => {
    if (!suggestName.trim()) { setSuggestError('נא להזין שם'); return }
    if (!suggestParentId) { setSuggestError('נא לבחור הורה בעץ'); return }
    setSuggestSubmitting(true); setSuggestError('')
    try {
      const res = await fetch('/api/portal/suggest-lineage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: suggestName.trim(), parent_id: suggestParentId || null }),
      })
      const data = await res.json()
      if (!res.ok) { setSuggestError(data.error || 'שגיאה'); return }
      const node = data.node
      const parent = allLineageNodes.find(n => n.id === suggestParentId)
      setForm(f => ({ ...f, lineage_node_id: node.id }))
      setLineagePath([...(parent ? [`דור ${parent.generation} — ${parent.name}`] : []), `${node.name} (ממתין לאימות)`])
      setSuggestOpen(false); setSuggestName(''); setSuggestParentId('')
    } catch { setSuggestError('שגיאת רשת') }
    finally { setSuggestSubmitting(false) }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      const normalizedId = form.id_doc_type === 'id' ? form.id_number.replace(/\D/g, '') : form.id_number.trim()

      // בדיקת כפילות תעודת זהות — לא ניתן לרשום ת.ז. שכבר קיימת בכרטסת אחרת
      let dupQuery = supabase.from('beneficiaries').select('id').eq('id_number', normalizedId)
      if (isEdit && beneficiaryId) dupQuery = dupQuery.neq('id', beneficiaryId)
      const { data: dup } = await dupQuery.maybeSingle()
      if (dup) {
        setErrors(prev => ({ ...prev, id_number: 'תעודת זהות זו כבר קיימת במערכת — לא ניתן לרשום אותה שוב' }))
        setSaving(false)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }

      const payload = {
        family_name: form.family_name.trim(),
        id_number: normalizedId,
        id_doc_type: form.id_doc_type,
        full_name: form.full_name.trim(),
        phone: form.phone || null,
        phone2: form.phone2 || null,
        email: form.email || null,
        address: form.address || null,
        city: form.city || null,
        birth_date: form.birth_date || null,
        gender: primaryGender,
        marital_status: form.marital_status || null,
        spouse_name: showWifeFields ? (form.spouse_name || null) : null,
        spouse_id_number: showWifeFields
          ? ((form.spouse_doc_type === 'id' ? form.spouse_id_number.replace(/\D/g, '') : form.spouse_id_number.trim()) || null)
          : null,
        spouse_doc_type: showWifeFields ? form.spouse_doc_type : null,
        spouse_birth_date: showWifeFields ? (form.spouse_birth_date || null) : null,
        spouse_phone: showWifeFields ? (form.spouse_phone || null) : null,
        children_count: children.length,
        children: children.map(c => ({
          name: c.name.trim(),
          id_number: c.id_number.trim()
            ? (c.doc_type === 'id' ? c.id_number.replace(/\D/g, '') : c.id_number.trim())
            : null,
          doc_type: c.doc_type,
          gender: c.gender || null,
          birth_date: c.birth_date || null,
          marital_status: c.marital_status || null,
          // שמירת סימוני תיק היולדת אם קיימים (כדי לא לאבד אותם בעריכה)
          ...(c.birth_status ? { birth_status: c.birth_status } : {}),
          ...(c.maternity_aid_id ? { maternity_aid_id: c.maternity_aid_id } : {}),
        })),
        notes: form.notes || null,
        lineage_node_id: form.lineage_node_id || null,
        lineage_manual: manualLineage.map(s => s.trim()).filter(Boolean),
        eligibility_status: form.eligibility_status || 'pending',
        updated_at: new Date().toISOString(),
      }

      const familyName = payload.family_name || payload.full_name || ''
      const details = [
        `ת.ז. ${payload.id_number}`,
        payload.phone ? `טלפון ${payload.phone}` : '',
        payload.city ? `עיר ${payload.city}` : '',
        `${children.length} ילדים`,
      ].filter(Boolean)

      let targetId = beneficiaryId
      if (isEdit) {
        const { error } = await supabase.from('beneficiaries').update(payload).eq('id', beneficiaryId)
        if (error) throw error
      } else {
        const { data: inserted, error } = await supabase
          .from('beneficiaries')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        targetId = inserted.id
      }

      // חלונית "נשמר בהצלחה" — מציגה את הפרטים ל-3 שניות ואז נסגרת ומנווטת
      setSavedInfo({ name: familyName, details })
      setTimeout(() => {
        router.push(`/admin/beneficiaries/${targetId}`)
        router.refresh()
      }, 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      alert(`שגיאה בשמירה: ${msg}`)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">

      {/* ── Success modal (auto-closes after 3s) ── */}
      {savedInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-7 w-full max-w-sm mx-4 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={30} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">השינויים נשמרו בהצלחה</h3>
            <p className="text-sm text-slate-500 mt-1">למשפחת {savedInfo.name}</p>
            {savedInfo.details.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {savedInfo.details.map((d, i) => (
                  <span key={i} className="text-xs text-slate-600 bg-slate-100 rounded-full px-2.5 py-1">{d}</span>
                ))}
              </div>
            )}
            <div className="mt-5 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 animate-[shrink_3s_linear_forwards]" />
            </div>
          </div>
        </div>
      )}

      {/* ── Registration status ── */}
      <Section title="סטטוס רישום" icon={FileText}>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setForm(f => ({ ...f, eligibility_status: opt.value }))}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                form.eligibility_status === opt.value ? opt.sel : `bg-white ${opt.unsel}`
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Marital status ── */}
      <Section title="מצב משפחתי" icon={Heart}>
        <div className="flex flex-wrap gap-2">
          {MARITAL_OPTIONS.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => setForm(f => ({ ...f, marital_status: opt }))}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                form.marital_status === opt
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
        {errors.marital_status && <p className="text-xs text-red-500 mt-2">{errors.marital_status}</p>}
      </Section>

      {/* ── Husband section ── */}
      {showHusbandSection && (
        <Section title="פרטי הבעל" icon={User}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="שם משפחה" required error={errors.family_name}>
              <FInput value={form.family_name} onChange={set('family_name')} placeholder="שם משפחה" required />
            </Field>
            <Field label="שם הבעל (שם פרטי)" required error={errors.full_name}>
              <FInput value={form.full_name} onChange={set('full_name')} placeholder="שם פרטי" required />
            </Field>
            <DocTypeField
              label="מסמך זיהוי"
              required
              docType={form.id_doc_type}
              value={form.id_number}
              error={errors.id_number}
              checking={checkingId}
              onBlur={checkDuplicateId}
              onDocType={t => setForm(f => ({ ...f, id_doc_type: t }))}
              onValue={v => setForm(f => ({ ...f, id_number: v }))}
            />
            <Field label="תאריך לידה" required error={errors.birth_date}>
              <HebrewDatePicker value={form.birth_date} onChange={iso => setForm(f => ({ ...f, birth_date: iso }))} maxToday />
            </Field>
            <Field label="מספר ילדים" required>
              <FInput type="number" min="0" max="30" value={form.children_count} onChange={handleChildrenCount} required />
            </Field>
          </div>
        </Section>
      )}

      {/* ── Wife section ── */}
      {showWifeSection && (
        <Section title="פרטי האישה" icon={Heart}>
          {primaryIsWife ? (
            /* Woman is primary person (גרושה / אלמנה) */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="שם משפחה" required error={errors.family_name}>
                <FInput value={form.family_name} onChange={set('family_name')} placeholder="שם משפחה" required />
              </Field>
              <Field label="שם האישה (שם פרטי)" required error={errors.full_name}>
                <FInput value={form.full_name} onChange={set('full_name')} placeholder="שם פרטי" required />
              </Field>
              <DocTypeField
                label="מסמך זיהוי"
                required
                docType={form.id_doc_type}
                value={form.id_number}
                error={errors.id_number}
                checking={checkingId}
                onBlur={checkDuplicateId}
                onDocType={t => setForm(f => ({ ...f, id_doc_type: t }))}
                onValue={v => setForm(f => ({ ...f, id_number: v }))}
              />
              <Field label="תאריך לידה" required error={errors.birth_date}>
                <HebrewDatePicker value={form.birth_date} onChange={iso => setForm(f => ({ ...f, birth_date: iso }))} maxToday />
              </Field>
              <Field label="מספר ילדים" required>
                <FInput type="number" min="0" max="30" value={form.children_count} onChange={handleChildrenCount} required />
              </Field>
            </div>
          ) : (
            /* Woman is spouse (נשואים) */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="שם האישה" required error={errors.spouse_name}>
                <FInput value={form.spouse_name} onChange={set('spouse_name')} placeholder="שם מלא" required />
              </Field>
              <DocTypeField
                label="מסמך זיהוי האישה"
                required
                docType={form.spouse_doc_type}
                value={form.spouse_id_number}
                error={errors.spouse_id_number}
                onDocType={t => setForm(f => ({ ...f, spouse_doc_type: t }))}
                onValue={v => { setForm(f => ({ ...f, spouse_id_number: v })); setErrors(prev => ({ ...prev, spouse_id_number: undefined })) }}
                onBlur={() => {
                  const sid = form.spouse_id_number.trim()
                  if (!sid) { setErrors(prev => ({ ...prev, spouse_id_number: undefined })); return }
                  if (form.spouse_doc_type === 'id' && !validateIsraeliId(sid)) {
                    setErrors(prev => ({ ...prev, spouse_id_number: 'תעודת זהות ישראלית לא תקינה (כולל ספרת ביקורת)' }))
                  } else if (form.id_doc_type === 'id' && form.spouse_doc_type === 'id' && sid.replace(/\D/g, '') === form.id_number.replace(/\D/g, '')) {
                    setErrors(prev => ({ ...prev, spouse_id_number: 'תעודת הזהות של האישה זהה לתעודת הזהות של הבעל' }))
                  } else {
                    setErrors(prev => ({ ...prev, spouse_id_number: undefined }))
                  }
                }}
              />
              <Field label="תאריך לידה האישה" required error={errors.spouse_birth_date}>
                <HebrewDatePicker value={form.spouse_birth_date} onChange={iso => setForm(f => ({ ...f, spouse_birth_date: iso }))} maxToday />
              </Field>
              <Field label="טלפון האישה" error={errors.spouse_phone}>
                <FInput type="tel" value={form.spouse_phone}
                  onChange={e => { setForm(f => ({ ...f, spouse_phone: e.target.value })); setErrors(prev => ({ ...prev, spouse_phone: undefined })) }}
                  onBlur={() => {
                    const sp = form.spouse_phone.trim()
                    if (!sp) { setErrors(prev => ({ ...prev, spouse_phone: undefined })); return }
                    if (!validatePhone(sp)) {
                      setErrors(prev => ({ ...prev, spouse_phone: 'אנא הזן מספר נייד תקין המתחיל ב-05' }))
                    } else if (form.phone && sp.replace(/\D/g, '') === form.phone.replace(/\D/g, '')) {
                      setErrors(prev => ({ ...prev, spouse_phone: 'מספר הטלפון של האישה זהה למספר הטלפון של הבעל' }))
                    } else {
                      setErrors(prev => ({ ...prev, spouse_phone: undefined }))
                    }
                  }}
                  placeholder="0500000000" dir="ltr" maxLength={11} />
              </Field>
            </div>
          )}
        </Section>
      )}

      {/* ── Children details ── */}
      {children.length > 0 && (
        <Section title={`פרטי הילדים (${children.length})`} icon={Users}>
          <div className="flex flex-col gap-4">
            {children.map((child, idx) => (
              <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-xs font-semibold text-indigo-600">ילד/ה {idx + 1}</p>
                  {child.birth_status === 'approved' && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">לידה מאושרת</span>
                  )}
                  {child.birth_status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">ממתין לאישור לידה</span>
                      <button type="button" onClick={() => approveBirth(idx)} disabled={approvingIdx === idx}
                        className="inline-flex items-center gap-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 px-2.5 py-1 rounded-lg transition-colors">
                        {approvingIdx === idx ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} אשר לידה
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="שם הילד/ה" required error={childErrors[idx]?.name}>
                    <FInput
                      value={child.name}
                      onChange={e => setChild(idx, 'name', e.target.value)}
                      placeholder="שם מלא"
                      required
                    />
                  </Field>
                  <Field label="מין" required error={childErrors[idx]?.gender}>
                    <div className="flex gap-2">
                      {[{ v: 'male', l: 'בן' }, { v: 'female', l: 'בת' }].map(({ v, l }) => (
                        <button key={v} type="button"
                          onClick={() => { setChild(idx, 'gender', v); setChild(idx, 'marital_status', '') }}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            child.gender === v ? GENDER_BTN_SEL[v] : GENDER_BTN_UNSEL
                          }`}
                        >{l}</button>
                      ))}
                    </div>
                  </Field>
                  <Field label="תאריך לידה" required error={childErrors[idx]?.birth_date}>
                    <HebrewDatePicker value={child.birth_date} onChange={iso => setChild(idx, 'birth_date', iso)} maxToday />
                  </Field>
                  {child.gender && (
                  <Field label="מצב משפחתי" required error={childErrors[idx]?.marital_status}>
                    <div className="flex gap-2">
                      {maritalOptionsFor(child.gender).map(o => (
                        <button key={o.value} type="button"
                          onClick={() => setChild(idx, 'marital_status', o.value)}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            child.marital_status === o.value
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400'
                          }`}
                        >{o.label}</button>
                      ))}
                    </div>
                  </Field>
                  )}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">
                      מסמך זיהוי <span className="text-red-500 mr-1">*</span>
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setChild(idx, 'doc_type', 'id')}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                          child.doc_type === 'id'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
                        }`}
                      >
                        ת&quot;ז
                      </button>
                      <button
                        type="button"
                        onClick={() => setChild(idx, 'doc_type', 'passport')}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                          child.doc_type === 'passport'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
                        }`}
                      >
                        דרכון
                      </button>
                    </div>
                    <FInput
                      value={child.id_number}
                      onChange={e => { setChild(idx, 'id_number', e.target.value); setChildErrors(prev => prev.map((ce, i) => i === idx ? { ...ce, id_number: undefined } : ce)) }}
                      onBlur={() => {
                        const val = child.id_number.trim()
                        if (!val) {
                          setChildErrors(prev => prev.map((ce, i) => i === idx ? { ...ce, id_number: 'שדה חובה' } : ce))
                        } else if (child.doc_type === 'id' && !validateIsraeliId(val)) {
                          setChildErrors(prev => prev.map((ce, i) => i === idx ? { ...ce, id_number: 'תעודת זהות ישראלית לא תקינה (כולל ספרת ביקורת)' } : ce))
                        } else {
                          setChildErrors(prev => prev.map((ce, i) => i === idx ? { ...ce, id_number: undefined } : ce))
                        }
                      }}
                      placeholder={child.doc_type === 'id' ? '123456789' : 'מספר דרכון'}
                      dir="ltr"
                      inputMode={child.doc_type === 'id' ? 'numeric' : 'text'}
                      maxLength={child.doc_type === 'id' ? 9 : 20}
                      required
                    />
                    {childErrors[idx]?.id_number && (
                      <p className="text-xs text-red-500">{childErrors[idx].id_number}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Contact ── */}
      <Section title="פרטי קשר" icon={Phone}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="טלפון ראשי" required error={errors.phone}>
            <FInput type="tel" value={form.phone} onChange={set('phone')} placeholder="050-0000000" dir="ltr" required />
          </Field>
          <Field label="טלפון נוסף">
            <FInput type="tel" value={form.phone2} onChange={set('phone2')} placeholder="050-0000000" dir="ltr" />
          </Field>
          <Field label="אימייל" required error={errors.email}>
            <EmailInput value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="name@example.com" required />
          </Field>
        </div>
      </Section>

      {/* ── Address ── */}
      <Section title="כתובת" icon={MapPin}>
        <CityStreetPicker
          city={form.city}
          address={form.address}
          onCityChange={v => setForm(f => ({ ...f, city: v }))}
          onAddressChange={v => setForm(f => ({ ...f, address: v }))}
          cityError={errors.city}
          addressError={errors.address}
          cityRequired
          addressRequired
          labelSize="xs"
        />
      </Section>

      {/* ── Lineage ── */}
      <Section title="שיוך שושלת *" icon={GitBranch}>
        <p className="text-xs text-slate-500 mb-3">
          בחר את הענף שהצאצא שייך אליו. לחץ על שם ואז המשך לבחור את הדור הבא.
        </p>
        {errors.lineage_node_id && (
          <p className="text-xs text-red-500 mb-3">{errors.lineage_node_id}</p>
        )}

        {(form.lineage_node_id || lineagePath.length > 0) && (
          <div className="flex items-center gap-1 flex-wrap mb-3 p-2.5 bg-indigo-50 rounded-lg border border-indigo-100">
            <span className="text-xs text-indigo-600 font-medium ml-1">נבחר:</span>
            {lineagePath.map((name, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronLeft size={11} className="text-indigo-300" />}
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  i === lineagePath.length - 1
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'bg-indigo-100 text-indigo-700'
                }`}>
                  {name}
                </span>
              </span>
            ))}
          </div>
        )}

        <LineageTreePicker
          initialNodeId={form.lineage_node_id}
          onSelect={(nodeId, path) => {
            setForm(f => ({ ...f, lineage_node_id: nodeId }))
            setLineagePath(path)
          }}
        />

        {form.lineage_node_id && (
          <button
            type="button"
            onClick={() => { setForm(f => ({ ...f, lineage_node_id: '' })); setLineagePath([]); setManualLineage([]) }}
            className="mt-2 text-xs text-slate-400 hover:text-slate-600 underline"
          >
            נקה בחירה
          </button>
        )}

        {/* Suggest new node */}
        <div className="mt-3 pt-3 border-t border-slate-100">
          {!suggestOpen ? (
            <button type="button"
              onClick={() => {
                setSuggestOpen(true)
                if (allLineageNodes.length === 0) {
                  fetch('/api/lineage?all=1').then(r => r.json()).then(d => {
                    setAllLineageNodes((d.nodes ?? []).filter((n: { status?: string }) => (n.status ?? 'verified') === 'verified'))
                  }).catch(() => {})
                }
              }}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 border border-amber-200 hover:border-amber-400 bg-amber-50 hover:bg-amber-100 rounded-lg px-3 py-1.5 transition-colors"
            >
              <Plus size={13} />
              הדור לא מופיע בעץ — הצע צומת חדש
            </button>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-xs font-semibold text-amber-800">הצע דור חדש לעץ השושלת</p>
              <p className="text-xs text-amber-700">הצומת ייכנס לעץ בסטטוס "ממתין לאימות" עד שיאושר.</p>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">שם האדם *</label>
                <FInput value={suggestName} onChange={e => setSuggestName(e.target.value)} placeholder="שם מלא" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">הורה בעץ (הדור שמעליו)</label>
                <select value={suggestParentId} onChange={e => setSuggestParentId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
                  <option value="">— בחר הורה —</option>
                  {allLineageNodes
                    .slice().sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name, 'he'))
                    .map(n => (
                      <option key={n.id} value={n.id}>דור {n.generation} — {n.name}</option>
                    ))}
                </select>
              </div>
              {suggestError && <p className="text-xs text-red-600">{suggestError}</p>}
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={handleSuggestLineage} loading={suggestSubmitting}>
                  שלח לאישור
                </Button>
                <Button type="button" size="sm" variant="ghost"
                  onClick={() => { setSuggestOpen(false); setSuggestName(''); setSuggestParentId(''); setSuggestError('') }}>
                  ביטול
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Manual generations (דור 5 ומעלה) — appear after a branch is fully selected */}
        {form.lineage_node_id && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-600 mb-1">
              המשך דורות (דור {lineagePath.length + 1} ומעלה)
            </p>
            <p className="text-xs text-slate-400 mb-3">
              אם הצאצא שייך לדור שאינו ברשימה, הוסף כאן את שמות הדורות הבאים ידנית.
            </p>

            <div className="flex flex-col gap-2">
              {manualLineage.map((val, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-14 flex-shrink-0">
                    דור {lineagePath.length + 1 + idx}
                  </span>
                  <FInput
                    value={val}
                    onChange={e =>
                      setManualLineage(prev => prev.map((v, i) => (i === idx ? e.target.value : v)))
                    }
                    placeholder="שם"
                  />
                  <button
                    type="button"
                    onClick={() => setManualLineage(prev => prev.filter((_, i) => i !== idx))}
                    className="text-slate-300 hover:text-red-500 flex-shrink-0"
                    aria-label="הסר דור"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setManualLineage(prev => [...prev, ''])}
              className="mt-3 flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 rounded-lg px-3 py-1.5 transition-colors"
            >
              <Plus size={14} />
              הוסף דור {lineagePath.length + 1 + manualLineage.length}
            </button>
          </div>
        )}
      </Section>

      {/* ── Notes ── */}
      <Section title="הערות" icon={FileText}>
        <textarea
          value={form.notes}
          onChange={set('notes')}
          rows={3}
          placeholder="הערות נוספות..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </Section>

      {Object.keys(errors).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          יש שדות חובה שלא מולאו או שאינם תקינים. אנא בדוק את השדות המסומנים באדום.
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <Button type="button" variant="secondary" onClick={() => router.back()}>ביטול</Button>
        <Button type="submit" loading={saving}>
          {isEdit ? 'שמור שינויים' : 'רישום צאצא'}
        </Button>
      </div>
    </form>
  )
}
