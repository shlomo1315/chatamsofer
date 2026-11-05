'use client'
import { useCallback, useEffect, useState } from 'react'
import { EXTS, MAP, SOURCE_API, SYSTEM_LABELS, extId, findExt, type MapNode, type MessageSource } from '@/lib/telephony/catalog'
import MessageList, { type Msgs, type SourceData } from './MessageList'
import { AccountPanel, HealthPanel, LogPanel, TestPanel, type Status } from './Panels'
import './technoline.css'

type SysId = 'main' | 'yerid' | 'distributors'
type Tab = 'map' | 'msgs' | 'test' | 'log' | 'account' | 'health'
type DrTab = 'msgs' | 'keys' | 'rec' | 'test'
const TABS: [Tab, string][] = [['map', 'שלוחות'], ['msgs', 'נוסחים והקלטות'], ['test', 'בדיקת שיחה'], ['log', 'יומן שיחות'], ['account', 'מספרים וחשבון'], ['health', 'חיבור ובנייה']]
const DR_TABS: [DrTab, string][] = [['msgs', 'נוסחים'], ['keys', 'מקשים'], ['rec', 'הקלטות'], ['test', 'בדיקה']]
const SOURCES = Object.keys(SOURCE_API) as MessageSource[]

export default function TechnolineClient() {
  const [st, setSt] = useState<Status | null>(null)
  const [err, setErr] = useState('')
  const [src, setSrc] = useState<Partial<Record<MessageSource, SourceData>>>({})
  const [sys, setSys] = useState<SysId>('main')
  const [tab, setTab] = useState<Tab>('map')
  const [open, setOpen] = useState<string | null>(null)
  const [drTab, setDrTab] = useState<DrTab>('msgs')
  const [lib, setLib] = useState<MessageSource>('menu')

  useEffect(() => {
    fetch('/api/admin/technoline').then((r) => r.json()).then(setSt).catch(() => setErr('טעינת מצב המערכות נכשלה'))
    for (const s of SOURCES) {
      fetch(`${SOURCE_API[s]}/messages`).then((r) => r.json()).then((d: SourceData) => d.meta && setSrc((p) => ({ ...p, [s]: d })))
        .catch(() => {})
    }
  }, [])
  const saved = useCallback((s: MessageSource, m: Msgs) => setSrc((p) => (p[s] ? { ...p, [s]: { ...p[s]!, messages: m } } : p)), [])

  if (err) return <p className="tl" style={{ padding: 24 }}>{err}</p>
  if (!st) return <p className="tl" style={{ padding: 24 }}>טוען…</p>

  const cur = st.systems.find((s) => s.id === sys)!
  const msgCount = SOURCES.reduce((n, s) => n + (src[s]?.meta.length ?? 0), 0)
  const fixed = EXTS.filter((e) => !e.source && e.keys.length === 0)
  const sysMissing = st.systems.filter((s) => s.missing.length > 0)
  const drExt = open ? findExt(open) : undefined

  function node(n: MapNode, i: number) {
    const e = n.ext ? findExt(n.ext) : undefined
    const cls = `node${e ? ' ext' : ''}${n.step ? ' step' : ''}${!n.kids && !e ? ' leaf' : ''}${e && open === n.ext ? ' sel' : ''}`
    const body = <>
      {n.k && <span className={`key${n.k.length > 1 ? ' wide' : ''}`}>{n.k}</span>}
      <span><span className="nm">{n.nm}</span>{n.tp && <span className="tp"> · {n.tp}</span>}</span>
      {e && !e.source && <span className="end"><span className="chip warn">קבוע בקוד</span></span>}
    </>
    return (
      <li key={i}>
        {e ? <button className={cls} onClick={() => { setOpen(n.ext!); setDrTab('msgs') }}>{body}</button> : <div className={cls}>{body}</div>}
        {n.kids && <ul>{n.kids.map(node)}</ul>}
      </li>
    )
  }

  const libExts = EXTS.filter((e) => e.source === lib)

  return (
    <div className={`tl${open ? ' dr' : ''}`}>
      <div className="wrap">
        <div className="head">
          <div><h1>מרכזיה טלפונית</h1><p>מפת השיחה, נוסחים והקלטות, ומצב החיבור לטכנוליין</p></div>
        </div>
        <div className="stats">
          <div className="stat"><div className="v num">{st.systems.length}</div><div className="l">מערכות</div></div>
          <div className="stat"><div className="v num">{EXTS.length}</div><div className="l">שלוחות</div></div>
          <div className="stat"><div className="v num">{msgCount || '…'}</div><div className="l">נוסחים לעריכה</div></div>
          <div className={`stat${fixed.length + sysMissing.length ? ' alert2' : ''}`}><div className="v num">{fixed.length + sysMissing.length}</div><div className="l">דורשים תשומת לב</div></div>
        </div>

        <div className="syspick" role="group" aria-label="מערכת">
          {st.systems.map((s) => (
            <button key={s.id} aria-pressed={sys === s.id} onClick={() => setSys(s.id)}>
              <span className="t"><span className={`dot ${s.missing.length ? 'bad' : 'ok'}`} /> {s.label}</span>
              <span className="m">{s.missing.length ? `חסר: ${s.missing.length} הגדרות` : 'מחוברת'}</span>
            </button>
          ))}
        </div>

        <details className="finds" open>
          <summary>דורש תשומת לב <span>הצג/הסתר</span></summary>
          <ol>
            {sysMissing.map((s) => <li key={s.id}><b>{s.label}:</b> חסר בשרת <span className="ltr">{s.missing.join(', ')}</span>, ולכן השיחות לא יעבדו.</li>)}
            <li><b>נוסחים כתובים בקוד:</b> {fixed.map((e) => e.name).join(', ')}. עדיין לא ניתנים לעריכה מהמסך.</li>
            <li><b>הקלטות:</b> ההעלאה והקול הנוירוני עוברים דרך ימות המשיח שבוטלה, ולכן עשויים לא לפעול.</li>
            <li><b>סטטוס בנייה:</b> אין דרך לדעת מכאן אם שלוחה נבנתה בטכנוליין. לא נבדק.</li>
          </ol>
        </details>

        <div className="tabs" role="tablist">
          {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
        </div>

        {tab === 'map' && (
          <div className="map">
            <div className="tree">
              <div className="tree-h"><h2>{SYSTEM_LABELS[sys]}</h2><span>מה המתקשר עובר, מקש אחרי מקש</span></div>
              <ul>{node(MAP[sys].root, 0)}</ul>
              {MAP[sys].direct.length > 0 && (
                <div className="direct"><h3>שלוחות ישירות, בלי תפריט</h3>
                  <div className="row">
                    {MAP[sys].direct.map((id) => {
                      const e = findExt(id)!
                      return <button key={id} className={`node ext${open === id ? ' sel' : ''}`} onClick={() => { setOpen(id); setDrTab('msgs') }}>
                        <span><span className="nm">{e.name}</span> <span className="tp">· {e.how}</span></span>
                        {!e.source && <span className="end"><span className="chip warn">קבוע בקוד</span></span>}
                      </button>
                    })}
                  </div>
                </div>
              )}
            </div>
            <aside className="legend">
              <h3>איך קוראים את המפה</h3>
              <dl>
                <dt className="sw n" /><dd>שלוחה: לחיצה פותחת נוסחים והקלטות</dd>
                <dt className="sw d" /><dd>שלב בתוך השלוחה</dd>
                <dt><span className="key">1</span></dt><dd>המקש שהמתקשר לוחץ</dd>
              </dl>
              <p>מספר הטלפון של {cur.label}: {cur.hasNumber ? 'מוגדר' : 'לא מוגדר'}.</p>
            </aside>
          </div>
        )}

        {tab === 'msgs' && (
          <div className="lib">
            <nav>
              <div className="gh">שלוחות עם נוסחים</div>
              {SOURCES.map((s) => {
                const e = EXTS.find((x) => x.source === s)!
                return <button key={s} aria-pressed={lib === s} onClick={() => setLib(s)}><span>{SYSTEM_LABELS[e.sys]} · {e.name}</span><span className="num">{src[s]?.meta.length ?? '…'}</span></button>
              })}
              <div className="gh">כתובים בקוד</div>
              {fixed.map((e) => <button key={extId(e)} disabled><span>{e.name}</span><span className="chip warn">קבוע</span></button>)}
            </nav>
            <div>
              {src[lib] ? <MessageList key={lib} source={lib} data={src[lib]!} onSaved={(m) => saved(lib, m)} /> : <p>טוען…</p>}
              {libExts.length > 0 && <p className="hint">שייך לשלוחה: {libExts.map((e) => e.name).join(', ')}</p>}
            </div>
          </div>
        )}

        {tab === 'test' && <TestPanel sources={src} />}
        {tab === 'log' && <LogPanel />}
        {tab === 'account' && <AccountPanel st={st} />}
        {tab === 'health' && <HealthPanel st={st} />}
      </div>

      <div className="scrim" onClick={() => setOpen(null)} />
      <aside className="drawer" aria-hidden={!open} role="dialog" aria-label="פרטי שלוחה">
        {drExt && (
          <>
            <div className="dr-h">
              <button className="x" onClick={() => setOpen(null)} aria-label="סגירה">×</button>
              <div className="eyebrow">{SYSTEM_LABELS[drExt.sys]}</div>
              <h2>{drExt.name}</h2>
              <div className="meta"><span className="chip mute">{drExt.how}</span>{!drExt.source && <span className="chip warn">נוסח קבוע בקוד</span>}</div>
              <p style={{ margin: '0 0 8px', fontSize: 13 }}>{drExt.what}</p>
              <div className="dr-tabs" role="tablist">
                {DR_TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={drTab === k} onClick={() => setDrTab(k)}>{l}</button>)}
              </div>
            </div>
            <div className="dr-b">
              {(drTab === 'msgs' || drTab === 'rec') && (drExt.source
                ? (src[drExt.source] ? <MessageList key={drExt.source} source={drExt.source} data={src[drExt.source]!} onSaved={(m) => saved(drExt.source!, m)} /> : <p>טוען…</p>)
                : <p className="fixed">הנוסחים של השלוחה הזו כתובים בקוד ועדיין לא ניתנים לעריכה מהמסך. שינוי דורש שינוי בקוד.</p>)}
              {drTab === 'keys' && (drExt.keys.length
                ? <table className="keys"><thead><tr><th style={{ width: 64 }}>מקש</th><th>מה קורה</th></tr></thead>
                  <tbody>{drExt.keys.map(([k, t]) => <tr key={k}><td><span className={`key${k.length > 1 ? ' wide' : ''}`}>{k}</span></td><td>{t}</td></tr>)}</tbody></table>
                : <p className="hint">לשלוחה אין תפריט מקשים.</p>)}
              {drTab === 'test' && <TestPanel sources={src} startId={drExt.source ? extId(drExt) : undefined} />}
            </div>
            <div className="dr-f"><small>שינויים נשמרים בכפתור «שמור שינויים» בנוסחים</small></div>
          </>
        )}
      </aside>
    </div>
  )
}
