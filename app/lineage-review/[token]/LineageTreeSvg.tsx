'use client'
import { useMemo, useRef, useState, useCallback, useEffect } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// עץ יוחסין ויזואלי — העתק נאמן של מנוע עץ הדורות המלא (app/admin/lineage),
// מוגבל לענף שנבחר בקישור. אותם קבועים (NW/NH/HGAP/VGAP/PAD), אותו layoutTree
// עם subtreeW, אותם קווי חיבור אורתוגונליים ורקע קלף. קליק בוחר צומת; זום
// בכפתורים/גלגלת; pan בגרירה.
// ─────────────────────────────────────────────────────────────────────────────

export interface TreeNode {
  id: string
  name: string
  parent_id: string | null
  generation: number
  status: string
  relation?: string | null
}
interface TreeNodeH extends TreeNode { children: TreeNodeH[] }
interface Positioned { node: TreeNode; x: number; y: number; cx: number; cy: number }

// קבועים זהים לעץ הדורות המלא
const NW = 172, NH = 58, HGAP = 48, VGAP = 96, PAD = 72

// פלטת "קלף וחותם" — זהה לעץ הדורות
const PALETTE = [
  { bg: 'linear-gradient(160deg,#e0b94a 0%,#c69e2d 78%)', ring: '#c69e2d', shadow: 'rgba(198,158,45,0.34)', text: '#8a6a1e' },
  { bg: 'linear-gradient(160deg,#d3a344 0%,#bf8b34 78%)', ring: '#bf8b34', shadow: 'rgba(191,139,52,0.32)', text: '#7d5a1f' },
  { bg: 'linear-gradient(160deg,#c68a4e 0%,#b3703a 78%)', ring: '#b3703a', shadow: 'rgba(179,112,58,0.32)', text: '#7a4a26' },
  { bg: 'linear-gradient(160deg,#b56f4f 0%,#a15a3d 78%)', ring: '#a15a3d', shadow: 'rgba(161,90,61,0.32)',  text: '#6f3a2a' },
  { bg: 'linear-gradient(160deg,#a15a58 0%,#8c4a44 78%)', ring: '#8c4a44', shadow: 'rgba(140,74,68,0.32)',  text: '#5f3230' },
  { bg: 'linear-gradient(160deg,#867059 0%,#6f5a44 78%)', ring: '#6f5a44', shadow: 'rgba(111,90,68,0.32)',  text: '#4d3f30' },
]
const pal = (g: number) => PALETTE[g % PALETTE.length]

function buildForest(nodes: TreeNode[], rootId: string | null): TreeNodeH[] {
  const map = new Map<string, TreeNodeH>()
  nodes.forEach(n => map.set(n.id, { ...n, children: [] }))
  const roots: TreeNodeH[] = []
  nodes.forEach(n => {
    const node = map.get(n.id)!
    if (n.parent_id && map.has(n.parent_id)) map.get(n.parent_id)!.children.push(node)
    else roots.push(node)
  })
  if (rootId && map.has(rootId)) return [map.get(rootId)!]
  return roots
}

function subtreeW(n: TreeNodeH): number {
  return n.children.length ? n.children.reduce((s, c) => s + subtreeW(c), 0) : NW + HGAP
}

function layoutTree(roots: TreeNodeH[]): Positioned[] {
  const result: Positioned[] = []
  const place = (n: TreeNodeH, x: number, y: number) => {
    const sw = subtreeW(n), cx = x + sw / 2
    result.push({ node: n, x: cx - NW / 2, y, cx, cy: y + NH / 2 })
    let cx2 = x
    n.children.forEach(c => { place(c, cx2, y + NH + VGAP); cx2 += subtreeW(c) })
  }
  let sx = PAD
  roots.forEach(r => { place(r, sx, PAD); sx += subtreeW(r) })
  return result
}

export default function LineageTreeSvg({
  nodes, rootId, selectedId, onSelect,
}: {
  nodes: TreeNode[]
  rootId: string | null
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { positions, edges, w, h } = useMemo(() => {
    const forest = buildForest(nodes, rootId)
    const positions = layoutTree(forest)
    const byId = new Map(positions.map(p => [p.node.id, p]))
    const edges: { from: Positioned; to: Positioned }[] = []
    for (const p of positions) {
      if (p.node.parent_id && byId.has(p.node.parent_id)) edges.push({ from: byId.get(p.node.parent_id)!, to: p })
    }
    const w = positions.length ? Math.max(...positions.map(p => p.x + NW)) + PAD : 800
    const h = positions.length ? Math.max(...positions.map(p => p.y + NH)) + PAD : 400
    return { positions, edges, w, h }
  }, [nodes, rootId])

  const [zoom, setZoom] = useState(0.7)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const onDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-lin-node]')) return
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
  }, [pan])
  const onMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return
    setPan({ x: dragRef.current.px + (e.clientX - dragRef.current.x), y: dragRef.current.py + (e.clientY - dragRef.current.y) })
  }, [])
  const onUp = useCallback(() => { dragRef.current = null }, [])

  // ⚠️ גלילה חלקה: onWheel של React הוא passive, ולכן preventDefault בו מתעלם
  // והדפדפן מגלגל את העמוד במקביל — תחושת "קפיצות". רושמים listen ידני עם
  // { passive: false } כדי שהגלגלת תזיז את העץ בלבד, חלק. גלגלת רגילה = pan
  // אנכי/אופקי · Ctrl/⌘+גלגלת = זום סביב מרכז.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // ⚠️ זהה לעץ הדורות בתוכנה (LineageBranchView): גלגלת = זום (לא pan), כדי
    // שהחוויה תהיה אותו דבר בדיוק. שיפט/Ctrl אינם נדרשים — פשוט מגלגלים לזום,
    // ואת ההזזה עושים בגרירה. זום עדין (0.0012) לתחושה חלקה.
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      setZoom(z => Math.min(2.5, Math.max(0.3, +(z - e.deltaY * 0.0012).toFixed(3))))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // מרכוז ראשוני על השורש
  useEffect(() => {
    const el = containerRef.current
    if (!el || !positions.length) return
    const root = positions.find(p => p.node.id === rootId) ?? positions[0]
    setPan({ x: el.clientWidth / 2 - root.cx * 0.7, y: 24 })
  }, [positions, rootId])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50/60">
        <span className="text-[11px] text-slate-400">גררו להזזה · גלגלת לזום</span>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}
            className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-600 font-bold hover:bg-slate-50">−</button>
          <span className="text-xs font-semibold text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom(z => Math.min(2, z + 0.1))}
            className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-600 font-bold hover:bg-slate-50">+</button>
        </div>
      </div>
      <div ref={containerRef} dir="ltr" onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        className="relative overflow-hidden cursor-grab active:cursor-grabbing" style={{
          height: 500,
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(198,158,45,0.05), transparent 70%),' +
            'repeating-linear-gradient(0deg, transparent 0 39px, rgba(27,50,86,0.025) 39px 40px),' +
            'linear-gradient(170deg,#fdfbf5 0%,#f6f1e4 100%)',
        }}>
        <div style={{ position: 'absolute', transform: `translate(${pan.x}px, ${pan.y}px)`, transformOrigin: '0 0' }}>
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} width={w * zoom} height={(h + 60) * zoom}>
            {edges.map((e, i) => {
              const x1 = e.from.cx * zoom, y1 = (e.from.y + NH) * zoom, x2 = e.to.cx * zoom, y2 = e.to.y * zoom
              const mid = (y1 + y2) / 2
              const col = pal(e.from.node.generation).ring
              const r = Math.min(10 * zoom, Math.abs(x2 - x1) / 2, Math.abs(mid - y1))
              const dir = x2 >= x1 ? 1 : -1
              const d = Math.abs(x2 - x1) < 1
                ? `M${x1},${y1} L${x2},${y2}`
                : `M${x1},${y1} L${x1},${mid - r} Q${x1},${mid} ${x1 + dir * r},${mid} L${x2 - dir * r},${mid} Q${x2},${mid} ${x2},${mid + r} L${x2},${y2}`
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
                  <path d={d} fill="none" stroke={col} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
                </g>
              )
            })}
          </svg>
          {positions.map(pos => {
            const st = pos.node.status ?? 'verified'
            const genPal = pal(pos.node.generation)
            const relOverlay = pos.node.relation === 'son_in_law' ? 'linear-gradient(rgba(0,0,0,0.30),rgba(0,0,0,0.30)), ' : ''
            const isSel = selectedId === pos.node.id
            // צבע לפי סטטוס — זהה לעץ הדורות: verified=צבע הדור, rejected=אדום, pending=כתום
            const p = st === 'verified' ? genPal
              : st === 'rejected'
                ? { bg: 'linear-gradient(135deg,#EF4444 0%,#DC2626 100%)', ring: '#DC2626', shadow: 'rgba(220,38,38,0.4)', text: '#991B1B' }
                : { bg: 'linear-gradient(135deg,#FB923C 0%,#EA580C 100%)', ring: '#EA580C', shadow: 'rgba(234,88,12,0.4)', text: '#9A3412' }
            return (
              <div key={pos.node.id} data-lin-node="1"
                onClick={e => { e.stopPropagation(); onSelect(pos.node.id) }}
                style={{
                  position: 'absolute', left: pos.x * zoom, top: pos.y * zoom,
                  width: NW * zoom, height: NH * zoom, borderRadius: 16 * zoom,
                  background: relOverlay + p.bg,
                  boxShadow: isSel ? `0 0 0 3px #fff, 0 0 0 5.5px ${p.ring}, 0 12px 32px ${p.shadow}` : `0 4px 14px ${p.shadow}`,
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: `0 ${10 * zoom}px`, textAlign: 'center', color: '#fff', userSelect: 'none', direction: 'rtl', zIndex: 2,
                }}>
                <span style={{ position: 'absolute', top: -8 * zoom, insetInlineEnd: -8 * zoom, minWidth: 18 * zoom, height: 18 * zoom, padding: `0 ${4 * zoom}px`, borderRadius: 9 * zoom, background: '#fff', color: p.ring, fontSize: 11 * zoom, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${p.ring}` }}>
                  {st === 'verified' ? '✓' : st === 'rejected' ? '✕' : '!'}
                </span>
                <span style={{ fontSize: 13 * zoom, fontWeight: 800, lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{pos.node.name}</span>
                <span style={{ fontSize: 9.5 * zoom, opacity: 0.85, marginTop: 2 * zoom }}>
                  דור {pos.node.generation}{pos.node.relation === 'son' ? ' · בן' : pos.node.relation === 'son_in_law' ? ' · חתן' : ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
