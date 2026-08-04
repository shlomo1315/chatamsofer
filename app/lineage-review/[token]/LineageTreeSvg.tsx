'use client'
import { useMemo, useRef, useState, useCallback, useEffect } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// עץ יוחסין ויזואלי (SVG) לדף הביקורת הציבורי — אותו אלגוריתם פריסה כמו עץ
// הדורות בניהול (subtreeW: כל צומת ממורכז מעל תת-העץ שלו, בלי חפיפה). מיון
// ילדים לפי שם. צבע לפי סטטוס. זום בגלגלת/כפתורים ו-pan בגרירה.
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
interface Positioned { node: TreeNode; x: number; y: number; cx: number }

const NODE_W = 150
const NODE_H = 56
const H_GAP = 22
const V_GAP = 44
const PAD = 24

const NODE_COLOR: Record<string, { bg: string; ring: string }> = {
  verified: { bg: 'linear-gradient(160deg,#3B82F6 0%,#2563EB 100%)', ring: '#1D4ED8' },
  pending:  { bg: 'linear-gradient(160deg,#FB923C 0%,#EA580C 100%)', ring: '#C2410C' },
  rejected: { bg: 'linear-gradient(160deg,#F87171 0%,#DC2626 100%)', ring: '#B91C1C' },
}
const glyph = (s: string) => s === 'verified' ? '✓' : s === 'rejected' ? '✕' : '!'

// בונה יער היררכי מהצמתים השטוחים, ממויין לפי שם — בדיוק כמו עץ הדורות
function buildForest(nodes: TreeNode[], rootId: string | null): TreeNodeH[] {
  const byId = new Map<string, TreeNodeH>()
  nodes.forEach(n => byId.set(n.id, { ...n, children: [] }))
  const roots: TreeNodeH[] = []
  for (const n of nodes) {
    const node = byId.get(n.id)!
    if (n.parent_id && byId.has(n.parent_id)) byId.get(n.parent_id)!.children.push(node)
    else if (!n.parent_id) roots.push(node)
  }
  for (const node of byId.values()) node.children.sort((a, b) => a.name.localeCompare(b.name, 'he'))
  // אם יש rootId מפורש — מתחילים ממנו בלבד (הענף המשותף)
  if (rootId && byId.has(rootId)) return [byId.get(rootId)!]
  return roots.length ? roots : [...byId.values()].filter(n => !n.parent_id || !byId.has(n.parent_id))
}

// רוחב תת-העץ (בפיקסלים) — לפריסה בלי חפיפה, כמו ב-admin/lineage
function subtreeW(n: TreeNodeH): number {
  if (!n.children.length) return NODE_W + H_GAP
  return n.children.reduce((s, c) => s + subtreeW(c), 0)
}

function layoutForest(roots: TreeNodeH[]): { positioned: Positioned[]; width: number; height: number } {
  const result: Positioned[] = []
  const place = (n: TreeNodeH, x: number, y: number) => {
    const sw = subtreeW(n)
    const cx = x + sw / 2
    result.push({ node: n, x: cx - NODE_W / 2, y, cx })
    let cx2 = x
    for (const c of n.children) { place(c, cx2, y + NODE_H + V_GAP); cx2 += subtreeW(c) }
  }
  let sx = PAD
  for (const r of roots) { place(r, sx, PAD); sx += subtreeW(r) }
  const width = result.length ? Math.max(...result.map(p => p.x + NODE_W)) + PAD : 400
  const height = result.length ? Math.max(...result.map(p => p.y + NODE_H)) + PAD : 300
  return { positioned: result, width, height }
}

export default function LineageTreeSvg({
  nodes, rootId, selectedId, onSelect,
}: {
  nodes: TreeNode[]
  rootId: string | null
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const { positioned, width, height, edges } = useMemo(() => {
    const forest = buildForest(nodes, rootId)
    const { positioned, width, height } = layoutForest(forest)
    const byId = new Map(positioned.map(p => [p.node.id, p]))
    const edges: { from: Positioned; to: Positioned }[] = []
    for (const p of positioned) {
      if (p.node.parent_id && byId.has(p.node.parent_id)) edges.push({ from: byId.get(p.node.parent_id)!, to: p })
    }
    return { positioned, width, height, edges }
  }, [nodes, rootId])

  const [zoom, setZoom] = useState(0.75)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const onDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-node]')) return
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
  }, [pan])
  const onMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current) return
    setPan({ x: dragRef.current.px + (e.clientX - dragRef.current.x), y: dragRef.current.py + (e.clientY - dragRef.current.y) })
  }, [])
  const onUp = useCallback(() => { dragRef.current = null }, [])

  // גלילת עכבר: Ctrl/⌘+גלגלת = זום, גלגלת רגילה = pan אנכי, Shift+גלגלת = pan אופקי
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      setZoom(z => Math.min(2, Math.max(0.3, z - e.deltaY * 0.0015)))
    } else if (e.shiftKey) {
      setPan(p => ({ ...p, x: p.x - e.deltaY }))
    } else {
      setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
    }
  }, [])

  // מרכוז ראשוני על השורש/ראש היער
  useEffect(() => {
    const el = containerRef.current
    if (!el || !positioned.length) return
    const root = positioned.find(p => p.node.id === rootId) ?? positioned[0]
    setPan({ x: el.clientWidth / 2 - root.cx * 0.75, y: 20 })
  }, [positioned, rootId])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50/60">
        <span className="text-[11px] text-slate-400">גררו להזזה · גלגלת לגלילה · Ctrl+גלגלת לזום</span>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setZoom(z => Math.max(0.3, z - 0.1))}
            className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-600 font-bold hover:bg-slate-50">−</button>
          <span className="text-xs font-semibold text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom(z => Math.min(2, z + 0.1))}
            className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-600 font-bold hover:bg-slate-50">+</button>
        </div>
      </div>
      <div ref={containerRef} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp} onWheel={onWheel}
        className="relative overflow-hidden cursor-grab active:cursor-grabbing bg-[#FAF7F0]" style={{ height: 480 }}>
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'absolute' }}>
          <svg width={width} height={height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {edges.map((e, i) => {
              const x1 = e.from.x + NODE_W / 2, y1 = e.from.y + NODE_H
              const x2 = e.to.x + NODE_W / 2, y2 = e.to.y
              const my = (y1 + y2) / 2
              return <path key={i} d={`M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`} fill="none" stroke="#C9B58B" strokeWidth={2.5} strokeLinecap="round" />
            })}
          </svg>
          {positioned.map(p => {
            const c = NODE_COLOR[p.node.status] ?? NODE_COLOR.pending
            const sel = selectedId === p.node.id
            return (
              <div key={p.node.id} data-node role="button" tabIndex={0}
                onClick={() => onSelect(p.node.id)}
                onKeyDown={ev => { if (ev.key === 'Enter') onSelect(p.node.id) }}
                style={{
                  position: 'absolute', left: p.x, top: p.y, width: NODE_W, height: NODE_H,
                  background: c.bg, color: '#fff', borderRadius: 12,
                  border: sel ? '3px solid #1B3256' : `2px solid ${c.ring}`,
                  boxShadow: sel ? '0 0 0 4px rgba(27,50,86,0.15)' : '0 2px 6px rgba(0,0,0,0.12)',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', padding: '4px 8px', textAlign: 'center', userSelect: 'none',
                }}>
                <span style={{ position: 'absolute', top: -9, insetInlineEnd: -9, width: 20, height: 20, borderRadius: '50%', background: '#fff', color: c.ring, fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${c.ring}` }}>{glyph(p.node.status)}</span>
                <span style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.node.name}</span>
                <span style={{ fontSize: 9, opacity: 0.85, marginTop: 2 }}>
                  דור {p.node.generation}{p.node.relation === 'son' ? ' · בן' : p.node.relation === 'son_in_law' ? ' · חתן' : ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
