'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { fmt, pathTo, type ShellData } from '@/lib/lineageShell'
import FanChart from './FanChart'
import SettingsTab from './SettingsTab'
import TopBar from './TopBar'
import TreatTab from './TreatTab'
import TreeTab, { type TreeActions } from './TreeTab'
import type { QueueId, ShellCounts, ShellSettings, ShellTab } from './types'
import './shell.css'

interface Props {
  data: ShellData
  counts: ShellCounts
  settings: ShellSettings
  onSettings: (s: ShellSettings) => void
  can: { add: boolean; edit: boolean; delete: boolean }
  actions: TreeActions
  renderQueue: (q: QueueId, ctx: { onLocate: (id: string) => void; onQueue: (q: QueueId) => void }) => ReactNode
  permissions: ReactNode
  onAddGeneration: () => void
  onPrintAll: () => void
  onLegacy: () => void
}

export default function LineageShell(p: Props) {
  const { data, counts, settings } = p
  const [tab, setTab] = useState<ShellTab>(settings.open)
  const [trunk, setTrunk] = useState(-1)
  const [queue, setQueue] = useState<QueueId>('approve')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const results = useMemo(() => {
    const s = q.trim()
    if (s.length < 2) return []
    const out: { id: string; name: string; path: string }[] = []
    for (const n of data.byId.values()) {
      if (n.name.includes(s)) {
        out.push({ id: n.id, name: n.name, path: pathTo(n.id, data.byId).map(x => x.name).slice(-3).join(' › ') })
        if (out.length >= 8) break
      }
    }
    return out
  }, [q, data])

  const locate = (id: string) => {
    const t = data.trunkOf.get(id)
    if (t !== undefined) setTrunk(t)
    setFocusId(id); setSelId(id); setQ(''); setTab('tree')
  }
  const openQueue = (qq: QueueId, t?: number) => {
    if (t !== undefined) setTrunk(t)
    setQueue(qq); setTab('work')
  }
  const pendingBadge = data.pending + (counts.requests ?? 0)
  const tabs: { v: ShellTab; l: string }[] = [
    { v: 'tree', l: 'העץ' }, { v: 'fan', l: 'מניפת הדורות' }, { v: 'work', l: 'טיפול' }, { v: 'set', l: 'הגדרות' },
  ]

  return (
    <div className="lin" dir="rtl">
      <div className="wrap">
        <header>
          <div className="seal">חס</div>
          <div><h1>עץ הדורות</h1><div className="sub">{fmt(data.total)} צמתים · {data.maxGen} דורות</div></div>
        </header>
        <TopBar data={data} counts={counts} onOpenQueue={openQueue} />
        <div className="bar2">
          <div className="tabs" role="tablist">
            {tabs.map(t => (
              <button key={t.v} role="tab" aria-selected={tab === t.v} className={tab === t.v ? 'on' : ''} onClick={() => setTab(t.v)}>
                {t.l}{t.v === 'work' && pendingBadge > 0 && <span className="n">{fmt(pendingBadge)}</span>}
              </button>
            ))}
          </div>
          <div className="flt">
            <select value={trunk} aria-label="סינון לפי גזע" onChange={e => setTrunk(Number(e.target.value))}>
              <option value={-1}>כל הגזעים</option>
              {data.trunks.map((t, i) => <option key={t.node.id} value={i}>{t.node.name}</option>)}
            </select>
            {trunk >= 0 && <span className="chipf on">{data.trunks[trunk].node.name}<button aria-label="הסר סינון" onClick={() => setTrunk(-1)}>×</button></span>}
            <div style={{ position: 'relative' }}>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש לפי שם" aria-label="חיפוש" />
              {results.length > 0 && (
                <div className="sres">
                  {results.map(r => <button key={r.id} onClick={() => locate(r.id)}>{r.name}<small>{r.path}</small></button>)}
                </div>
              )}
            </div>
          </div>
        </div>

        {tab === 'tree' && (
          <TreeTab data={data} trunk={trunk} focusId={focusId} selId={selId} settings={settings}
            parallelGroups={counts.parallelGroups} can={p.can} actions={p.actions}
            onTrunk={setTrunk} onFocus={setFocusId} onSelect={setSelId} onTreat={() => openQueue('parallel')} />
        )}
        {tab === 'fan' && <FanChart data={data} trunk={trunk} onPickTrunk={i => { setTrunk(i); setTab('tree') }} />}
        {tab === 'work' && (
          <TreatTab data={data} counts={counts} queue={queue} trunk={trunk} onQueue={setQueue} onClearTrunk={() => setTrunk(-1)}>
            {p.renderQueue(queue, { onLocate: locate, onQueue: setQueue })}
          </TreatTab>
        )}
        {tab === 'set' && (
          <SettingsTab settings={settings} onChange={p.onSettings} canEdit={p.can.edit} canAdd={p.can.add}
            permissions={p.permissions} onShare={() => setTab('tree')} onQueue={openQueue}
            onAddGeneration={p.onAddGeneration} onPrint={p.onPrintAll} onLegacy={p.onLegacy} />
        )}
      </div>
    </div>
  )
}
