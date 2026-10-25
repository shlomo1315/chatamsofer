'use client'

import { useMemo, useState } from 'react'
import { fmt, type ShellData, type ShellNode } from '@/lib/lineageShell'

interface Props {
  data: ShellData
  trunk: number
  onPickTrunk: (i: number) => void
}

const CX = 500, CY = 520

function arc(r0: number, r1: number, a0: number, a1: number) {
  const p = (r: number, a: number) => [CX + r * Math.cos(a), CY - r * Math.sin(a)]
  const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0)
  const l = a1 - a0 > Math.PI ? 1 : 0
  return `M${x0},${y0}A${r1},${r1} 0 ${l} 0 ${x1},${y1}L${x2},${y2}A${r0},${r0} 0 ${l} 1 ${x3},${y3}Z`
}

interface Seg { d: string; trunk: number; gen: number; tip: string; opacity: number }

/** פרישת העץ כטבעות: רוחב הקשת של צומת לפי מספר צאצאיו, טבעת לכל דור */
function layout(data: ShellData, minSpan: number) {
  const G = data.maxGen
  const R = [70, ...Array.from({ length: G }, (_, k) => 70 + 362 * Math.sqrt((k + 1) / G))]
  const out: Seg[] = []
  const w = (n: ShellNode) => (data.stats.get(n.id)?.desc ?? 0) + 1
  const place = (n: ShellNode, hi: number, span: number, ring: number, trunk: number) => {
    if (span < minSpan || ring >= R.length - 1) return
    const lo = hi - span
    const st = data.stats.get(n.id)
    out.push({
      d: arc(R[ring] + 2, R[ring + 1], lo, hi), trunk, gen: ring,
      tip: `${n.name} · דור ${ring + 1}${st && st.desc ? ` · ${fmt(st.desc)} צאצאים` : ''}`,
      opacity: Math.max(0.3, 0.9 - ring * 0.07),
    })
    const kids = data.childrenOf.get(n.id) ?? []
    if (!kids.length) return
    const sorted = [...kids].sort((a, b) => w(b) - w(a))
    const total = sorted.reduce((s, k) => s + w(k), 0)
    let cur = hi
    for (const k of sorted) {
      const sp = span * (w(k) / total)
      place(k, cur, sp, ring + 1, trunk)
      cur -= sp
    }
  }
  const root = data.root
  if (root) {
    const total = data.trunks.reduce((s, t) => s + w(t.node), 0) || 1
    let cur = Math.PI
    data.trunks.forEach((t, i) => {
      const sp = Math.PI * (w(t.node) / total)
      place(t.node, cur, sp, 1, i)
      cur -= sp
    })
  }
  return { R, segs: out }
}

export default function FanChart({ data, trunk, onPickTrunk }: Props) {
  const [tip, setTip] = useState<{ t: string; x: number; y: number } | null>(null)
  const { R, segs, spans } = useMemo(() => {
    let minSpan = 0.0012
    let res = layout(data, minSpan)
    while (res.segs.length > 7000 && minSpan < 0.02) { minSpan *= 2; res = layout(data, minSpan) }
    const total = data.trunks.reduce((s, t) => s + t.stat.desc + 1, 0) || 1
    const sp: { a0: number; a1: number; w: number }[] = []
    for (const t of data.trunks) {
      const wd = Math.PI * (t.stat.desc + 1) / total
      const a = sp.length ? sp[sp.length - 1].a0 : Math.PI
      sp.push({ a0: a - wd, a1: a, w: wd })
    }
    return { ...res, spans: sp }
  }, [data])

  if (!data.root) return <div className="card" style={{ padding: 30, textAlign: 'center' }}>אין עדיין צמתים בעץ</div>
  const dim = (i: number) => (trunk >= 0 && trunk !== i ? 0.18 : 1)

  return (
    <div className="card fanw">
      <svg viewBox="0 0 1000 540" aria-label="מניפת הדורות"
        onMouseMove={e => { const d = (e.target as SVGElement).dataset?.t; setTip(d ? { t: d, x: e.clientX + 12, y: e.clientY + 12 } : null) }}
        onMouseLeave={() => setTip(null)}
        onClick={e => { const i = (e.target as SVGElement).dataset?.i; if (i != null) onPickTrunk(+i) }}>
        <path d={arc(0, R[0], 0, Math.PI)} fill="#f3ead7" stroke="#fff" />
        <text x={CX} y={CY - 28} textAnchor="middle" fontSize="15" fontWeight="700" fill="#6e5320">החתם סופר</text>
        {segs.map((s, k) => (
          <path key={k} d={s.d} fill={data.trunks[s.trunk].color} fillOpacity={s.opacity * dim(s.trunk)} stroke="#fff" strokeWidth={s.gen === 1 ? 2 : 0.6}
            data-t={s.tip} data-i={s.trunk} style={{ cursor: 'pointer' }} />
        ))}
        {data.trunks.map((t, i) => {
          const sp = spans[i]
          if (!sp || sp.w <= 0.12) return null
          const m = (sp.a0 + sp.a1) / 2, rr = (R[0] + R[1]) / 2
          return <text key={i} x={CX + rr * Math.cos(m)} y={CY - rr * Math.sin(m)} textAnchor="middle" fontSize="12" fill="#fff" fontWeight="600" pointerEvents="none">{fmt(t.stat.desc)}</text>
        })}
        {R.map((r, g) => <text key={g} x={CX + r - (g ? 6 : 0)} y={CY + 16} fontSize="11" fill="#6b767b" textAnchor="middle">{g ? `דור ${g + 1}` : ''}</text>)}
      </svg>
      <div>
        <h3 style={{ margin: '4px 0 8px', fontSize: 16 }}>מניפת הדורות</h3>
        <p style={{ fontSize: 13, color: 'var(--mute)', margin: '0 0 14px' }}>כל טבעת היא דור. רוחב הקשת לפי מספר הצאצאים, והכול מהנתונים האמיתיים. לחיצה על קשת פותחת את הגזע שלה בעץ.</p>
        <div className="leg">
          {data.trunks.map(t => (
            <div key={t.node.id}><i style={{ background: t.color }} />{t.node.name}
              <span style={{ marginInlineStart: 'auto', color: 'var(--mute)', fontVariantNumeric: 'tabular-nums' }}>{fmt(t.stat.desc)}</span></div>
          ))}
        </div>
      </div>
      {tip && <div className="tip" style={{ display: 'block', left: tip.x, top: tip.y }}>{tip.t}</div>}
    </div>
  )
}
