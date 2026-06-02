'use client'
import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Loader2 } from 'lucide-react'

interface LineageNode {
  id: string
  name: string
  generation: number
  parent_id: string | null
}
interface TNode extends LineageNode { children: TNode[] }
interface Pos { node: TNode; x: number; y: number; cx: number; cy: number }

const NW = 172, NH = 58, HGAP = 48, VGAP = 96, PAD = 72

const PALETTE = [
  { bg: 'linear-gradient(135deg,#7C3AED 0%,#5B21B6 100%)', ring: '#7C3AED', shadow: 'rgba(124,58,237,0.38)' },
  { bg: 'linear-gradient(135deg,#2563EB 0%,#1E40AF 100%)', ring: '#2563EB', shadow: 'rgba(37,99,235,0.32)'  },
  { bg: 'linear-gradient(135deg,#0891B2 0%,#0E7490 100%)', ring: '#0891B2', shadow: 'rgba(8,145,178,0.32)'  },
  { bg: 'linear-gradient(135deg,#059669 0%,#047857 100%)', ring: '#059669', shadow: 'rgba(5,150,105,0.32)'  },
  { bg: 'linear-gradient(135deg,#D97706 0%,#B45309 100%)', ring: '#D97706', shadow: 'rgba(217,119,6,0.32)'  },
  { bg: 'linear-gradient(135deg,#DB2777 0%,#BE185D 100%)', ring: '#DB2777', shadow: 'rgba(219,39,119,0.32)' },
]
const pal = (g: number) => PALETTE[g % PALETTE.length]

function buildTree(flat: LineageNode[]): TNode[] {
  const map = new Map<string, TNode>()
  flat.forEach(n => map.set(n.id, { ...n, children: [] }))
  const roots: TNode[] = []
  flat.forEach(n => {
    const node = map.get(n.id)!
    if (n.parent_id && map.has(n.parent_id)) map.get(n.parent_id)!.children.push(node)
    else roots.push(node)
  })
  return roots
}
function subtreeW(n: TNode): number {
  return n.children.length ? n.children.reduce((s, c) => s + subtreeW(c), 0) : NW + HGAP
}
function layoutTree(roots: TNode[]): Pos[] {
  const result: Pos[] = []
  function place(n: TNode, x: number, y: number) {
    const sw = subtreeW(n), cx = x + sw / 2
    result.push({ node: n, x: cx - NW / 2, y, cx, cy: y + NH / 2 })
    let cx2 = x
    n.children.forEach(c => { place(c, cx2, y + NH + VGAP); cx2 += subtreeW(c) })
  }
  let sx = PAD
  roots.forEach(r => { place(r, sx, PAD); sx += subtreeW(r) })
  return result
}
function canvasSize(pos: Pos[]) {
  if (!pos.length) return { w: 800, h: 400 }
  return { w: Math.max(...pos.map(p => p.x + NW)) + PAD, h: Math.max(...pos.map(p => p.y + NH)) + PAD }
}
function collectEdges(positions: Pos[]) {
  const byId = new Map(positions.map(p => [p.node.id, p]))
  return positions.flatMap(p =>
    p.node.children.map(c => { const cp = byId.get(c.id); return cp ? { from: p, to: cp } : null })
      .filter(Boolean) as { from: Pos; to: Pos }[]
  )
}

export default function LineageBranchView({ nodeId }: { nodeId: string | null }) {
  const [allNodes, setAllNodes] = useState<LineageNode[]>([])
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(0.65)
  const canvasRef = useRef<HTMLDivElement>(null)
  const didCenter = useRef(false)
  const dragRef = useRef<{ startX: number; startY: number; scrollX: number; scrollY: number } | null>(null)
  const zoomAnchor = useRef<{ px: number; py: number; offX: number; offY: number } | null>(null)

  useEffect(() => {
    fetch('/api/lineage?all=1')
      .then(r => r.json())
      .then(d => setAllNodes(d.nodes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const positions = useMemo(() => layoutTree(buildTree(allNodes)), [allNodes])
  const edges = useMemo(() => collectEdges(positions), [positions])
  const { w, h } = useMemo(() => canvasSize(positions), [positions])

  // path from root to the selected node (set of ids on the branch)
  const branch = useMemo(() => {
    const s = new Set<string>()
    if (!nodeId) return s
    const map = new Map(allNodes.map(n => [n.id, n]))
    let cur = map.get(nodeId)
    let guard = 0
    while (cur && guard < 60) { s.add(cur.id); cur = cur.parent_id ? map.get(cur.parent_id) : undefined; guard++ }
    return s
  }, [nodeId, allNodes])

  // wheel zoom toward cursor
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault(); e.stopPropagation()
      setZoom(prev => {
        const next = Math.min(2.5, Math.max(0.2, +(prev - e.deltaY * 0.0015).toFixed(3)))
        if (next === prev) return prev
        const rect = el.getBoundingClientRect()
        const offX = e.clientX - rect.left, offY = e.clientY - rect.top
        zoomAnchor.current = { px: (el.scrollLeft + offX) / prev, py: (el.scrollTop + offY) / prev, offX, offY }
        return next
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [loading])

  useLayoutEffect(() => {
    const el = canvasRef.current, a = zoomAnchor.current
    if (!el || !a) return
    el.scrollLeft = a.px * zoom - a.offX
    el.scrollTop = a.py * zoom - a.offY
    zoomAnchor.current = null
  }, [zoom])

  // drag to pan
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      dragRef.current = { startX: e.clientX, startY: e.clientY, scrollX: el.scrollLeft, scrollY: el.scrollTop }
      el.style.cursor = 'grabbing'
    }
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startX, dy = e.clientY - dragRef.current.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        e.preventDefault()
        el.scrollLeft = dragRef.current.scrollX - dx
        el.scrollTop = dragRef.current.scrollY - dy
      }
    }
    const onUp = () => { dragRef.current = null; el.style.cursor = 'grab' }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [loading])

  // center on the selected node (or horizontally) on first load
  useEffect(() => {
    if (!positions.length || didCenter.current) return
    const el = canvasRef.current
    if (!el) return
    didCenter.current = true
    requestAnimationFrame(() => {
      const c = canvasRef.current
      if (!c) return
      const sel = nodeId ? positions.find(p => p.node.id === nodeId) : null
      if (sel) {
        c.scrollLeft = sel.cx * zoom - c.clientWidth / 2
        c.scrollTop = Math.max(0, sel.cy * zoom - c.clientHeight / 2)
      } else {
        const s = (w * zoom - c.clientWidth) / 2
        if (s > 0) c.scrollLeft = s
      }
    })
  }, [positions, w, zoom, nodeId])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 0', color: '#7C3AED' }}>
      <Loader2 size={16} className="animate-spin" /><span style={{ fontSize: 13 }}>טוען עץ דורות...</span>
    </div>
  )
  if (!allNodes.length) return (
    <div style={{ padding: 16, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>לא נמצאו נתוני שושלת</div>
  )

  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', gap: 5, marginBottom: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => setZoom(z => Math.min(2.5, z + 0.1))} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1', fontWeight: 700 }}>+</button>
        <button type="button" onClick={() => { setZoom(0.65); didCenter.current = false }} style={{ height: 26, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', fontSize: 10, cursor: 'pointer', padding: '0 7px', color: '#64748B', fontWeight: 600 }}>{Math.round(zoom * 100)}%</button>
        <button type="button" onClick={() => setZoom(z => Math.max(0.2, z - 0.1))} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1', fontWeight: 700 }}>−</button>
      </div>

      <div
        ref={canvasRef}
        dir="ltr"
        style={{
          overflow: 'auto', overflowAnchor: 'none', borderRadius: 14,
          background: 'linear-gradient(180deg,#FCFCFF 0%,#F7F5FF 100%)',
          border: '1.5px solid #E8E0F5', height: 420, cursor: 'grab',
        }}
      >
        <div style={{ position: 'relative', width: w * zoom, height: (h + 60) * zoom, minWidth: '100%' }}>
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} width={w * zoom} height={(h + 60) * zoom}>
            {edges.map((e, i) => {
              const x1 = e.from.cx * zoom, y1 = (e.from.y + NH) * zoom, x2 = e.to.cx * zoom, y2 = e.to.y * zoom
              const mid = (y1 + y2) / 2
              const onBranch = branch.has(e.from.node.id) && branch.has(e.to.node.id)
              const col = onBranch ? pal(e.from.node.generation).ring : '#CBD5E1'
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
            const p = pal(pos.node.generation)
            const onBranch = branch.has(pos.node.id)
            const isTarget = pos.node.id === nodeId
            return (
              <div key={pos.node.id} style={{
                position: 'absolute', left: pos.x * zoom, top: pos.y * zoom,
                width: NW * zoom, height: NH * zoom, borderRadius: 16 * zoom,
                background: p.bg,
                boxShadow: isTarget
                  ? `0 0 0 3px #fff, 0 0 0 5.5px ${p.ring}, 0 12px 32px ${p.shadow}`
                  : `0 4px 16px ${p.shadow}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transform: isTarget ? 'scale(1.07)' : 'scale(1)',
                zIndex: isTarget ? 20 : 2, userSelect: 'none',
                opacity: onBranch ? 1 : 0.32,
                transition: 'opacity .2s',
              }}>
                <div style={{
                  position: 'absolute', top: -10 * zoom, right: 6 * zoom,
                  background: '#fff', color: p.ring, fontSize: Math.max(7, 9 * zoom), fontWeight: 900,
                  width: 20 * zoom, height: 20 * zoom, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${p.ring}`,
                }}>{pos.node.generation}</div>
                <span style={{
                  color: '#fff', fontWeight: 700,
                  fontSize: Math.max(8, (pos.node.name.length > 14 ? 10 : pos.node.name.length > 10 ? 12 : 13) * zoom),
                  textAlign: 'center', direction: 'rtl', padding: `0 ${12 * zoom}px`, lineHeight: 1.3,
                  textShadow: '0 1px 3px rgba(0,0,0,0.3)', maxWidth: (NW - 14) * zoom, overflow: 'hidden',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                }}>{pos.node.name}</span>
              </div>
            )
          })}
        </div>
      </div>
      <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 5, textAlign: 'center' }}>
        הענף של הנתמך מודגש · גלגל עכבר להגדלה · גרירה להזזה
      </p>
    </div>
  )
}
