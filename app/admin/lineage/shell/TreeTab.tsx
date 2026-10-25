'use client'

import { useRef, useState } from 'react'
import { fmt, initials, pathTo, type ShellData, type ShellNode } from '@/lib/lineageShell'
import type { ParallelGroup } from '@/lib/lineageControlCenter'
import type { ShellSettings } from './types'

export interface TreeActions {
  approve: (n: ShellNode) => void
  keepPending: (n: ShellNode) => void
  add: (n: ShellNode) => void
  edit: (n: ShellNode) => void
  remove: (n: ShellNode) => void
  share: (n: ShellNode) => void
  print: (n: ShellNode) => void
}

interface Props {
  data: ShellData
  trunk: number
  focusId: string | null
  selId: string | null
  settings: ShellSettings
  parallelGroups: ParallelGroup[]
  can: { add: boolean; edit: boolean; delete: boolean }
  actions: TreeActions
  onTrunk: (i: number) => void
  onFocus: (id: string) => void
  onSelect: (id: string | null) => void
  onTreat: () => void
}

const PAGE = 40

export default function TreeTab({ data, trunk, focusId, selId, settings, parallelGroups, can, actions, onTrunk, onFocus, onSelect, onTreat }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState<{ key: string | null; n: number }>({ key: null, n: PAGE })
  const root = data.root
  if (!root) return <div className="card" style={{ padding: 30, textAlign: 'center' }}>אין עדיין צמתים בעץ</div>

  const rootStat = data.stats.get(root.id)
  const dupPerTrunk = new Map<number, number>()
  for (const g of parallelGroups) {
    const t = g.nodes[0] ? data.trunkOf.get(g.nodes[0].id) : undefined
    if (t !== undefined) dupPerTrunk.set(t, (dupPerTrunk.get(t) ?? 0) + 1)
  }

  const t = trunk >= 0 ? data.trunks[trunk] : null
  const focus = focusId ? data.byId.get(focusId) : t?.node
  const kids = focus ? [...(data.childrenOf.get(focus.id) ?? [])].sort((a, b) => (data.stats.get(b.id)?.desc ?? 0) - (data.stats.get(a.id)?.desc ?? 0)) : []
  const sel = selId ? data.byId.get(selId) : null
  const cur = sel ?? focus ?? null
  const limit = shown.key === focus?.id ? shown.n : PAGE
  const crumbs = focus ? pathTo(focus.id, data.byId) : []
  const maxDesc = Math.max(1, ...data.trunks.map(x => x.stat.desc + 1))
  const color = t?.color ?? '#0f4c5c'
  const curStat = cur ? data.stats.get(cur.id) : null
  const isTrunkNode = !!cur && data.trunks.some(x => x.node.id === cur.id)

  return (
    <>
      <div className="card stage" ref={stageRef}>
        <div className="zoom">
          <button className="btn" title="מסך מלא" onClick={() => { const el = stageRef.current; if (!el) return; if (document.fullscreenElement) void document.exitFullscreen(); else void el.requestFullscreen?.() }}>⛶</button>
          <button className="btn" title="הדפסת העץ / PDF" onClick={() => actions.print(cur ?? root)}>PDF</button>
        </div>
        <div className="root">
          <div className="t">שורש השושלת</div>
          <h2>{root.name}</h2>
          <div className="m">{fmt(rootStat?.desc ?? 0)} צאצאים רשומים</div>
        </div>
        <div className="stem" /><div className="brk" />
        <div className="trunks">
          {data.trunks.map((x, i) => {
            const dups = dupPerTrunk.get(i) ?? 0
            return (
              <div key={x.node.id} className={`tk ${trunk === i ? 'on' : ''}`} style={{ ['--c' as string]: x.color }} tabIndex={0} role="button"
                onClick={() => onTrunk(trunk === i ? -1 : i)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTrunk(trunk === i ? -1 : i) } }}>
                <span className="cb" />
                <div className="nm">{x.node.name}</div>
                <div className="ds">{x.node.relation ?? ''}</div>
                <div className="num">{fmt(x.stat.desc)}</div>
                <div style={{ fontSize: 12, color: 'var(--mute)' }}>צאצאים · {fmt(x.children)} ילדים</div>
                <div className="rl"><i style={{ width: `${Math.max(4, (x.stat.desc + 1) / maxDesc * 100)}%` }} /></div>
                <div className="hs">
                  {dups > 0 && <span className="pill d">{fmt(dups)} כפולים</span>}
                  {x.stat.pending > 0 && <span className="pill w">{fmt(x.stat.pending)} ממתינים</span>}
                  {dups === 0 && x.stat.pending === 0 && <span className="pill k">נקי</span>}
                </div>
              </div>
            )
          })}
        </div>

        <div className={`branch ${t ? 'on' : ''}`} style={{ ['--c' as string]: color }}>
          {t && focus && (
            <>
              <div className="card" style={{ boxShadow: 'none' }}>
                <div className="bhead">
                  <div className="crumbs">
                    {crumbs.map((c, i) => (
                      <span key={c.id}>
                        {i > 0 && ' › '}
                        {i === crumbs.length - 1
                          ? <b>{c.name}</b>
                          : i === 0 ? c.name : <a href="#" onClick={e => { e.preventDefault(); onFocus(c.id) }}>{c.name}</a>}
                      </span>
                    ))}
                    {' · '}{fmt(kids.length)} ילדים
                  </div>
                  <button className="btn" style={{ marginInlineStart: 'auto' }} onClick={onTreat}>טפל בגזע הזה</button>
                </div>
                <div className="kids">
                  {kids.slice(0, limit).map(k => {
                    const st = data.stats.get(k.id)
                    const pend = (st?.pending ?? 0) + (k.status === 'pending' ? 1 : 0)
                    return (
                      <button key={k.id} className={`kd ${selId === k.id ? 'on' : ''}`} style={{ ['--c' as string]: color }}
                        onClick={() => onSelect(selId === k.id ? null : k.id)}>
                        <span className="av">{initials(k.name)}</span>
                        <span>
                          <div className="n1">{k.name}</div>
                          <div className="n2">{st && st.desc > 0 ? `${fmt(st.desc)} צאצאים` : 'ללא צאצאים'}</div>
                        </span>
                        {settings.markPending && (
                          <span className="dot" style={{ background: pend > 0 ? '#e0a44a' : '#cfe0cc' }} title={pend > 0 ? 'יש ממתינים' : 'מאומת'} />
                        )}
                      </button>
                    )
                  })}
                  {kids.length > limit && (
                    <div className="kd more" style={{ justifyContent: 'center' }}>
                      <button className="btn" onClick={() => setShown({ key: focus.id, n: limit + PAGE })}>הצג עוד (נותרו {fmt(kids.length - limit)})</button>
                    </div>
                  )}
                  {kids.length === 0 && <div className="more" style={{ color: 'var(--mute)', fontSize: 14, padding: 20 }}>אין ילדים רשומים בענף הזה</div>}
                </div>
              </div>

              {cur && (
                <div className="card det">
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span className="av" style={{ ['--c' as string]: color, width: 44, height: 44 }}>{initials(cur.name)}</span>
                    <div>
                      <h3>{cur.name}</h3>
                      <div style={{ fontSize: 13, color: 'var(--mute)' }}>{cur.relation ? `${cur.relation} · ` : ''}{isTrunkNode ? 'גזע' : `דור ${cur.generation}`}</div>
                    </div>
                  </div>
                  <div className="path">
                    {pathTo(cur.id, data.byId).map(p => p.id === cur.id ? <div key={p.id}><b>{p.name}</b></div> : <div key={p.id}>{p.name}</div>)}
                  </div>
                  <div className="kv">
                    <span>צאצאים</span><b>{fmt(curStat?.desc ?? 0)}</b>
                    <span>מצב</span>
                    <b>{(curStat?.pending ?? 0) > 0 || cur.status === 'pending' ? <span className="pill w">יש ממתינים</span> : <span className="pill k">מאומת</span>}</b>
                    <span>מאומתים</span><b>{fmt((curStat?.verified ?? 0) + (cur.status === 'verified' ? 1 : 0))}</b>
                    <span>ממתינים</span><b>{fmt((curStat?.pending ?? 0) + (cur.status === 'pending' ? 1 : 0))}</b>
                  </div>
                  <div className="acts">
                    {(data.childrenOf.get(cur.id)?.length ?? 0) > 0 && cur.id !== focus.id && (
                      <button className="btn full" onClick={() => onFocus(cur.id)}>פתח את ענפי {cur.name}</button>
                    )}
                    {can.edit && <button className="btn g" onClick={() => actions.approve(cur)}>אשר ייחוס</button>}
                    {can.edit && <button className="btn" onClick={() => actions.keepPending(cur)}>השאר ממתין</button>}
                    {can.add && <button className="btn" onClick={() => actions.add(cur)}>הוסף ילד</button>}
                    {can.edit && <button className="btn" onClick={() => actions.edit(cur)}>ערוך</button>}
                    {can.edit && <button className="btn" onClick={() => actions.share(cur)}>שתף ענף</button>}
                    <button className="btn" onClick={() => actions.print(cur)}>הדפס ענף</button>
                    <button className="btn p full" onClick={onTreat}>פתח בטיפול: כפילויות וממתינים בענף</button>
                    {can.delete && <button className="btn r full" onClick={() => actions.remove(cur)}>מחק / דחה דור</button>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <p className="note">לחיצה על גזע פותחת את ענפיו · לחיצה על ענף מציגה פרטים ונתיב · כל פעולת עריכה פותחת חלון אישור, והעץ עצמו נשאר לתצוגה.</p>
    </>
  )
}
