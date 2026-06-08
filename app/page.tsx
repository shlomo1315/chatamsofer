'use client'
import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import CityStreetPicker from '@/components/ui/CityStreetPicker'
import {
  Search, AlertCircle, Loader2, CheckCircle2, User,
  Baby, CreditCard, Gift, ChevronLeft, Phone, MapPin, Mail,
  Users, GitBranch, Heart, ArrowRight, Clock, Shield, Plus, Trash2, Check, X, Upload, FileText,
} from 'lucide-react'

// ─── Types ───

type Step =
  | 'id-lookup'
  | 'not-found'
  | 'found-as-child'
  | 'register'
  | 'register-success'
  | 'dashboard'
  | 'docs-needed'
  | 'widow-dashboard'
  | 'new-birth'
  | 'new-loan'
  | 'request-sent'

interface ChildMatchData {
  parentName: string
  childData: { name: string; id_number: string; birth_date: string; gender: string; marital_status: string }
}

interface FoundBeneficiary {
  id: string
  full_name: string
  family_name?: string
  eligibility_status: string
  phone?: string
  city?: string
  marital_status?: string
  children?: Array<{ name?: string; birth_date?: string; gender?: string }>
  created_at: string
}

// ─── Constants ───

const GENDER_BTN_SEL: Record<string, string> = {
  male: 'bg-blue-100 text-blue-800 border-blue-400',
  female: 'bg-pink-100 text-pink-800 border-pink-400',
}
const GENDER_BTN_UNSEL = 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'

const MARITAL_OPTIONS = [
  { value: 'נשואים', label: 'נשואים' },
  { value: 'גרוש', label: 'גרוש' },
  { value: 'גרושה', label: 'גרושה' },
  { value: 'אלמן', label: 'אלמן' },
  { value: 'אלמנה', label: 'אלמנה' },
]
const MARRIED_STATUSES = ['נשואים']

const LOAN_PURPOSES = [
  { value: 'נישואי הבן/הבת', desc: 'מומלץ לצרף הזמנה' },
  { value: 'שמחה משפחתית' },
  { value: 'הוצאה רפואית' },
  { value: 'חובות מנישואי הילדים' },
  { value: 'רכישת דירה', desc: 'רק לדירה ראשונה, בעת הרכישה בפועל' },
  { value: 'אחר' },
]

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  pending:      { label: 'ממתין לאישור',   color: 'text-amber-800',  bg: 'bg-amber-50',  border: 'border-amber-200' },
  review:       { label: 'בבדיקה',          color: 'text-blue-800',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  approved:     { label: 'מאושר',            color: 'text-green-800',  bg: 'bg-green-50',  border: 'border-green-200' },
  rejected:     { label: 'לא מאושר',         color: 'text-red-800',    bg: 'bg-red-50',    border: 'border-red-200' },
  docs_pending: { label: 'השלמת מסמכים',    color: 'text-indigo-800', bg: 'bg-indigo-50', border: 'border-indigo-200' },
}

const RECOVERY_HOMES_DEFAULT = ['אם וילד', 'טלזסטון', 'ביכורים']

// ─── Shared helpers ───

function Field({ label, required, children, hint }: {
  label: string; required?: boolean; children: React.ReactNode; hint?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-700">
        {label}{required && <span className="text-red-500 mr-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function TextInput({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400 ${className}`}
      {...props}
    />
  )
}

function SelectInput({ className = '', children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
      <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-slate-200 p-6 ${className}`}>
      {children}
    </div>
  )
}

// ─── Types ───

interface LineageNode { id: string; name: string; generation: number; parent_id: string | null; status?: string }

interface ChildEntry {
  name: string; id_number: string; gender: string; birth_date: string; marital_status: string
}
function emptyChild(): ChildEntry { return { name: '', id_number: '', gender: '', birth_date: '', marital_status: '' } }
function maritalFor(g: string) {
  if (g === 'male')   return [{ v: 'נשוי', l: 'נשוי' }, { v: 'לא נשוי', l: 'לא נשוי' }]
  if (g === 'female') return [{ v: 'נשואה', l: 'נשואה' }, { v: 'לא נשואה', l: 'לא נשואה' }]
  return []
}
function genderFromMarital(status: string): 'male' | 'female' | '' {
  if (['גרוש', 'אלמן'].includes(status)) return 'male'
  if (['גרושה', 'אלמנה'].includes(status)) return 'female'
  return ''
}

// ─── Lineage tree picker (full graphical) ───

const TP_NW = 160, TP_NH = 54, TP_HGAP = 44, TP_VGAP = 88, TP_PAD = 64
const TP_PAL = [
  { bg: 'linear-gradient(135deg,#7C3AED,#5B21B6)', ring: '#7C3AED', shadow: 'rgba(124,58,237,.35)', light: '#F5F0FF' },
  { bg: 'linear-gradient(135deg,#2563EB,#1E40AF)', ring: '#2563EB', shadow: 'rgba(37,99,235,.30)',   light: '#EFF6FF' },
  { bg: 'linear-gradient(135deg,#0891B2,#0E7490)', ring: '#0891B2', shadow: 'rgba(8,145,178,.30)',   light: '#F0F9FF' },
  { bg: 'linear-gradient(135deg,#059669,#047857)', ring: '#059669', shadow: 'rgba(5,150,105,.30)',   light: '#F0FDF4' },
  { bg: 'linear-gradient(135deg,#D97706,#B45309)', ring: '#D97706', shadow: 'rgba(217,119,6,.30)',   light: '#FFFBEB' },
  { bg: 'linear-gradient(135deg,#DB2777,#BE185D)', ring: '#DB2777', shadow: 'rgba(219,39,119,.30)', light: '#FDF2F8' },
]
const tpPal = (g: number) => TP_PAL[g % TP_PAL.length]

interface TPNode extends LineageNode { children: TPNode[] }
interface TPPos { node: TPNode; x: number; y: number; cx: number; cy: number }

function tpBuild(flat: LineageNode[]): TPNode[] {
  const map = new Map<string, TPNode>()
  flat.forEach(n => map.set(n.id, { ...n, children: [] }))
  const roots: TPNode[] = []
  flat.forEach(n => {
    const nd = map.get(n.id)!
    if (n.parent_id && map.has(n.parent_id)) map.get(n.parent_id)!.children.push(nd)
    else roots.push(nd)
  })
  return roots
}
function tpW(n: TPNode): number { return n.children.length ? n.children.reduce((s, c) => s + tpW(c), 0) : TP_NW + TP_HGAP }
function tpLayout(roots: TPNode[]): TPPos[] {
  const res: TPPos[] = []
  function place(n: TPNode, x: number, y: number) {
    const sw = tpW(n), cx = x + sw / 2
    res.push({ node: n, x: cx - TP_NW / 2, y, cx, cy: y + TP_NH / 2 })
    let cx2 = x; n.children.forEach(c => { place(c, cx2, y + TP_NH + TP_VGAP); cx2 += tpW(c) })
  }
  let sx = TP_PAD; roots.forEach(r => { place(r, sx, TP_PAD); sx += tpW(r) })
  return res
}
function tpSize(pos: TPPos[]) {
  if (!pos.length) return { w: 800, h: 400 }
  return { w: Math.max(...pos.map(p => p.x + TP_NW)) + TP_PAD, h: Math.max(...pos.map(p => p.y + TP_NH)) + TP_PAD }
}
function tpEdges(pos: TPPos[]) {
  const byId = new Map(pos.map(p => [p.node.id, p]))
  return pos.flatMap(p => p.node.children.map(c => { const cp = byId.get(c.id); return cp ? { from: p, to: cp } : null }).filter(Boolean) as { from: TPPos; to: TPPos }[])
}
function buildPath(nodeId: string, all: LineageNode[]): string[] {
  const map = new Map(all.map(n => [n.id, n])); const path: string[] = []
  let cur = map.get(nodeId)
  while (cur) { path.unshift(cur.name); cur = cur.parent_id ? map.get(cur.parent_id) : undefined }
  return path
}

function LineageTreePicker({ initialNodeId, onSelect }: { initialNodeId?: string; onSelect: (id: string, path: string[]) => void }) {
  const [allNodes, setAllNodes] = useState<LineageNode[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string>(initialNodeId ?? '')
  const [zoom, setZoom] = useState(0.65)
  const [q, setQ] = useState('')
  const canvasRef = useRef<HTMLDivElement>(null)
  const didCenter = useRef(false)
  const dragRef = useRef<{ sx: number; sy: number; slx: number; sly: number } | null>(null)
  const zoomAnchor = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    fetch('/api/lineage?all=1').then(r => r.json()).then(d => {
      const raw = (d.nodes ?? []).filter((n: LineageNode) => (n.status ?? 'verified') === 'verified')
      const minGen = raw.length ? Math.min(...raw.map((n: LineageNode) => n.generation)) : 0
      const nodes = raw.map((n: LineageNode) => ({ ...n, generation: n.generation - minGen }))
      setAllNodes(nodes)
      if (initialNodeId && nodes.length > 0) { const p = buildPath(initialNodeId, nodes); if (p.length) onSelect(initialNodeId, p) }
    }).catch(() => {}).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = canvasRef.current; if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault(); e.stopPropagation()
      setZoom(prev => {
        const next = Math.min(2.5, Math.max(0.5, +(prev - e.deltaY * 0.0015).toFixed(3)))
        if (next === prev) return prev
        const r = el.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top
        zoomAnchor.current = { px: (el.scrollLeft + ox) / prev, py: (el.scrollTop + oy) / prev, ox, oy }
        return next
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [loading])

  useLayoutEffect(() => {
    const el = canvasRef.current, a = zoomAnchor.current; if (!el || !a) return
    el.scrollLeft = a.px * zoom - a.ox; el.scrollTop = a.py * zoom - a.oy; zoomAnchor.current = null
  }, [zoom])

  useEffect(() => {
    const el = canvasRef.current; if (!el) return
    const onDown = (e: MouseEvent) => { if (e.button !== 0) return; dragRef.current = { sx: e.clientX, sy: e.clientY, slx: el.scrollLeft, sly: el.scrollTop }; el.style.cursor = 'grabbing' }
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.sx, dy = e.clientY - dragRef.current.sy
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) { e.preventDefault(); el.scrollLeft = dragRef.current.slx - dx; el.scrollTop = dragRef.current.sly - dy }
    }
    const onUp = () => { dragRef.current = null; el.style.cursor = 'grab' }
    el.addEventListener('mousedown', onDown); window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    return () => { el.removeEventListener('mousedown', onDown); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [loading])

  const positions = useMemo(() => tpLayout(tpBuild(allNodes)), [allNodes])
  const edges = useMemo(() => tpEdges(positions), [positions])
  const { w, h } = useMemo(() => tpSize(positions), [positions])
  const nodeById = useMemo(() => new Map(allNodes.map(n => [n.id, n])), [allNodes])
  const branch = useMemo(() => {
    const s = new Set<string>(); if (!selected) return s
    const map = new Map(allNodes.map(n => [n.id, n])); let cur = map.get(selected); let g = 0
    while (cur && g < 60) { s.add(cur.id); cur = cur.parent_id ? map.get(cur.parent_id) : undefined; g++ }
    return s
  }, [selected, allNodes])
  const results = useMemo(() => { const lq = q.trim().toLowerCase(); if (!lq) return []; return allNodes.filter(n => n.name.toLowerCase().includes(lq)).slice(0, 8) }, [q, allNodes])

  useEffect(() => {
    if (!positions.length || didCenter.current) return
    const el = canvasRef.current; if (!el) return
    didCenter.current = true
    requestAnimationFrame(() => { if (!canvasRef.current) return; const sc = (w * zoom - canvasRef.current.clientWidth) / 2; if (sc > 0) canvasRef.current.scrollLeft = sc })
  }, [positions.length, w, zoom])

  function scrollTo(nodeId: string) {
    const pos = positions.find(p => p.node.id === nodeId); if (!pos || !canvasRef.current) return
    const el = canvasRef.current
    el.scrollTo({ left: Math.max(0, pos.cx * zoom - el.clientWidth / 2), top: Math.max(0, pos.y * zoom - el.clientHeight / 3), behavior: 'smooth' })
  }
  function pick(nodeId: string) { setSelected(nodeId); onSelect(nodeId, buildPath(nodeId, allNodes)); setQ(''); setTimeout(() => scrollTo(nodeId), 50) }

  if (loading) return <div className="flex items-center gap-2 py-4 text-indigo-600"><Loader2 size={16} className="animate-spin" /><span className="text-sm">טוען עץ דורות...</span></div>
  if (!allNodes.length) return <div className="py-4 text-center text-slate-400 text-sm">לא נמצאו נתוני שושלת</div>

  return (
    <div style={{ direction: 'rtl' }}>
      {/* search + zoom */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 240 }}>
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 חיפוש שם בשושלת..."
            style={{ width: '100%', height: 30, borderRadius: 8, border: '1px solid #E2E8F0', padding: '0 10px', fontSize: 12, color: '#334155', outline: 'none', direction: 'rtl', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' }} />
          {results.length > 0 && (
            <div style={{ position: 'absolute', top: 34, right: 0, left: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
              {results.map(n => { const par = n.parent_id ? nodeById.get(n.parent_id) : null; return (
                <button key={n.id} type="button" onClick={() => pick(n.id)} style={{ display: 'block', width: '100%', textAlign: 'right', padding: '7px 11px', border: 'none', borderBottom: '1px solid #F1F5F9', background: '#fff', cursor: 'pointer', direction: 'rtl', fontFamily: 'inherit' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{n.name}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>דור {n.generation + 1}{par ? ` · ${par.name}` : ''}</div>
                </button>
              )})}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button type="button" onClick={() => setZoom(z => Math.min(2.5, z + 0.1))} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1', fontWeight: 700 }}>+</button>
          <button type="button" onClick={() => { setZoom(0.65); didCenter.current = false }} style={{ height: 26, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', fontSize: 10, cursor: 'pointer', padding: '0 7px', color: '#64748B', fontWeight: 600 }}>{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1', fontWeight: 700 }}>−</button>
        </div>
      </div>

      {/* canvas */}
      <div ref={canvasRef} dir="ltr" style={{ overflow: 'auto', overflowAnchor: 'none', borderRadius: 14, background: 'linear-gradient(180deg,#FCFCFF 0%,#F7F5FF 100%)', border: '1px solid #E8E0F5', height: 380, cursor: 'grab' }}>
        <div style={{ position: 'relative', width: w * zoom, height: (h + 60) * zoom, minWidth: '100%' }}>
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} width={w * zoom} height={(h + 60) * zoom}>
            {edges.map((e, i) => {
              const x1 = e.from.cx * zoom, y1 = (e.from.y + TP_NH) * zoom, x2 = e.to.cx * zoom, y2 = e.to.y * zoom, mid = (y1 + y2) / 2
              const col = tpPal(e.from.node.generation).ring
              const isPath = selected && branch.has(e.from.node.id) && branch.has(e.to.node.id)
              return (<g key={i}>
                <path d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`} fill="none" stroke="#fff" strokeWidth={isPath ? 7 : 4} strokeLinecap="round" opacity={selected && !isPath ? 0.1 : 0.9} />
                <path d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`} fill="none" stroke={col} strokeWidth={isPath ? 3.5 : 2} strokeLinecap="round" opacity={selected && !isPath ? 0.08 : 0.85} />
              </g>)
            })}
          </svg>
          {positions.map(pos => {
            const isSel = selected === pos.node.id
            const isDim = selected ? !branch.has(pos.node.id) : false
            const p = tpPal(pos.node.generation)
            return (
              <div key={pos.node.id} onClick={() => pick(pos.node.id)}
                style={{ position: 'absolute', left: pos.x * zoom, top: pos.y * zoom, width: TP_NW * zoom, height: TP_NH * zoom, borderRadius: 14 * zoom, background: p.bg, boxShadow: isSel ? `0 0 0 3px #fff, 0 0 0 5px ${p.ring}, 0 10px 28px ${p.shadow}` : `0 4px 16px ${p.shadow}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transform: isSel ? 'scale(1.07)' : 'scale(1)', transition: 'all .2s', opacity: isDim ? 0.22 : 1, zIndex: isSel ? 20 : 2, userSelect: 'none' }}>
                <div style={{ position: 'absolute', top: -9 * zoom, right: 5 * zoom, background: '#fff', color: p.ring, fontSize: Math.max(8, 9 * zoom), fontWeight: 800, width: 19 * zoom, height: 19 * zoom, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${p.ring}` }}>{pos.node.generation + 1}</div>
                {isSel && <div style={{ position: 'absolute', top: -9 * zoom, left: 5 * zoom, width: 19 * zoom, height: 19 * zoom, borderRadius: '50%', background: '#22C55E', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 25 }}><Check size={10 * zoom} color="#fff" strokeWidth={3} /></div>}
                <span style={{ color: '#fff', fontWeight: 700, fontSize: Math.max(9, (pos.node.name.length > 12 ? 10 : 12) * zoom), textAlign: 'center', direction: 'rtl', padding: `0 ${10 * zoom}px`, lineHeight: 1.3, maxWidth: (TP_NW - 14) * zoom, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{pos.node.name}</span>
              </div>
            )
          })}
        </div>
      </div>
      {selected && <p className="text-xs text-indigo-600 font-medium mt-2">✓ נבחר: {allNodes.find(n => n.id === selected)?.name}</p>}
    </div>
  )
}

function LineageCascade({ onSelect }: { onSelect: (nodeId: string, path: string[]) => void }) {
  const [levels, setLevels] = useState<{ nodes: LineageNode[]; selected: string | null; selectedName: string }[]>([])
  const [loadingLevel, setLoadingLevel] = useState<number | null>(null)

  const loadLevel = useCallback(async (parentId: string | null, levelIdx: number) => {
    setLoadingLevel(levelIdx)
    try {
      const url = parentId ? `/api/lineage?parent_id=${parentId}` : '/api/lineage'
      const res = await fetch(url)
      const data = await res.json()
      setLevels(prev => {
        const next = prev.slice(0, levelIdx)
        if ((data.nodes ?? []).length > 0) next.push({ nodes: data.nodes, selected: null, selectedName: '' })
        return next
      })
    } catch { /* ignore */ }
    setLoadingLevel(null)
  }, [])

  useEffect(() => { loadLevel(null, 0) }, [loadLevel])

  const handleSelect = async (levelIdx: number, node: LineageNode) => {
    const currentPath = levels.slice(0, levelIdx).map(l => l.selectedName).concat(node.name)
    setLevels(prev => prev.slice(0, levelIdx + 1).map((l, i) =>
      i === levelIdx ? { ...l, selected: node.id, selectedName: node.name } : l
    ))
    setLoadingLevel(levelIdx + 1)
    try {
      const res = await fetch(`/api/lineage?parent_id=${node.id}`)
      const data = await res.json()
      const children: LineageNode[] = data.nodes ?? []
      setLevels(prev => {
        const next = prev.slice(0, levelIdx + 1)
        if (children.length > 0) {
          next.push({ nodes: children, selected: null, selectedName: '' })
          onSelect('', currentPath)
        } else {
          onSelect(node.id, currentPath)
        }
        return next
      })
    } catch {
      onSelect(node.id, currentPath)
    }
    setLoadingLevel(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {levels.map((level, idx) => (
        <div key={idx}>
          <p className="text-xs font-medium text-slate-500 mb-2">
            {idx === 0 ? 'בחר מהדור הראשון:' : `בחר המשך הדור ${idx + 1}:`}
          </p>
          <div className="flex flex-wrap gap-2">
            {level.nodes.map(node => (
              <button
                key={node.id} type="button" onClick={() => handleSelect(idx, node)}
                className={`text-sm px-3 py-2 rounded-lg border transition-colors ${
                  level.selected === node.id
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
                }`}
              >{node.name}</button>
            ))}
            {loadingLevel === idx + 1 && (
              <span className="flex items-center gap-1 text-xs text-slate-400 self-center">
                <Loader2 size={12} className="animate-spin" /> טוען...
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Israeli ID validation ───

function validateIsraeliId(raw: string): boolean {
  const id = raw.replace(/\D/g, '').padStart(9, '0')
  if (id.length !== 9) return false
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let v = parseInt(id[i]) * (i % 2 === 0 ? 1 : 2)
    if (v > 9) v -= 9
    sum += v
  }
  return sum % 10 === 0
}

function validatePhone(p: string): boolean {
  const d = p.replace(/\D/g, '')
  return d.length === 10 && d.startsWith('05')
}

function validateEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}

// ─── Widow Portal Component ───

const WIDOW_REQUEST_TYPES = [
  { value: 'financial', label: 'קרן סיוע כספי', icon: '💰', desc: 'מענק או הלוואה לסיוע כלכלי' },
  { value: 'food',      label: 'סיוע במזון / שוברים', icon: '🛒', desc: 'חבילות מזון ושוברי קנייה' },
  { value: 'general',   label: 'בקשת עזרה כללית', icon: '🤝', desc: 'פנייה חופשית לצוות' },
] as const

function WidowPortal({ beneficiary, onBack }: { beneficiary: FoundBeneficiary; onBack: () => void }) {
  const [tab, setTab] = useState<'children' | 'requests'>('requests')
  const [showForm, setShowForm] = useState(false)
  const [reqType, setReqType] = useState<string>('')
  const [reqDesc, setReqDesc] = useState('')
  const [reqAmount, setReqAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const children = (beneficiary as FoundBeneficiary & { children?: unknown[] }).children ?? []
  const name = [beneficiary.family_name, beneficiary.full_name].filter(Boolean).join(' ')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reqType) { setError('בחר סוג בקשה'); return }
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/portal/widow-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiary_id: beneficiary.id, request_type: reqType, description: reqDesc, amount: reqAmount ? Number(reqAmount) : undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה בשליחה'); return }
      setSubmitted(true); setShowForm(false); setReqType(''); setReqDesc(''); setReqAmount('')
    } catch { setError('שגיאת רשת') }
    setSubmitting(false)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <button type="button" onClick={onBack} className="text-slate-400 hover:text-slate-600">
          <ArrowRight size={20} />
        </button>
        <div>
          <h2 className="font-bold text-slate-900 text-lg">שלום, {name}</h2>
          <p className="text-xs text-slate-500">אגף אלמנות ויתומים — אזור אישי</p>
        </div>
      </div>

      {submitted && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-800 text-sm">
          <Check size={16} className="text-green-600 flex-shrink-0" />
          הבקשה נשלחה בהצלחה. הצוות יחזור אליך בהקדם.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {[{ key: 'requests', label: 'בקשות' }, { key: 'children', label: 'ילדים' }].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Requests tab */}
      {tab === 'requests' && (
        <div className="flex flex-col gap-3">
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={16} /> הגש בקשה חדשה
            </button>
          )}

          {showForm && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800">בקשה חדשה</h3>

              <div className="grid grid-cols-1 gap-2">
                {WIDOW_REQUEST_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setReqType(t.value)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-right transition-colors ${
                      reqType === t.value
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span className="text-xl">{t.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{t.label}</p>
                      <p className="text-xs text-slate-500">{t.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              {reqType === 'financial' && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">סכום מבוקש (₪)</label>
                  <input
                    type="number"
                    value={reqAmount}
                    onChange={e => setReqAmount(e.target.value)}
                    placeholder="לדוגמה: 1500"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">פרטים נוספים</label>
                <textarea
                  value={reqDesc}
                  onChange={e => setReqDesc(e.target.value)}
                  placeholder="תאר את הבקשה בקצרה..."
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {submitting ? 'שולח...' : 'שלח בקשה'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError('') }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  ביטול
                </button>
              </div>
            </form>
          )}

          <div className="bg-slate-50 rounded-xl p-4 text-center text-sm text-slate-500">
            כל הבקשות נבדקות על ידי צוות העמותה. נחזור אליך בהקדם.
          </div>
        </div>
      )}

      {/* Children tab */}
      {tab === 'children' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {children.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm">אין ילדים רשומים</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(children as Array<{ name?: string; birth_date?: string; gender?: string }>).map((c, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${c.gender === 'female' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                    {c.gender === 'female' ? 'בת' : 'בן'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{c.name || 'ללא שם'}</p>
                    {c.birth_date && <p className="text-xs text-slate-500">{c.birth_date}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main page ───

export default function PublicPortalPage() {
  const [step, setStep] = useState<Step>('id-lookup')
  const [idInput, setIdInput] = useState('')
  const [docType, setDocType] = useState<'id' | 'passport'>('id')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [beneficiary, setBeneficiary] = useState<FoundBeneficiary | null>(null)
  const [childMatch, setChildMatch] = useState<ChildMatchData | null>(null)
  const [requestType, setRequestType] = useState<'birth' | 'loan' | null>(null)
  const [pendingConfirmed, setPendingConfirmed] = useState(false)

  // Registration form
  const [regForm, setRegForm] = useState({
    id_number: '', full_name: '', family_name: '', phone: '', phone2: '',
    email: '', address: '', city: '', birth_date: '', gender: '',
    marital_status: '', spouse_name: '', spouse_id_number: '', spouse_phone: '',
    children_count: '0', notes: '',
  })
  const [lineageNodeId, setLineageNodeId] = useState('')
  const [lineagePath, setLineagePath] = useState<string[]>([])
  const [manualLineage, setManualLineage] = useState<string[]>([])
  // Suggest new lineage node
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestName, setSuggestName] = useState('')
  const [suggestParentId, setSuggestParentId] = useState('')
  const [suggestSubmitting, setSuggestSubmitting] = useState(false)
  const [suggestError, setSuggestError] = useState('')
  const [allLineageNodes, setAllLineageNodes] = useState<{ id: string; name: string; generation: number }[]>([])
  const [children, setChildren] = useState<ChildEntry[]>([])
  const [editingChildIdx, setEditingChildIdx] = useState<number | null>(null)
  const [idFieldError, setIdFieldError] = useState('')
  const [spouseIdError, setSpouseIdError] = useState('')
  const [spousePhoneError, setSpousePhoneError] = useState('')
  const [childIdErrors, setChildIdErrors] = useState<Record<number, string>>({})
  const [phoneError, setPhoneError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [declaredReg, setDeclaredReg] = useState(false)
  const [regSuccess, setRegSuccess] = useState(false)

  // Docs upload (for pending users)
  const [husbandIdFile, setHusbandIdFile] = useState<File | null>(null)
  const [wifeIdFile, setWifeIdFile] = useState<File | null>(null)
  const [docsUploading, setDocsUploading] = useState(false)
  const [docsPendingReason, setDocsPendingReason] = useState<'birth' | 'loan' | null>(null)

  // Deep-link action from email buttons (?action=birth|loan|docs) — applied after ID lookup
  const intendedAction = useRef<'birth' | 'loan' | 'docs' | null>(null)

  // Loan modal
  const [loanModalOpen, setLoanModalOpen] = useState(false)

  // Birth request form
  const [birthForm, setBirthForm] = useState({
    birth_date: '', baby_name: '', baby_gender: '', recovery_home: '', notes: '',
  })
  const [birthCertFile, setBirthCertFile] = useState<File | null>(null)
  const [recoveryHomes, setRecoveryHomes] = useState<string[]>(RECOVERY_HOMES_DEFAULT)

  // Loan request form
  const [loanForm, setLoanForm] = useState({
    amount: '', installments: '', purpose: '', purpose_details: '', declaration: '', notes: '',
  })

  const setReg = (k: keyof typeof regForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setRegForm(f => ({ ...f, [k]: e.target.value }))

  const setBirth = (k: keyof typeof birthForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setBirthForm(f => ({ ...f, [k]: e.target.value }))

  const setLoan = (k: keyof typeof loanForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setLoanForm(f => ({ ...f, [k]: e.target.value }))

  const showSpouseFields = MARRIED_STATUSES.includes(regForm.marital_status)
  const regGender = genderFromMarital(regForm.marital_status)

  // Set page title
  useEffect(() => { document.title = 'היכל החתם סופר' }, [])

  // Load recovery homes
  useEffect(() => {
    if (step === 'new-birth') {
      fetch('/api/portal/hebrewdate').catch(() => {})
    }
  }, [step])

  // ── Lookup ──
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    const raw = idInput.trim()
    if (docType === 'id') {
      const digits = raw.replace(/\D/g, '')
      if (!digits || digits.length < 5) { setError('אנא הזן מספר תעודת זהות'); return }
      if (!validateIsraeliId(digits)) { setError('תעודת הזהות שהזנתם אינה תקינה'); return }
      setError('')
      setLoading(true)
      try {
        const res = await fetch(`/api/portal/lookup?id=${encodeURIComponent(digits)}`)
        const data = await res.json()
        if (!res.ok) { setError(data.error || 'שגיאת שרת'); return }
        if (data.found) {
          setBeneficiary(data.beneficiary)
          const isWidow = ['אלמן', 'אלמנה'].includes(data.beneficiary?.marital_status ?? '')
          setStep(isWidow ? 'widow-dashboard' : 'dashboard')
        }
        else if (data.foundAsChild) {
          setChildMatch({ parentName: data.parentName, childData: data.childData })
          setStep('found-as-child')
        }
        else { setRegForm(f => ({ ...f, id_number: digits })); setStep('not-found') }
      } catch { setError('שגיאת רשת. אנא נסה שוב.') }
      setLoading(false)
    } else {
      if (!raw || raw.length < 5) { setError('אנא הזן מספר דרכון'); return }
      setError('')
      setLoading(true)
      try {
        const res = await fetch(`/api/portal/lookup?passport=${encodeURIComponent(raw)}`)
        const data = await res.json()
        if (!res.ok) { setError(data.error || 'שגיאת שרת'); return }
        if (data.found) {
          setBeneficiary(data.beneficiary)
          const isWidow = ['אלמן', 'אלמנה'].includes(data.beneficiary?.marital_status ?? '')
          setStep(isWidow ? 'widow-dashboard' : 'dashboard')
        }
        else { setRegForm(f => ({ ...f, id_number: raw })); setStep('not-found') }
      } catch { setError('שגיאת רשת. אנא נסה שוב.') }
      setLoading(false)
    }
  }

  // ── Registration ──
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regForm.full_name || !regForm.family_name || !regForm.phone) {
      setError('אנא מלא את כל שדות החובה: שם פרטי, שם משפחה וטלפון')
      return
    }
    if (!lineageNodeId) {
      setError('אנא בחר שיוך שושלת')
      return
    }
    if (regForm.id_number && !validateIsraeliId(regForm.id_number)) {
      setIdFieldError('תעודת הזהות שהזנתם אינה תקינה'); setError('אנא תקן את שגיאות הטופס'); return
    }
    if (showSpouseFields && regForm.spouse_id_number) {
      if (!validateIsraeliId(regForm.spouse_id_number)) {
        setSpouseIdError('תעודת הזהות שהזנתם אינה תקינה'); setError('אנא תקן את שגיאות הטופס'); return
      }
      if (regForm.spouse_id_number.replace(/\D/g, '') === regForm.id_number.replace(/\D/g, '')) {
        setSpouseIdError('תעודת הזהות של האישה זהה לתעודת הזהות של הבעל'); setError('אנא תקן את שגיאות הטופס'); return
      }
      // Check if spouse ID already exists in DB
      try {
        const chkRes = await fetch(`/api/portal/lookup?id=${regForm.spouse_id_number.replace(/\D/g, '')}`)
        const chkData = await chkRes.json()
        if (chkData.found) {
          setSpouseIdError('תעודת זהות זו כבר רשומה במערכת — לא ניתן לרשום אותה שוב'); setError('אנא תקן את שגיאות הטופס'); return
        }
      } catch { /* network error — continue */ }
    }
    if (showSpouseFields && regForm.spouse_phone) {
      if (!validatePhone(regForm.spouse_phone)) {
        setSpousePhoneError('אנא הזן מספר נייד תקין המתחיל ב-05'); setError('אנא תקן את שגיאות הטופס'); return
      }
      if (regForm.phone && regForm.spouse_phone.replace(/\D/g, '') === regForm.phone.replace(/\D/g, '')) {
        setSpousePhoneError('מספר הטלפון של האישה זהה למספר הטלפון של הבעל'); setError('אנא תקן את שגיאות הטופס'); return
      }
    }
    if (regForm.phone && !validatePhone(regForm.phone)) {
      setPhoneError('אנא הזן מספר נייד תקין המתחיל ב-05'); setError('אנא תקן את שגיאות הטופס'); return
    }
    if (regForm.email && !validateEmail(regForm.email)) {
      setEmailError('אנא הזן כתובת מייל תקינה'); setError('אנא תקן את שגיאות הטופס'); return
    }
    if (!declaredReg) { setError('אנא אשר את ההצהרה'); return }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/portal/public-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...regForm,
          children_count: children.length,
          children: children.map(c => ({ name: c.name, id_number: c.id_number, gender: c.gender, birth_date: c.birth_date, marital_status: c.marital_status })),
          lineage_node_id: lineageNodeId || null,
          lineage_manual: manualLineage.map(s => s.trim()).filter(Boolean),
          spouse_name: showSpouseFields ? regForm.spouse_name : null,
          spouse_id_number: showSpouseFields ? regForm.spouse_id_number : null,
          spouse_phone: showSpouseFields ? regForm.spouse_phone : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה בשמירת הנתונים'); return }
      setRegSuccess(true)
      setStep('register-success')
    } catch {
      setError('שגיאת רשת. אנא נסה שוב.')
    }
    setLoading(false)
  }

  // ── Suggest lineage node ──
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
      // Select the new pending node automatically
      const node = data.node
      setLineageNodeId(node.id)
      setLineagePath([...allLineageNodes.find(n => n.id === suggestParentId)
        ? [`דור ${node.generation - 1} — ${allLineageNodes.find(n => n.id === suggestParentId)?.name ?? ''}`]
        : [], `${node.name} (ממתין לאימות)`])
      setSuggestOpen(false); setSuggestName(''); setSuggestParentId('')
    } catch { setSuggestError('שגיאת רשת') }
    finally { setSuggestSubmitting(false) }
  }

  // ── Birth request ──
  const handleBirthRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!birthForm.birth_date) { setError('אנא הזן תאריך לידה'); return }
    if (!birthForm.baby_name) { setError('אנא הזן שם הנולד/ת'); return }
    if (!birthForm.baby_gender) { setError('אנא בחר בן או בת'); return }
    if (!birthForm.recovery_home) { setError('אנא בחר בית החלמה'); return }
    if (!birthCertFile) { setError('אנא צרף אישור לידה'); return }
    if (!beneficiary) return
    setError('')
    setLoading(true)
    try {
      // Upload birth certificate first
      let certUrl = ''
      const fd = new FormData()
      fd.append('file', birthCertFile)
      fd.append('beneficiary_id', beneficiary.id)
      fd.append('doc_type', 'birth_cert')
      const upRes = await fetch('/api/portal/upload-docs', { method: 'POST', body: fd })
      const upData = await upRes.json()
      if (upRes.ok) certUrl = upData.url ?? ''

      const res = await fetch('/api/portal/birth-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiary_id: beneficiary.id, ...birthForm, birth_certificate_url: certUrl }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה בשליחת הבקשה'); return }
      setRequestType('birth')
      setStep('request-sent')
    } catch {
      setError('שגיאת רשת. אנא נסה שוב.')
    }
    setLoading(false)
  }

  // ── Loan request ──
  const handleLoanRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loanForm.amount || !loanForm.installments || !loanForm.purpose) {
      setError('אנא מלא את כל שדות החובה')
      return
    }
    if (!beneficiary) return
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/portal/loan-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiary_id: beneficiary.id, ...loanForm }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה בשליחת הבקשה'); return }
      setLoanModalOpen(false)
      setRequestType('loan')
      setStep('request-sent')
    } catch {
      setError('שגיאת רשת. אנא נסה שוב.')
    }
    setLoading(false)
  }

  // ─── Status badge ───
  const statusMeta = beneficiary ? (STATUS_META[beneficiary.eligibility_status] ?? STATUS_META.pending) : null
  const isPending = beneficiary?.eligibility_status === 'pending' || beneficiary?.eligibility_status === 'review'
  const isDocsPending = beneficiary?.eligibility_status === 'docs_pending'
  const isApproved = beneficiary?.eligibility_status === 'approved'
  const isRejected = beneficiary?.eligibility_status === 'rejected'

  // Which documents are required based on marital status
  const requiredDocs: string[] = (() => {
    const ms = beneficiary?.marital_status ?? ''
    if (ms === 'נשואים') return ['id_husband', 'id_wife']
    if (['גרוש', 'אלמן'].includes(ms)) return ['id_husband']
    if (['גרושה', 'אלמנה'].includes(ms)) return ['id_wife']
    return ['id_husband']
  })()
  const displayName = beneficiary
    ? [beneficiary.family_name, beneficiary.full_name].filter(Boolean).join(' ')
    : ''

  const goToBirthForm = () => {
    if (isPending) { setDocsPendingReason('birth'); setStep('docs-needed'); return }
    if (isDocsPending) { setError('המסמכים שלך נמצאים בבדיקה. נעדכן אותך בקרוב.'); return }
    setError('')
    setBirthForm({ birth_date: '', baby_name: '', baby_gender: '', recovery_home: '', notes: '' })
    setBirthCertFile(null)
    setStep('new-birth')
  }
  const goToLoanForm = () => {
    if (isPending) { setDocsPendingReason('loan'); setStep('docs-needed'); return }
    if (isDocsPending) { setError('המסמכים שלך נמצאים בבדיקה. נעדכן אותך בקרוב.'); return }
    setError('')
    setLoanForm({ amount: '', installments: '', purpose: '', purpose_details: '', declaration: '', notes: '' })
    setLoanModalOpen(true)
  }

  // Read the intended action from the URL once on mount (from the festive email buttons)
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get('action')
    if (a === 'birth' || a === 'loan' || a === 'docs') intendedAction.current = a
  }, [])

  // Once the beneficiary reaches their dashboard, jump straight to the intended form
  useEffect(() => {
    if (!intendedAction.current || !beneficiary || step !== 'dashboard') return
    const a = intendedAction.current
    intendedAction.current = null
    if (a === 'birth') goToBirthForm()
    else if (a === 'loan') goToLoanForm()
    else if (a === 'docs') { setError(''); setDocsPendingReason(null); setStep('docs-needed') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, beneficiary])

  const handleDocsUpload = async () => {
    if (!beneficiary) return
    const needsHusband = requiredDocs.includes('id_husband')
    const needsWife = requiredDocs.includes('id_wife')
    if (needsHusband && !husbandIdFile) { setError('אנא העלה תעודת זהות של הבעל'); return }
    if (needsWife && !wifeIdFile) { setError('אנא העלה תעודת זהות של האשה'); return }
    setError(''); setDocsUploading(true)
    try {
      const fd = new FormData()
      fd.append('beneficiary_id', beneficiary.id)
      if (husbandIdFile) fd.append('id_husband', husbandIdFile)
      if (wifeIdFile) fd.append('id_wife', wifeIdFile)
      const res = await fetch('/api/portal/upload-docs', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה בהעלאת המסמכים'); return }
      setBeneficiary(b => b ? { ...b, eligibility_status: 'docs_pending' } : b)
      setStep('dashboard')
    } catch { setError('שגיאת רשת. אנא נסה שוב.') }
    setDocsUploading(false)
  }

  const backToDashboard = () => {
    setStep('dashboard')
    setError('')
    setPendingConfirmed(false)
  }
  const backToHome = () => {
    setStep('id-lookup')
    setIdInput('')
    setError('')
    setBeneficiary(null)
    setPendingConfirmed(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-slate-100" dir="rtl">

      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 bg-white border border-slate-200">
            <img src="/logo.jpg" alt="לוגו" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1">
            <h1 className="font-bold text-slate-900 text-base leading-tight">היכל החתם סופר</h1>
          </div>
          {(step === 'dashboard' || step === 'new-birth' || step === 'new-loan' || step === 'request-sent') && (
            <button onClick={backToHome} className="text-xs text-slate-400 hover:text-indigo-600 underline">
              יציאה
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* ─── Step: ID Lookup ─── */}
        {step === 'id-lookup' && (
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl overflow-hidden mx-auto mb-4 shadow-lg bg-white border border-slate-200">
                <img src="/logo.jpg" alt="לוגו" className="w-full h-full object-cover" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">ברוכים הבאים</h2>
            </div>

            <Card>
              <form onSubmit={handleLookup} className="flex flex-col gap-4">
                {/* doc-type toggle */}
                <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                  {([['id', 'תעודת זהות'], ['passport', 'דרכון']] as const).map(([v, l]) => (
                    <button key={v} type="button"
                      onClick={() => { setDocType(v); setIdInput(''); setError('') }}
                      className={`flex-1 py-2 text-sm font-medium transition-colors ${docType === v ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-indigo-50'}`}
                    >{l}</button>
                  ))}
                </div>

                {docType === 'id' ? (
                  <Field label='מספר תעודת זהות' required hint="הזן 9 ספרות כולל ספרת ביקורת">
                    <TextInput
                      value={idInput}
                      onChange={e => setIdInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000000"
                      inputMode="numeric"
                      maxLength={9}
                      dir="ltr"
                      autoComplete="off"
                      className="text-center text-lg font-semibold tracking-widest"
                    />
                  </Field>
                ) : (
                  <Field label='מספר דרכון' required>
                    <TextInput
                      value={idInput}
                      onChange={e => setIdInput(e.target.value.toUpperCase())}
                      placeholder="12345678"
                      dir="ltr"
                      autoComplete="off"
                      className="text-center text-lg font-semibold tracking-widest"
                    />
                  </Field>
                )}

                {error && <ErrorBox message={error} />}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3 px-4 rounded-xl transition-colors text-base"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
                  {loading ? 'מחפש...' : 'כניסה למערכת'}
                </button>
              </form>
            </Card>

          </div>
        )}

        {/* ─── Step: Not Found ─── */}
        {step === 'not-found' && (
          <div className="flex flex-col gap-4">
            <Card>
              <div className="text-center mb-5">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle size={30} className="text-amber-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">לא מופיע במערכת</h2>
                <p className="text-slate-600 text-sm leading-relaxed">
                  מספר תעודת הזהות{' '}
                  <span className="font-semibold text-slate-800" dir="ltr">{idInput}</span>
                  {' '}אינו רשום במערכת שלנו.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => { setError(''); setStep('register') }}
                  className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
                >
                  <User size={18} />
                  רישום למערכת
                </button>
                <button
                  onClick={backToHome}
                  className="flex items-center justify-center gap-2 text-slate-500 hover:text-slate-700 py-2 text-sm"
                >
                  <ArrowRight size={16} />
                  חזרה לכניסה
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* ─── Step: Found as Child ─── */}
        {step === 'found-as-child' && childMatch && (
          <div className="flex flex-col gap-4">
            <Card>
              <div className="text-center mb-5">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users size={28} className="text-indigo-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-3">שים לב</h2>
                <p className="text-slate-600 text-sm leading-relaxed mb-1">
                  אתה רשום אצלינו במערכת בתור ילד של
                </p>
                <p className="text-lg font-bold text-indigo-700 mb-4">{childMatch.parentName}</p>
                <p className="text-slate-500 text-sm">
                  כדי שתירשם אתה בעצמך, עבור לרישום מהיר — הפרטים שלך כבר ימולאו אוטומטית.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    const cd = childMatch.childData
                    setRegForm(f => ({
                      ...f,
                      id_number: cd.id_number,
                      full_name: cd.name,
                      birth_date: cd.birth_date,
                      gender: cd.gender,
                      marital_status: cd.marital_status,
                    }))
                    setError('')
                    setStep('register')
                  }}
                  className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
                >
                  <User size={18} />
                  רישום מהיר
                </button>
                <button onClick={backToHome}
                  className="flex items-center justify-center gap-2 text-slate-500 hover:text-slate-700 py-2 text-sm">
                  <ArrowRight size={16} />
                  חזרה לכניסה
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* ─── Step: Register ─── */}
        {step === 'register' && (
          <form onSubmit={handleRegister} className="flex flex-col gap-4">

            <div className="flex items-center gap-3 mb-1">
              <button type="button" onClick={() => setStep('not-found')} className="text-slate-400 hover:text-slate-600">
                <ArrowRight size={20} />
              </button>
              <h2 className="font-bold text-slate-900 text-lg">טופס רישום</h2>
            </div>

            {/* Marital — FIRST */}
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Heart size={18} className="text-indigo-600" />
                <h3 className="font-semibold text-slate-900">מצב משפחתי</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {MARITAL_OPTIONS.map(opt => (
                  <button
                    key={opt.value} type="button"
                    onClick={() => setRegForm(f => ({ ...f, marital_status: opt.value, gender: genderFromMarital(opt.value) }))}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      regForm.marital_status === opt.value
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
                    }`}
                  >{opt.label}</button>
                ))}
              </div>
            </Card>

            {/* Personal — only after marital chosen */}
            {regForm.marital_status && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <User size={18} className="text-indigo-600" />
                  <h3 className="font-semibold text-slate-900">
                    {showSpouseFields ? 'פרטי הבעל' : (regGender === 'female' ? 'פרטי האשה' : 'פרטים אישיים')}
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <Field label="שם פרטי" required>
                      <TextInput value={regForm.full_name} onChange={setReg('full_name')} placeholder="ישראל" required />
                    </Field>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Field label="שם משפחה" required>
                      <TextInput value={regForm.family_name} onChange={setReg('family_name')} placeholder="ישראלי" required />
                    </Field>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Field label='תעודת זהות' required>
                      <TextInput
                        value={regForm.id_number}
                        onChange={e => { setReg('id_number')(e); setIdFieldError('') }}
                        onBlur={() => {
                          if (regForm.id_number && !validateIsraeliId(regForm.id_number))
                            setIdFieldError('תעודת הזהות שהזנתם אינה תקינה')
                          else setIdFieldError('')
                        }}
                        placeholder="000000000" inputMode="numeric" maxLength={9} dir="ltr" required
                        className={idFieldError ? 'border-red-400 focus:ring-red-400' : ''}
                      />
                      {idFieldError && <p className="text-xs text-red-600 mt-1">{idFieldError}</p>}
                    </Field>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Field label="תאריך לידה">
                      <TextInput type="date" value={regForm.birth_date} onChange={setReg('birth_date')} max={new Date().toISOString().split('T')[0]} />
                    </Field>
                  </div>
                </div>

                {/* Spouse — only if married */}
                {showSpouseFields && (
                  <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
                    <p className="col-span-2 text-sm font-semibold text-slate-700">
                      פרטי האשה
                    </p>
                    <div className="col-span-2 sm:col-span-1">
                      <Field label="שם פרטי" required>
                        <TextInput value={regForm.spouse_name} onChange={setReg('spouse_name')} placeholder="שם מלא" required />
                      </Field>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <Field label='תעודת זהות' required>
                        <TextInput
                          value={regForm.spouse_id_number}
                          onChange={e => { setReg('spouse_id_number')(e); setSpouseIdError('') }}
                          onBlur={() => {
                            const sid = regForm.spouse_id_number.trim()
                            if (!sid) { setSpouseIdError(''); return }
                            if (!validateIsraeliId(sid)) {
                              setSpouseIdError('תעודת הזהות שהזנתם אינה תקינה')
                            } else if (sid.replace(/\D/g, '') === regForm.id_number.replace(/\D/g, '')) {
                              setSpouseIdError('תעודת הזהות של האישה זהה לתעודת הזהות של הבעל')
                            } else {
                              setSpouseIdError('')
                            }
                          }}
                          placeholder="000000000" inputMode="numeric" maxLength={9} dir="ltr" required
                          className={spouseIdError ? 'border-red-400 focus:ring-red-400' : ''}
                        />
                        {spouseIdError && <p className="text-xs text-red-600 mt-1">{spouseIdError}</p>}
                      </Field>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <Field label="טלפון האשה">
                        <TextInput type="tel"
                          value={regForm.spouse_phone}
                          onChange={e => { setReg('spouse_phone')(e); setSpousePhoneError('') }}
                          onBlur={() => {
                            const sp = regForm.spouse_phone.trim()
                            if (!sp) { setSpousePhoneError(''); return }
                            if (!validatePhone(sp)) {
                              setSpousePhoneError('אנא הזן מספר נייד תקין המתחיל ב-05')
                            } else if (regForm.phone && sp.replace(/\D/g, '') === regForm.phone.replace(/\D/g, '')) {
                              setSpousePhoneError('מספר הטלפון של האישה זהה למספר הטלפון של הבעל')
                            } else {
                              setSpousePhoneError('')
                            }
                          }}
                          placeholder="0500000000" dir="ltr" maxLength={11}
                          className={spousePhoneError ? 'border-red-400 focus:ring-red-400' : ''}
                        />
                        {spousePhoneError && <p className="text-xs text-red-600 mt-1">{spousePhoneError}</p>}
                      </Field>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* Contact */}
            {regForm.marital_status && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <Phone size={18} className="text-indigo-600" />
                  <h3 className="font-semibold text-slate-900">פרטי קשר</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <Field label="טלפון ראשי" required hint="מספר נייד ישראלי המתחיל ב-05">
                      <TextInput type="tel" value={regForm.phone}
                        onChange={e => { setReg('phone')(e); setPhoneError('') }}
                        onBlur={() => { if (regForm.phone && !validatePhone(regForm.phone)) setPhoneError('אנא הזן מספר נייד תקין המתחיל ב-05'); else setPhoneError('') }}
                        placeholder="0500000000" dir="ltr" maxLength={11} required
                        className={phoneError ? 'border-red-400 focus:ring-red-400' : ''}
                      />
                      {phoneError && <p className="text-xs text-red-600 mt-1">{phoneError}</p>}
                    </Field>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Field label="טלפון נוסף">
                      <TextInput type="tel" value={regForm.phone2} onChange={setReg('phone2')} placeholder="0500000000" dir="ltr" maxLength={11} />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="דואר אלקטרוני" required>
                      <TextInput type="email" value={regForm.email}
                        onChange={e => { setReg('email')(e); setEmailError('') }}
                        onBlur={() => { if (regForm.email && !validateEmail(regForm.email)) setEmailError('אנא הזן כתובת מייל תקינה'); else setEmailError('') }}
                        placeholder="your@email.com" dir="ltr" required
                        className={emailError ? 'border-red-400 focus:ring-red-400' : ''}
                      />
                      {emailError && <p className="text-xs text-red-600 mt-1">{emailError}</p>}
                    </Field>
                  </div>
                </div>
              </Card>
            )}

            {/* Address */}
            {regForm.marital_status && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <MapPin size={18} className="text-indigo-600" />
                  <h3 className="font-semibold text-slate-900">כתובת</h3>
                </div>
                <CityStreetPicker
                  city={regForm.city}
                  address={regForm.address}
                  onCityChange={v => setRegForm(f => ({ ...f, city: v }))}
                  onAddressChange={v => setRegForm(f => ({ ...f, address: v }))}
                  cityRequired
                  addressRequired
                />
              </Card>
            )}

            {/* Lineage */}
            {regForm.marital_status && (
              <Card>
                <div className="flex items-center gap-2 mb-1">
                  <GitBranch size={18} className="text-indigo-600" />
                  <h3 className="font-semibold text-slate-900">שיוך שושלת <span className="text-red-500">*</span></h3>
                </div>
                <p className="text-xs text-slate-500 mb-4">בחר את הענף שאתה שייך אליו.</p>
                {lineagePath.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap mb-4 p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                    <span className="text-xs text-indigo-600 font-medium ml-1">נבחר:</span>
                    {lineagePath.map((name, i) => (
                      <span key={i} className="flex items-center gap-1">
                        {i > 0 && <ChevronLeft size={12} className="text-indigo-300" />}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          i === lineagePath.length - 1 ? 'bg-indigo-600 text-white font-semibold' : 'bg-indigo-100 text-indigo-700'
                        }`}>{name}</span>
                      </span>
                    ))}
                  </div>
                )}
                <LineageTreePicker onSelect={(nodeId, path) => { setLineageNodeId(nodeId); setLineagePath(path); setSuggestOpen(false) }} />
                {lineageNodeId && (
                  <button type="button" onClick={() => { setLineageNodeId(''); setLineagePath([]); setManualLineage([]) }}
                    className="mt-3 text-xs text-slate-400 hover:text-slate-600 underline">נקה בחירה</button>
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
                      className="flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 border border-amber-200 hover:border-amber-400 bg-amber-50 hover:bg-amber-100 rounded-lg px-3 py-1.5 transition-colors">
                      <Plus size={13} />
                      הדור שלי לא מופיע בעץ — הצע צומת חדש
                    </button>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-3">
                      <p className="text-xs font-semibold text-amber-800">הצע דור חדש לעץ השושלת</p>
                      <p className="text-xs text-amber-700">הצומת ייכנס לעץ בסטטוס "ממתין לאימות" עד שהצוות יאשר אותו.</p>
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-slate-700">שם האדם <span className="text-red-500">*</span></label>
                        <TextInput value={suggestName} onChange={e => setSuggestName(e.target.value)} placeholder='שם מלא' />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-slate-700">הורה בעץ (הדור שמעליו)</label>
                        <select value={suggestParentId} onChange={e => setSuggestParentId(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
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
                        <button type="button" onClick={handleSuggestLineage} disabled={suggestSubmitting}
                          className="flex items-center gap-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 rounded-lg px-4 py-2 transition-colors">
                          {suggestSubmitting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          שלח לאישור
                        </button>
                        <button type="button" onClick={() => { setSuggestOpen(false); setSuggestName(''); setSuggestParentId(''); setSuggestError('') }}
                          className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-2">
                          ביטול
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Manual generations */}
                {lineageNodeId && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs font-medium text-slate-600 mb-1">
                      המשך דורות (דור {lineagePath.length + 1} ומעלה)
                    </p>
                    <p className="text-xs text-slate-400 mb-3">
                      אם אתה שייך לדור שאינו ברשימה, הוסף כאן את שמות הדורות הבאים ידנית.
                    </p>
                    <div className="flex flex-col gap-2">
                      {manualLineage.map((val, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 w-16 flex-shrink-0">דור {lineagePath.length + 1 + idx}</span>
                          <TextInput value={val} placeholder="שם"
                            onChange={e => setManualLineage(prev => prev.map((v, i) => i === idx ? e.target.value : v))} />
                          <button type="button" onClick={() => setManualLineage(prev => prev.filter((_, i) => i !== idx))}
                            className="text-slate-300 hover:text-red-500 flex-shrink-0">
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => setManualLineage(prev => [...prev, ''])}
                      className="mt-3 flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 rounded-lg px-3 py-1.5 transition-colors">
                      <Plus size={14} />
                      הוסף דור {lineagePath.length + 1 + manualLineage.length}
                    </button>
                  </div>
                )}
              </Card>
            )}

            {/* Children */}
            {regForm.marital_status && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <Users size={18} className="text-indigo-600" />
                  <h3 className="font-semibold text-slate-900">ילדים</h3>
                </div>

                {/* Count field */}
                <div className="mb-4">
                  <Field label="כמות ילדים">
                    <TextInput
                      type="number" min="0" max="20"
                      value={children.length === 0 && regForm.children_count === '0' ? '' : String(children.length)}
                      placeholder="0"
                      inputMode="numeric"
                      className="w-28"
                      onChange={e => {
                        const n = Math.max(0, Math.min(20, parseInt(e.target.value || '0', 10) || 0))
                        setRegForm(f => ({ ...f, children_count: String(n) }))
                        setChildren(cs => {
                          if (n > cs.length) {
                            const added = [...cs, ...Array.from({ length: n - cs.length }, emptyChild)]
                            setEditingChildIdx(cs.length)
                            return added
                          }
                          if (n < cs.length) { setEditingChildIdx(null); return cs.slice(0, n) }
                          return cs
                        })
                      }}
                    />
                  </Field>
                </div>

                <div className="flex flex-col gap-2">
                  {children.map((child, idx) => (
                    editingChildIdx === idx ? (
                      /* Expanded edit form */
                      <div key={idx} className="border border-indigo-200 rounded-xl p-4 bg-indigo-50">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold text-slate-700">ילד {idx + 1}</span>
                          <button type="button" onClick={() => { setChildren(cs => cs.filter((_, i) => i !== idx)); setEditingChildIdx(null) }}
                            className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2 sm:col-span-1">
                            <Field label="שם הילד/ה" required>
                              <TextInput value={child.name} placeholder="שם מלא" required
                                onChange={e => setChildren(cs => cs.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))} />
                            </Field>
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <Field label="תעודת זהות" required>
                              <TextInput value={child.id_number} placeholder="000000000" inputMode="numeric" maxLength={9} dir="ltr" required
                                className={childIdErrors[idx] ? 'border-red-400 focus:ring-red-400' : ''}
                                onChange={e => { setChildren(cs => cs.map((c, i) => i === idx ? { ...c, id_number: e.target.value.replace(/\D/g,'') } : c)); setChildIdErrors(e => ({ ...e, [idx]: '' })) }}
                                onBlur={() => {
                                  if (child.id_number && !validateIsraeliId(child.id_number))
                                    setChildIdErrors(e => ({ ...e, [idx]: 'תעודת הזהות שהזנתם אינה תקינה' }))
                                  else setChildIdErrors(e => ({ ...e, [idx]: '' }))
                                }} />
                              {childIdErrors[idx] && <p className="text-xs text-red-600 mt-1">{childIdErrors[idx]}</p>}
                            </Field>
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <Field label="תאריך לידה" required>
                              <TextInput type="date" value={child.birth_date} required
                                max={new Date().toISOString().split('T')[0]}
                                onChange={e => setChildren(cs => cs.map((c, i) => i === idx ? { ...c, birth_date: e.target.value } : c))} />
                            </Field>
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <Field label="מין" required>
                              <div className="flex gap-2">
                                {[{ v: 'male', l: 'בן' }, { v: 'female', l: 'בת' }].map(({ v, l }) => (
                                  <button key={v} type="button"
                                    onClick={() => setChildren(cs => cs.map((c, i) => i === idx ? { ...c, gender: v, marital_status: '' } : c))}
                                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                                      child.gender === v ? GENDER_BTN_SEL[v] : GENDER_BTN_UNSEL
                                    }`}
                                  >{l}</button>
                                ))}
                              </div>
                            </Field>
                          </div>
                          {child.gender && (
                          <div className="col-span-2">
                            <Field label="מצב משפחתי" required>
                              <div className="flex gap-2 flex-wrap">
                                {maritalFor(child.gender).map(({ v, l }) => (
                                  <button key={v} type="button"
                                    onClick={() => setChildren(cs => cs.map((c, i) => i === idx ? { ...c, marital_status: v } : c))}
                                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                                      child.marital_status === v
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
                                    }`}
                                  >{l}</button>
                                ))}
                              </div>
                            </Field>
                          </div>
                          )}
                        </div>
                        <button type="button" onClick={() => {
                          if (!child.name || !child.id_number || !child.birth_date || !child.gender || !child.marital_status) {
                            alert('אנא מלא את כל שדות הילד'); return
                          }
                          if (!validateIsraeliId(child.id_number)) {
                            setChildIdErrors(e => ({ ...e, [idx]: 'תעודת הזהות שהזנתם אינה תקינה' })); return
                          }
                          setEditingChildIdx(null)
                        }}
                          className="mt-4 w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-lg text-sm transition-colors">
                          <Check size={14} /> שמור
                        </button>
                      </div>
                    ) : (
                      /* Collapsed row */
                      <div key={idx} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-indigo-600">{idx + 1}</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{child.name || `ילד ${idx + 1}`}</p>
                            <p className="text-xs text-slate-500">
                              {[child.gender === 'male' ? 'בן' : child.gender === 'female' ? 'בת' : '', child.birth_date, child.marital_status].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setEditingChildIdx(idx)}
                            className="text-xs text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50">עריכה</button>
                          <button type="button" onClick={() => setChildren(cs => cs.filter((_, i) => i !== idx))}
                            className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </Card>
            )}

            {/* Declaration */}
            {regForm.marital_status && (
              <Card>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox" id="decl" checked={declaredReg}
                    onChange={e => setDeclaredReg(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-indigo-600"
                  />
                  <label htmlFor="decl" className="text-sm text-slate-700 leading-relaxed cursor-pointer">
                    הנני מצהיר/ה שהפרטים שמסרתי נכונים ומדויקים, ואני מסכים/ה לאחסון המידע לצרכי ניהול המערכת.
                  </label>
                </div>
              </Card>
            )}

            {error && <ErrorBox message={error} />}

            {regForm.marital_status && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
                <p className="font-medium mb-1">שים לב</p>
                <p>הטופס ייבדק על ידי צוות המערכת. תקבל עדכון על סטטוס הבקשה שלך.</p>
              </div>
            )}

            {regForm.marital_status && (
              <button
                type="submit" disabled={loading}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3 px-4 rounded-xl transition-colors text-base"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
                {loading ? 'שולח...' : 'שלח בקשת רישום'}
              </button>
            )}
          </form>
        )}

        {/* ─── Step: Register Success ─── */}
        {step === 'register-success' && (
          <>
            {/* Confetti overlay */}
            {regSuccess && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm pointer-events-none">
                <div className="relative">
                  {Array.from({ length: 60 }).map((_, i) => (
                    <div key={i} style={{
                      position: 'absolute',
                      width: Math.random() * 8 + 4,
                      height: Math.random() * 8 + 4,
                      borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                      background: ['#6366F1','#EC4899','#F59E0B','#10B981','#3B82F6','#8B5CF6'][i % 6],
                      left: `${Math.random() * 400 - 200}px`,
                      top: `${Math.random() * -100}px`,
                      animation: `confetti-fall ${1.5 + Math.random() * 2}s linear ${Math.random() * 0.8}s forwards`,
                    }} />
                  ))}
                </div>
              </div>
            )}
            <Card>
              <div className="text-center py-4">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 size={38} className="text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">הרישום התקבל!</h2>
                <p className="text-slate-600 mb-6 leading-relaxed">
                  בקשת הרישום שלך נשלחה בהצלחה.<br />
                  צוות המערכת יעיין בבקשתך ויצור עמך קשר.
                </p>
                <button onClick={backToHome}
                  className="flex items-center justify-center gap-2 text-indigo-600 hover:text-indigo-800 font-medium text-sm mx-auto">
                  <ArrowRight size={16} /> חזרה לדף הכניסה
                </button>
              </div>
            </Card>
          </>
        )}

        {/* ─── Step: Dashboard ─── */}
        {step === 'dashboard' && beneficiary && (
          <div className="flex flex-col gap-4">

            {/* User header */}
            <Card>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <User size={26} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-slate-900 text-lg truncate">{displayName || beneficiary.full_name}</h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {statusMeta && (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${statusMeta.color} ${statusMeta.bg} ${statusMeta.border}`}>
                        {statusMeta.label}
                      </span>
                    )}
                    {beneficiary.city && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <MapPin size={11} />{beneficiary.city}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Phone */}
              {beneficiary.phone && (
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-sm text-slate-600">
                  <Phone size={14} className="text-slate-400 flex-shrink-0" />
                  <span dir="ltr">{beneficiary.phone}</span>
                </div>
              )}
            </Card>

            {/* Status banners */}
            {isPending && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-4 text-sm text-amber-800">
                <div className="flex items-start gap-3">
                  <Clock size={18} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold mb-1">הסטטוס שלך: ממתין לאישור</p>
                    <p className="leading-relaxed">
                      כדי להגיש בקשה יש לצרף תעודת זהות. לחץ על אחת מהאפשרויות למטה כדי להעלות מסמכים.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isDocsPending && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-4 text-sm text-indigo-800">
                <div className="flex items-start gap-3">
                  <FileText size={18} className="flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold mb-1">המסמכים שלך התקבלו</p>
                    <p className="leading-relaxed">הצוות בודק את המסמכים ויאשר את חשבונך בקרוב.</p>
                  </div>
                </div>
              </div>
            )}

            {isApproved && (
              <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-sm text-green-800 flex items-center gap-2">
                <CheckCircle2 size={16} className="flex-shrink-0" />
                <span>חשבונך מאושר — ניתן להגיש בקשות ישירות.</span>
              </div>
            )}

            {isRejected && (
              <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-800 flex items-center gap-2">
                <AlertCircle size={16} className="flex-shrink-0" />
                <span>חשבונך אינו מאושר. לבירורים פנה לצוות המערכת.</span>
              </div>
            )}

            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}

            {/* Action buttons */}
            {!isRejected && !isDocsPending && (
              <div className="flex flex-col gap-3">
                <h3 className="font-semibold text-slate-700 text-sm px-1">הגשת בקשה</h3>

                <button
                  onClick={goToBirthForm}
                  className="flex items-center gap-4 bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-right shadow-sm group"
                >
                  <div className="w-12 h-12 bg-pink-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-pink-200 transition-colors">
                    <Baby size={22} className="text-pink-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">בקשת הבראה ליולדת</p>
                    <p className="text-xs text-slate-500 mt-0.5">שהייה בבית החלמה לאחר לידה</p>
                  </div>
                  <ChevronLeft size={18} className="text-slate-300 group-hover:text-indigo-400" />
                </button>

                <button
                  onClick={goToLoanForm}
                  className="flex items-center gap-4 bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-right shadow-sm group"
                >
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition-colors">
                    <CreditCard size={22} className="text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">הלוואה חדשה</p>
                    <p className="text-xs text-slate-500 mt-0.5">בקשת הלוואה מגמ&quot;ח</p>
                  </div>
                  <ChevronLeft size={18} className="text-slate-300 group-hover:text-indigo-400" />
                </button>

                {!isPending && (
                  <button
                    onClick={() => alert('לבקשת חלוקה, אנא פנה ישירות לצוות המערכת')}
                    className="flex items-center gap-4 bg-white rounded-2xl border border-slate-200 p-5 hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-right shadow-sm group"
                  >
                    <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-200 transition-colors">
                      <Gift size={22} className="text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900">חלוקה</p>
                      <p className="text-xs text-slate-500 mt-0.5">קבלת מוצרים / חבילות</p>
                    </div>
                    <ChevronLeft size={18} className="text-slate-300 group-hover:text-indigo-400" />
                  </button>
                )}
              </div>
            )}

            <div className="text-center pt-2">
              <p className="text-xs text-slate-400">
                נרשמת ב-{new Date(beneficiary.created_at).toLocaleDateString('he-IL')}
              </p>
            </div>
          </div>
        )}

        {/* ─── Step: Widow Dashboard ─── */}
        {step === 'widow-dashboard' && beneficiary && (
          <WidowPortal beneficiary={beneficiary} onBack={backToHome} />
        )}

        {/* ─── Step: Docs Needed ─── */}
        {step === 'docs-needed' && beneficiary && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-1">
              <button type="button" onClick={() => { setStep('dashboard'); setError('') }} className="text-slate-400 hover:text-slate-600">
                <ArrowRight size={20} />
              </button>
              <h2 className="font-bold text-slate-900 text-lg">השלמת מסמכים</h2>
            </div>

            <Card>
              <div className="flex items-start gap-3 mb-5">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText size={20} className="text-indigo-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 mb-1">נדרשת העלאת מסמכים</p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    כדי להגיש בקשה יש לאמת את זהותך. אנא העלה את המסמכים הבאים:
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {requiredDocs.includes('id_husband') && (
                  <div className="border border-slate-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-slate-700 mb-3">
                      {beneficiary.marital_status === 'נשואים' ? 'תעודת זהות — הבעל' : 'תעודת זהות שלך'}
                    </p>
                    {husbandIdFile ? (
                      <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <span className="text-sm text-green-700 flex items-center gap-2">
                          <CheckCircle2 size={14} /> {husbandIdFile.name}
                        </span>
                        <button type="button" onClick={() => setHusbandIdFile(null)} className="text-red-400 hover:text-red-600">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-indigo-50 border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl px-4 py-3 transition-colors">
                        <Upload size={16} className="text-slate-400" />
                        <span className="text-sm text-slate-500">לחץ להעלאת קובץ (תמונה / PDF)</span>
                        <input type="file" accept="image/*,application/pdf" className="hidden"
                          onChange={e => setHusbandIdFile(e.target.files?.[0] ?? null)} />
                      </label>
                    )}
                  </div>
                )}

                {requiredDocs.includes('id_wife') && (
                  <div className="border border-slate-200 rounded-xl p-4">
                    <p className="text-sm font-semibold text-slate-700 mb-3">תעודת זהות — האשה</p>
                    {wifeIdFile ? (
                      <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <span className="text-sm text-green-700 flex items-center gap-2">
                          <CheckCircle2 size={14} /> {wifeIdFile.name}
                        </span>
                        <button type="button" onClick={() => setWifeIdFile(null)} className="text-red-400 hover:text-red-600">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-indigo-50 border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl px-4 py-3 transition-colors">
                        <Upload size={16} className="text-slate-400" />
                        <span className="text-sm text-slate-500">לחץ להעלאת קובץ (תמונה / PDF)</span>
                        <input type="file" accept="image/*,application/pdf" className="hidden"
                          onChange={e => setWifeIdFile(e.target.files?.[0] ?? null)} />
                      </label>
                    )}
                  </div>
                )}
              </div>

              {error && <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}

              <button type="button" onClick={handleDocsUpload} disabled={docsUploading}
                className="mt-5 w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3 px-4 rounded-xl transition-colors">
                {docsUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                {docsUploading ? 'שולח מסמכים...' : 'שלח מסמכים לאישור'}
              </button>

              <p className="text-xs text-slate-400 text-center mt-3">
                לאחר בדיקת המסמכים תוכל להגיש בקשות. הצוות יעדכן אותך.
              </p>
            </Card>
          </div>
        )}

        {/* ─── Step: New Birth ─── */}
        {step === 'new-birth' && (
          <form onSubmit={handleBirthRequest} className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-1">
              <button type="button" onClick={backToDashboard} className="text-slate-400 hover:text-slate-600">
                <ArrowRight size={20} />
              </button>
              <h2 className="font-bold text-slate-900 text-lg">בקשת הבראה ליולדת</h2>
            </div>

            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Baby size={18} className="text-pink-500" />
                <h3 className="font-semibold text-slate-900">פרטי הלידה</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <Field label="תאריך הלידה" required>
                    <TextInput
                      type="date" value={birthForm.birth_date} onChange={setBirth('birth_date')}
                      max={new Date().toISOString().split('T')[0]} required
                    />
                  </Field>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Field label="שם הנולד/ת" required>
                    <TextInput value={birthForm.baby_name} onChange={setBirth('baby_name')} placeholder="שם הילד/ה" required />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="מין הנולד/ת" required>
                    <div className="flex gap-2">
                      {[{ v: 'male', l: 'בן' }, { v: 'female', l: 'בת' }].map(({ v, l }) => (
                        <button key={v} type="button"
                          onClick={() => setBirthForm(f => ({ ...f, baby_gender: v }))}
                          className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                            birthForm.baby_gender === v ? GENDER_BTN_SEL[v] : GENDER_BTN_UNSEL
                          }`}
                        >{l}</button>
                      ))}
                    </div>
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="בית החלמה" required>
                    <div className="flex flex-wrap gap-2">
                      {recoveryHomes.map(h => (
                        <button key={h} type="button"
                          onClick={() => setBirthForm(f => ({ ...f, recovery_home: f.recovery_home === h ? '' : h }))}
                          className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                            birthForm.recovery_home === h
                              ? 'bg-pink-600 text-white border-pink-600 shadow-sm'
                              : 'bg-white text-slate-700 border-slate-300 hover:border-pink-400 hover:bg-pink-50'
                          }`}
                        >{h}</button>
                      ))}
                    </div>
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="הערות">
                    <textarea value={birthForm.notes} onChange={setBirth('notes')} rows={3}
                      placeholder="כל מידע רלוונטי נוסף..."
                      className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none w-full"
                    />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="אישור לידה" required hint="צרף תמונה או PDF של אישור הלידה מבית החולים">
                    {birthCertFile ? (
                      <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <span className="text-sm text-green-700 flex items-center gap-2">
                          <CheckCircle2 size={14} /> {birthCertFile.name}
                        </span>
                        <button type="button" onClick={() => setBirthCertFile(null)} className="text-red-400 hover:text-red-600">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-pink-50 border-2 border-dashed border-slate-300 hover:border-pink-400 rounded-xl px-4 py-3 transition-colors">
                        <Upload size={16} className="text-slate-400" />
                        <span className="text-sm text-slate-500">לחץ להעלאת אישור לידה (תמונה / PDF)</span>
                        <input type="file" accept="image/*,application/pdf" className="hidden"
                          onChange={e => setBirthCertFile(e.target.files?.[0] ?? null)} />
                      </label>
                    )}
                  </Field>
                </div>
              </div>
            </Card>

            {error && <ErrorBox message={error} />}

            <button type="submit" disabled={loading}
              className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3 px-4 rounded-xl transition-colors text-base"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
              {loading ? 'שולח...' : 'שלח בקשה'}
            </button>
          </form>
        )}

        {/* ─── Loan Modal ─── */}
        {loanModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
                <div className="flex items-center gap-2">
                  <CreditCard size={18} className="text-blue-600" />
                  <h3 className="font-bold text-slate-900">בקשת הלוואה</h3>
                </div>
                <button type="button" onClick={() => { setLoanModalOpen(false); setError('') }}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                  <X size={20} />
                </button>
              </div>

              {/* Modal body */}
              <form onSubmit={handleLoanRequest} className="p-6 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Field label="מטרת ההלוואה" required>
                      <SelectInput value={loanForm.purpose} onChange={setLoan('purpose')} required>
                        <option value="">בחר מטרה...</option>
                        {LOAN_PURPOSES.map(p => (
                          <option key={p.value} value={p.value}>{p.value}</option>
                        ))}
                      </SelectInput>
                      {loanForm.purpose && LOAN_PURPOSES.find(p => p.value === loanForm.purpose)?.desc && (
                        <p className="text-xs text-indigo-600 mt-1">
                          {LOAN_PURPOSES.find(p => p.value === loanForm.purpose)?.desc}
                        </p>
                      )}
                    </Field>
                  </div>
                  {loanForm.purpose === 'אחר' && (
                    <div className="col-span-2">
                      <Field label="פרט את מטרת ההלוואה" required>
                        <TextInput value={loanForm.purpose_details} onChange={setLoan('purpose_details')} placeholder="תאר את מטרת ההלוואה..." required />
                      </Field>
                    </div>
                  )}
                  <div className="col-span-2 sm:col-span-1">
                    <Field label="סכום מבוקש (₪)" required hint="עד 30,000 ₪">
                      <TextInput
                        type="number" min="100" max="30000" step="100"
                        value={loanForm.amount} onChange={setLoan('amount')}
                        placeholder="5000" required
                      />
                    </Field>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Field label="מספר תשלומים" required>
                      <TextInput
                        type="number" min="1" max="60"
                        value={loanForm.installments} onChange={setLoan('installments')}
                        placeholder="12" required
                      />
                    </Field>
                  </div>
                  {loanForm.amount && loanForm.installments && (
                    <div className="col-span-2">
                      <div className="bg-indigo-50 rounded-lg px-3 py-2.5 text-sm text-indigo-800 border border-indigo-100">
                        תשלום חודשי משוער:{' '}
                        <strong>
                          {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })
                            .format(parseFloat(loanForm.amount) / parseInt(loanForm.installments, 10) || 0)}
                        </strong>
                      </div>
                    </div>
                  )}
                  <div className="col-span-2">
                    <Field label='האם פנית בעבר לגמ"ח חתם סופר?' required>
                      <div className="flex flex-col gap-2">
                        {['לא הגשתי', 'הגשתי וקיבלתי', 'הגשתי וסורבתי'].map(opt => (
                          <label key={opt} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input type="radio" name="declaration" value={opt}
                              checked={loanForm.declaration === opt}
                              onChange={setLoan('declaration')}
                              className="accent-indigo-600"
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="הערות נוספות">
                      <textarea value={loanForm.notes} onChange={setLoan('notes')} rows={3}
                        placeholder="כל מידע רלוונטי נוסף..."
                        className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none w-full"
                      />
                    </Field>
                  </div>
                </div>

                {error && <ErrorBox message={error} />}

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setLoanModalOpen(false); setError('') }}
                    className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                    ביטול
                  </button>
                  <button type="submit" disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm">
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                    {loading ? 'שולח...' : 'שלח בקשה'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── Step: Request Sent ─── */}
        {step === 'request-sent' && (
          <Card>
            <div className="text-center py-4">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 size={38} className="text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">הבקשה נשלחה!</h2>
              <p className="text-slate-600 mb-6 leading-relaxed">
                {requestType === 'birth'
                  ? 'בקשת ההבראה ליולדת התקבלה בהצלחה.'
                  : 'בקשת ההלוואה התקבלה בהצלחה.'}
                <br />
                צוות העמותה יעיין בבקשתך ויצור עמך קשר.
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600 text-right mb-6">
                <p className="flex items-center gap-2">
                  <Clock size={14} className="text-indigo-400 flex-shrink-0" />
                  <span>זמן טיפול ממוצע: עד 7 ימי עסקים</span>
                </p>
                {beneficiary?.phone && (
                  <p className="flex items-center gap-2 mt-2">
                    <Phone size={14} className="text-indigo-400 flex-shrink-0" />
                    <span>עדכון יישלח לטלפון: <span dir="ltr">{beneficiary.phone}</span></span>
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <button onClick={backToDashboard}
                  className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors text-sm"
                >
                  <User size={16} /> חזרה לאזור האישי
                </button>
                <button onClick={backToHome}
                  className="flex items-center justify-center gap-2 text-slate-500 hover:text-slate-700 py-2 text-sm">
                  <ArrowRight size={16} /> יציאה
                </button>
              </div>
            </div>
          </Card>
        )}

        <p className="text-center text-xs text-slate-400 mt-6 flex items-center justify-center gap-1">
          <Mail size={11} />
          מערכת מאובטחת · כל הפרטים מוצפנים
        </p>
      </main>
    </div>
  )
}
