// גרפי לוח הבקרה: SVG נקי, בלי ספרייה. הצבעים לפי הפלטה של לוח הבקרה (נייבי וזהב).
export const C = {
  navy: '#13203D', navy2: '#24365E', gold: '#B8893A', bad: '#B03A3A', warn: '#B0611A',
  mute: '#6B7386', ink: '#14203A', track: '#EEEAE2', line: '#E4E0D7',
}

const nf = (n: number) => n.toLocaleString('en')

export interface DonutPart { value: number; color: string }

// טבעת עם מספר ותווית במרכז
export function Donut({ parts, total, label, size = 150 }: {
  parts: DonutPart[]; total: number; label: string; size?: number
}) {
  let off = 0
  return (
    <svg width={size} height={size} viewBox="0 0 42 42" role="img" aria-label={`${label}: ${nf(total)}`}>
      <circle cx={21} cy={21} r={16} fill="none" stroke={C.track} strokeWidth={5} />
      {total > 0 && parts.filter(p => p.value > 0).map((p, i) => {
        const pct = (p.value / total) * 100
        const gap = pct > 3 ? 1 : 0
        const el = (
          <circle key={i} cx={21} cy={21} r={16} fill="none" stroke={p.color} strokeWidth={5}
            pathLength={100} strokeDasharray={`${Math.max(pct - gap, 0.6)} 100`}
            strokeDashoffset={-off} transform="rotate(-90 21 21)" />
        )
        off += pct
        return el
      })}
      <text x={21} y={21.5} textAnchor="middle" fontSize={6.5} fontWeight={800} fill={C.ink}>{nf(total)}</text>
      <text x={21} y={27} textAnchor="middle" fontSize={3.2} fill={C.mute}>{label}</text>
    </svg>
  )
}

// טבעת התקדמות: חלק מתוך סך
export function Ring({ value, total, label }: { value: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0
  return (
    <svg width={150} height={150} viewBox="0 0 42 42" role="img" aria-label={`${label}: ${nf(value)} מתוך ${nf(total)}`}>
      <circle cx={21} cy={21} r={16} fill="none" stroke={C.track} strokeWidth={4.5} />
      <circle cx={21} cy={21} r={16} fill="none" stroke={C.gold} strokeWidth={4.5} strokeLinecap="round"
        pathLength={100} strokeDasharray={`${pct} 100`} transform="rotate(-90 21 21)" />
      <text x={21} y={21} textAnchor="middle" fontSize={8} fontWeight={800} fill={C.ink}>{nf(value)}</text>
      <text x={21} y={27} textAnchor="middle" fontSize={3.2} fill={C.mute}>{label} {nf(total)}</text>
    </svg>
  )
}

export interface BarPoint { name: string; value: number; color: string }

// עמודות. הראשונה מימין (עברית).
export function Columns({ data, height = 220, barW = 64, valueSize = 14, max: maxIn }: {
  data: BarPoint[]; height?: number; barW?: number; valueSize?: number; max?: number
}) {
  const W = 560
  const base = height - 40
  const H = base - 20
  const max = Math.max(maxIn ?? 0, ...data.map(d => d.value), 1)
  const step = W / data.length
  const grid = [0, 1 / 3, 2 / 3, 1]
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} role="img"
      aria-label={data.map(d => `${d.name}: ${d.value}`).join(', ')}>
      {grid.map((g, i) => {
        const y = base - g * H
        return <line key={i} x1={0} x2={W} y1={y} y2={y} stroke={C.line} strokeDasharray={g ? '3 4' : undefined} />
      })}
      {data.map((d, i) => {
        const x = W - step * (i + 0.5) - barW / 2
        const h = Math.max((d.value / max) * H, 2)
        const y = base - h
        return (
          <g key={d.name}>
            <rect x={x} y={y} width={barW} height={h} rx={7} fill={d.color} opacity={d.value ? 1 : 0.35} />
            <text x={x + barW / 2} y={y - 8} textAnchor="middle" fontSize={valueSize} fontWeight={800} fill={C.ink}>{nf(d.value)}</text>
            <text x={x + barW / 2} y={base + 22} textAnchor="middle" fontSize={13} fill={C.mute}>{d.name}</text>
          </g>
        )
      })}
    </svg>
  )
}

// פס אופקי עם תווית ומספר
export function HBar({ label, value, pct, color, height }: {
  label: string; value: string; pct: number; color: string; height?: number
}) {
  return (
    <div className="r">
      <div className="t"><span>{label}</span><b className="num">{value}</b></div>
      <div className="track" style={height ? { height } : undefined}>
        <span style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color }} />
      </div>
    </div>
  )
}

// גרף שטח (המחשה): הנקודה הראשונה מימין
export function AreaChart({ labels, values }: { labels: string[]; values: number[] }) {
  const W = 900, H = 150, top = 10
  const max = Math.max(...values, 1) * 1.07
  const step = W / (labels.length - 1)
  const pts = values.map((v, i) => [W - i * step, top + H - (v / max) * H])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ')
  const last = pts[pts.length - 1]
  return (
    <svg viewBox="0 0 900 200" width="100%" height={200} preserveAspectRatio="none" aria-hidden>
      {[0, 0.5, 1].map(g => (
        <line key={g} x1={0} x2={W} y1={top + H * g} y2={top + H * g} stroke={C.line} strokeDasharray={g < 1 ? '3 4' : undefined} />
      ))}
      <path d={`${line} L${last[0]} ${top + H} L${W} ${top + H} Z`} fill={C.gold} opacity={0.12} />
      <path d={line} fill="none" stroke={C.gold} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
      {labels.map((t, i) => (
        <text key={t} x={W - i * step + (i === 0 ? -14 : i === labels.length - 1 ? 14 : 0)} y={top + H + 28}
          textAnchor="middle" fontSize={12} fill={C.mute}>{t}</text>
      ))}
    </svg>
  )
}
