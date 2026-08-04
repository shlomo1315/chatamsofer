'use client'
import { useMemo, useRef, useState, useCallback, useEffect } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// עץ יוחסין ויזואלי (SVG) לדף הביקורת הציבורי — עץ מסתעף אנכי עם צמתים צבועים
// לפי סטטוס וקווי חיבור מעוגלים, בדומה לעץ הדורות בניהול. לחיצה על צומת בוחרת
// אותו (הפעולות מוצגות מעליו ע"י ההורה). זום ו-pan בגרירה.
// ─────────────────────────────────────────────────────────────────────────────

export interface TreeNode {
  id: string
  name: string
  parent_id: string | null
  generation: number
  status: string
  relation?: string | null
}

// צבע לפי סטטוס — תואם את שפת הצבעים בעץ הדורות
const NODE_COLOR: Record<string, { bg: string; ring: string; text: string }> = {
  verified: { bg: 'linear-gradient(160deg,#3B82F6 0%,#2563EB 100%)', ring: '#1D4ED8', text: '#fff' },
  pending:  { bg: 'linear-gradient(160deg,#FB923C 0%,#EA580C 100%)', ring: '#C2410C', text: '#fff' },
  rejected: { bg: 'linear-gradient(160deg,#F87171 0%,#DC2626 100%)', ring: '#B91C1C', text: '#fff' },
}
const glyph = (s: string) => s === 'verified' ? '✓' : s === 'rejected' ? '✕' : '!'

const NODE_W = 150
const NODE_H = 54
const H_GAP = 26   // רווח אופקי בין אחים
const V_GAP = 78   // רווח אנכי בין דורות

interface Positioned extends TreeNode { x: number; y: number }

export default function LineageTreeSvg({
  nodes, rootId, selectedId, onSelect,
}: {
  nodes: TreeNode[]
  rootId: string | null
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  // ── פריסה: אלגוריתם עץ פשוט. עלים מקבלים x עוקב, הורים ממורכזים מעל ילדיהם ──
  const { positioned, edges, width, height } = useMemo(() => {
    const byId = new Map(nodes.map(n => [n.id, n]))
    const childrenOf = new Map<string, TreeNode[]>()
    for (const n of nodes) {
      if (!n.parent_id || !byId.has(n.parent_id)) continue
      const l = childrenOf.get(n.parent_id); if (l) l.push(n); else childrenOf.set(n.parent_id, [n])
    }
    for (const [, arr] of childrenOf) arr.sort((a, b) => a.name.localeCompare(b.name, 'he'))

    const pos = new Map<string, Positioned>()
    let cursor = 0
    const minGen = nodes.length ? Math.min(...nodes.map(n => n.generation)) : 0
    // DFS: מציב עלים משמאל-לימין, הורה ממורכז מעל ילדיו
    const place = (id: string): number => {
      const n = byId.get(id)!
      const kids = childrenOf.get(id) ?? []
      const y = (n.generation - minGen) * (NODE_H + V_GAP)
      let x: number
      if (!kids.length) {
        x = cursor * (NODE_W + H_GAP)
        cursor++
      } else {
        const xs = kids.map(k => place(k.id))
        x = (xs[0] + xs[xs.length - 1]) / 2
      }
      pos.set(id, { ...n, x, y })
      return x
    }
    if (rootId && byId.has(rootId)) place(rootId)
    else for (const n of nodes) if (!pos.has(n.id) && (!n.parent_id || !byId.has(n.parent_id))) place(n.id)

    const es: { from: Positioned; to: Positioned }[] = []
    for (const n of nodes) {
      if (n.parent_id && pos.has(n.parent_id) && pos.has(n.id)) {
        es.push({ from: pos.get(n.parent_id)!, to: pos.get(n.id)! })
      }
    }
    const all = [...pos.values()]
    const maxX = all.length ? Math.max(...all.map(p => p.x)) : 0
    const maxY = all.length ? Math.max(...all.map(p => p.y)) : 0
    return { positioned: all, edges: es, width: maxX + NODE_W + 40, height: maxY + NODE_H + 40 }
  }, [nodes, rootId])

  // ── זום + pan ──
  const [zoom, setZoom] = useState(0.8)
  const [pan, setPan] = useState({ x: 20, y: 20 })
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

  // מרכוז ראשוני על השורש
  useEffect(() => {
    const el = containerRef.current
    if (!el || !positioned.length) return
    const root = positioned.find(p => p.id === rootId) ?? positioned[0]
    setPan({ x: el.clientWidth / 2 - (root.x + NODE_W / 2) * 0.8, y: 24 })
  }, [positioned, rootId])

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* בקרת זום */}
      <div className="flex items-center justify-end gap-1.5 px-3 py-2 border-b border-slate-100 bg-slate-50/60">
        <button type="button" onClick={() => setZoom(z => Math.max(0.35, z - 0.1))}
          className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-600 font-bold hover:bg-slate-50">−</button>
        <span className="text-xs font-semibold text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(z => Math.min(2, z + 0.1))}
          className="w-7 h-7 rounded-lg border border-slate-200 bg-white text-slate-600 font-bold hover:bg-slate-50">+</button>
      </div>
      <div ref={containerRef} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
        className="relative overflow-hidden cursor-grab active:cursor-grabbing bg-[#FAF7F0]" style={{ height: 460 }}>
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0', position: 'absolute' }}>
          <svg width={width} height={height} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {edges.map((e, i) => {
              const x1 = e.from.x + NODE_W / 2, y1 = e.from.y + NODE_H
              const x2 = e.to.x + NODE_W / 2, y2 = e.to.y
              const my = (y1 + y2) / 2
              const d = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`
              return <path key={i} d={d} fill="none" stroke="#C9B58B" strokeWidth={2.5} strokeLinecap="round" />
            })}
          </svg>
          {positioned.map(p => {
            const c = NODE_COLOR[p.status] ?? NODE_COLOR.pending
            const sel = selectedId === p.id
            return (
              <div key={p.id} data-node role="button" tabIndex={0}
                onClick={() => onSelect(p.id)}
                onKeyDown={ev => { if (ev.key === 'Enter') onSelect(p.id) }}
                style={{
                  position: 'absolute', left: p.x, top: p.y, width: NODE_W, height: NODE_H,
                  background: c.bg, color: c.text, borderRadius: 12,
                  border: sel ? '3px solid #1B3256' : `2px solid ${c.ring}`,
                  boxShadow: sel ? '0 0 0 4px rgba(27,50,86,0.15)' : '0 2px 6px rgba(0,0,0,0.12)',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', padding: '4px 8px', textAlign: 'center', userSelect: 'none',
                }}>
                <span style={{ position: 'absolute', top: -9, insetInlineEnd: -9, width: 20, height: 20, borderRadius: '50%', background: '#fff', color: c.ring, fontSize: 12, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${c.ring}` }}>{glyph(p.status)}</span>
                <span style={{ fontSize: 11, fontWeight: 800, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{p.name}</span>
                <span style={{ fontSize: 9, opacity: 0.85, marginTop: 2 }}>
                  דור {p.generation}{p.relation === 'son' ? ' · בן' : p.relation === 'son_in_law' ? ' · חתן' : ''}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
