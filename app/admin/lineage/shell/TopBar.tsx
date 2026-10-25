'use client'

import { useMemo, useState } from 'react'
import { Zap } from 'lucide-react'
import { fmt, type ShellData } from '@/lib/lineageShell'
import type { QueueId, ShellCounts } from './types'

interface Props {
  data: ShellData
  counts: ShellCounts
  onOpenQueue: (q: QueueId, trunk?: number) => void
}

interface NowItem { q: QueueId; title: string; sub: string; trunk?: number }

export default function TopBar({ data, counts, onOpenQueue }: Props) {
  const [open, setOpen] = useState(false)
  const s = counts.summary
  const total = data.total || 1
  const vPct = (data.verified / total) * 100
  const dups = s ? s.dup.groups + s.parallel.groups : null

  // המשימות לפי סדר חשיבות; כל אחת נגזרת ממספרים אמיתיים ונעלמת כשאין מה לטפל
  const items = useMemo<NowItem[]>(() => {
    const out: NowItem[] = []
    if (s && s.parallel.safeGroups > 0) {
      out.push({ q: 'safe', title: `מזג ${fmt(s.parallel.safeGroups)} קבוצות בטוחות`, sub: `זהות לגמרי: ${fmt(s.parallel.safeRemovable)} עותקים יוסרו` })
    }
    if (s && counts.parallelGroups.length > 0) {
      const per = new Map<number, number>()
      for (const g of counts.parallelGroups) {
        const t = g.nodes[0] ? data.trunkOf.get(g.nodes[0].id) : undefined
        if (t !== undefined) per.set(t, (per.get(t) ?? 0) + 1)
      }
      const top = [...per.entries()].sort((a, b) => b[1] - a[1])[0]
      if (top) {
        out.push({ q: 'parallel', trunk: top[0], title: `רישום מקביל בגזע ${data.trunks[top[0]].node.name}`, sub: `${fmt(top[1])} קבוצות, הכי הרבה בגזע אחד` })
      }
    }
    if (counts.requests) out.push({ q: 'requests', title: `ענה ל-${fmt(counts.requests)} בקשות משפחות`, sub: 'משפחות מחכות לתשובה' })
    if (s && s.unlinked > 0) out.push({ q: 'unlinked', title: `שייך ${fmt(s.unlinked)} משפחות לא מקושרות`, sub: 'רשומות שעוד לא שויכו לעץ' })
    return out
  }, [s, counts, data])

  const go = (q: QueueId, trunk?: number) => { setOpen(false); onOpenQueue(q, trunk) }

  return (
    <>
      <div className="ov"><div className="ovin">
        <div className="prog">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <b>מצב אימות העץ</b>
            <span style={{ color: 'var(--mute)' }}>{fmt(data.verified)} מתוך {fmt(data.total)} מאומתים</span>
          </div>
          <div className="bar">
            <i style={{ width: `${vPct}%`, background: 'var(--ok)' }} />
            <i style={{ width: `${100 - vPct}%`, background: '#e6d5ad' }} />
          </div>
        </div>
        <button className="st k" onClick={() => onOpenQueue('approve')}><b>{fmt(data.verified)}</b><span>מאומתים</span></button>
        <button className="st w" onClick={() => onOpenQueue('approve')}><b>{fmt(data.pending)}</b><span>ממתינים לאימות</span></button>
        <button className="st d" onClick={() => onOpenQueue(s && s.parallel.safeGroups > 0 ? 'safe' : 'likely')}>
          <b>{dups == null ? '…' : fmt(dups)}</b><span>קבוצות כפולות</span>
        </button>
        <button className="st w" onClick={() => onOpenQueue('unlinked')}><b>{s ? fmt(s.unlinked) : '…'}</b><span>לא מקושרים</span></button>
        <button className="st" onClick={() => onOpenQueue('requests')}><b>{counts.requests == null ? '…' : fmt(counts.requests)}</b><span>בקשות משפחות</span></button>
        <button className="now" onClick={() => setOpen(true)}>
          <Zap size={18} />
          <span>מה לטפל עכשיו<small>{items.length} משימות לפי סדר חשיבות</small></span>
        </button>
      </div></div>

      <div className={`dr ${open ? 'on' : ''}`} onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
        <div className="drp">
          <h3>מה לטפל עכשיו</h3>
          <p style={{ fontSize: 13, color: 'var(--mute)', margin: 0 }}>מסודר לפי מה שהכי משפיע על העץ. לחיצה פותחת את התור עם הסינון הנכון.</p>
          <div>
            {items.map((x, i) => (
              <button key={x.q} className="ti" onClick={() => go(x.q, x.trunk)}>
                <span className="nb">{i + 1}</span>
                <span className="tt">{x.title}<span>{x.sub}</span></span>›
              </button>
            ))}
            {items.length === 0 && (
              <div className="done"><b>{counts.loading ? 'טוען…' : 'הכול נקי'}</b>{counts.loading ? '' : 'אין כרגע משימות דחופות'}</div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
