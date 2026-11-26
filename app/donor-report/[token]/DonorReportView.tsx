'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { digitsQuery, type DonorRow } from '@/lib/donorReport'
import {
  EMPTY_FILTER, ascending, checkSums, dimValue, dimValues, filterView, groupBy, isFiltered, matches, monthKey, totals,
  type DimKey, type Group, type ViewFilter,
} from '@/lib/donorReportCalc'
import PeriodPanel from './PeriodPanel'
import './donor-report.css'

// העיצוב זהה למוקאפ המאושר (uploads/…mockup-donor-report.html). כל מה שמוצג נגזר מאותה רשימה
// (lib/donorReportCalc), ולכן הסכומים, הנקודות, הגרף והפילוחים מסתכמים זה בזה בכל סינון.
interface Report { label: string; lockedHome: string | null; idMatches: string[]; rows: DonorRow[] }

const nis = (n: number) => `₪${Math.round(n).toLocaleString('en-US')}`
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const KIND_LABEL = ['', 'תאומים', 'שלישייה']
const HOME_COLORS = ['#E7BE62', '#6E8BE0', '#4FB58A', '#D9806F', '#A98BD6', '#5BB7C7']
const DIM_LABELS: Record<DimKey, string> = { city: 'עיר', comm: 'קהילה', home: 'בית החלמה', month: 'חודש', birth: 'לידה', state: 'מצב' }
const CHIP_DIMS: DimKey[] = ['city', 'comm', 'home', 'month', 'birth', 'state']
const CHIP_LIMIT = 12
const BREAKDOWN_LIMIT = 10
const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
const REFRESH_MS = 60_000

/** ספירה מונפשת (500ms); בלי אנימציה למי שביקש תנועה מופחתת. */
function useTween(to: number): number {
  const [v, setV] = useState(to)
  const shown = useRef(to)
  useEffect(() => {
    const from = shown.current
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion:reduce)').matches
    const t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const p = reduced || from === to ? 1 : Math.min(1, (t - t0) / 500)
      const next = from + (to - from) * (1 - Math.pow(1 - p, 3))
      shown.current = next
      setV(next)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to])
  return v
}

const Num = ({ to }: { to: number }) => <>{fmt(useTween(to))}</>

function rangeText(rows: DonorRow[]): string {
  const dates = rows.map(r => r.date).filter(Boolean).sort()
  if (!dates.length) return ''
  const part = (d: string) => ({ m: MONTH_NAMES[Number(d.slice(5, 7)) - 1] ?? '', y: d.slice(0, 4) })
  const a = part(dates[0]), b = part(dates[dates.length - 1])
  return a.y === b.y ? `${a.m} עד ${b.m} ${b.y}` : `${a.m} ${a.y} עד ${b.m} ${b.y}`
}

export function Gate({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="login"><div className="tile">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo logo-lg" src="/logo.png" alt="איגוד הצאצאים של רבינו החתם סופר" width={512} height={428} />
      <h2>{title}</h2><p>{text}</p>
      {children}
    </div></div>
  )
}

export function PasswordScreen({ token, onAuth }: { token: string; onAuth: () => void }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/donor-report/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, password }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'סיסמה שגויה') }
      else onAuth()
    } catch { setError('שגיאת תקשורת, נסו שוב') }
    finally { setLoading(false) }
  }

  return (
    <Gate title="דוח יולדות" text="היכל החתם סופר. הכניסו את הסיסמה שקיבלתם.">
      <form onSubmit={submit}>
        <input type="password" placeholder="סיסמה" aria-label="סיסמה" value={password} autoFocus autoComplete="current-password"
          onChange={e => setPassword(e.target.value)} />
        {error && <p role="alert" style={{ color: 'var(--gold)', marginBottom: 'var(--s-3)' }}>{error}</p>}
        <button type="submit" className="go" disabled={loading || !password}>{loading ? 'נכנס…' : 'כניסה לדוח'}</button>
      </form>
    </Gate>
  )
}

function RowView({ r }: { r: DonorRow }) {
  const paid = r.amount > 0
  const multi = r.kind > 1
  const actual = paid && r.nights != null
  const nightsN = actual ? r.nights : r.eligibleNights
  const date = r.date ? r.date.split('-').reverse().join('.') : 'לא צוין'
  const dots = (n: number) => <span className="dots">{Array.from({ length: n }, (_, i) => <i key={i} />)}</span>
  return (
    <div className={`row${multi ? ' multi' : ''}`}>
      <div>
        <div className="who">{r.name}{multi && <span className="tag">{KIND_LABEL[r.kind - 1]}</span>}</div>
        <div className="meta num">{r.home} · {r.city} · {r.community} · ת״ז <span className="ltr">{'••••' + r.idLast4}</span> · {date}</div>
        {multi ? (
          <div className="fest">{dots(r.kind === 2 ? 2 : 3)}<span>
            <b>{KIND_LABEL[r.kind - 1]} · <span className="num">{nightsN}</span> לילות</b>{actual ? ' בבית ההחלמה' : ' זכאית'}
          </span></div>
        ) : actual
          ? <div className="nt"><b className="num">{nightsN}</b> לילות בפועל בבית ההחלמה</div>
          : <div className="nt">זכאית ל-<b className="num">{nightsN}</b> לילות</div>}
        {r.note && <div className="msg">{r.note}</div>}
      </div>
      {paid ? <span className="amt num">{nis(r.amount)}</span> : <span className="pill">עוד לא מומש</span>}
    </div>
  )
}

export default function DonorReportView({ token }: { token: string }) {
  const [data, setData] = useState<Report | null>(null)
  const [state, setState] = useState<'loading' | 'password' | 'inactive' | 'error' | 'ok'>('loading')
  const [error, setError] = useState('')
  const [theme, setThemeState] = useState<'dark' | 'light'>('light')
  // ברירת מחדל בהיר; בחירה שנשמרה נטענת לפני הציור הראשון כדי שלא יהיה הבהוב.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useLayoutEffect(() => { try { if (localStorage.getItem('dr-theme') === 'dark') setThemeState('dark') } catch {} }, [])
  const setTheme = (t: 'dark' | 'light') => { setThemeState(t); try { localStorage.setItem('dr-theme', t) } catch {} }
  const [F, setF] = useState<ViewFilter>(EMPTY_FILTER)
  const [shown, setShown] = useState(10)
  const [expanded, setExpanded] = useState<DimKey[]>([])
  const [idMatches, setIdMatches] = useState<ReadonlySet<string>>(new Set())
  const [pos, setPos] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [advOpen, setAdvOpen] = useState(false)

  useEffect(() => {
    if (!advOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAdvOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [advOpen])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const posRef = useRef(0)
  const tip = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/donor-report?${new URLSearchParams({ t: token })}`, { cache: 'no-store' })
      const json = await res.json()
      if (res.ok) { setData(json); setState('ok') }
      else if (json.needsPassword) { setData(null); setState('password') }
      else if (json.inactive) { setData(null); setState('inactive') }
      else { setData(null); setError(json.error || 'שגיאה בטעינה'); setState('error') }
    } catch { setError('שגיאת רשת, נסו שוב'); setState('error') }
  }, [token])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  // עדכון חי: טעינה מחדש בכל דקה, בלי מטמון.
  useEffect(() => {
    if (state !== 'ok') return
    const i = setInterval(() => { if (document.visibilityState === 'visible') void load() }, REFRESH_MS)
    return () => clearInterval(i)
  }, [state, load])

  // חיפוש לפי ת.ז.: ההתאמה נעשית בשרת בלבד (ארבע ספרות לפחות), והמספר המלא לא יוצא לדפדפן.
  const digits = digitsQuery(F.q)
  useEffect(() => {
    if (state !== 'ok') return
    const t = setTimeout(async () => {
      if (!digits) { setIdMatches(new Set()); return }
      try {
        const res = await fetch(`/api/donor-report?${new URLSearchParams({ t: token, q: digits })}`, { cache: 'no-store' })
        if (res.ok) setIdMatches(new Set((await res.json()).idMatches as string[]))
      } catch { /* החיפוש לפי שם ממשיך לעבוד */ }
    }, 300)
    return () => clearTimeout(t)
  }, [digits, token, state])

  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  const all = useMemo(() => data?.rows ?? [], [data])
  const R = useMemo(() => filterView(all, F, idMatches), [all, F, idMatches])
  const inR = useMemo(() => new Set(R.map(r => r.id)), [R])
  const asc = useMemo(() => ascending(all), [all])
  const T = useMemo(() => totals(R), [R])
  const ok = useMemo(() => checkSums(all, R), [all, R])

  const homes = useMemo(() => dimValues(all, 'home'), [all])
  const homeGroups = useMemo(() => groupBy(R, 'home', homes), [R, homes])
  const months = useMemo(() => dimValues(all, 'month'), [all])
  const monthGroups = useMemo(() => groupBy(R, 'month', months), [R, months])

  const p = Math.min(pos ?? asc.length, asc.length)
  let gcount = 0
  for (let i = 0; i < p; i++) if (inR.has(asc[i].id)) gcount++

  const tGame = useTween(gcount), tTotal = useTween(T.amount), tDonut = useTween(R.length)
  const tNow = playing && p > 0 ? p - 1 : -1

  const stop = () => { if (timer.current) clearInterval(timer.current); timer.current = null; setPlaying(false) }
  const play = () => {
    if (timer.current) { stop(); return }
    const len = asc.length
    posRef.current = p >= len ? 0 : p
    setPlaying(true)
    const step = Math.ceil(len / 110)
    timer.current = setInterval(() => {
      posRef.current = Math.min(len, posRef.current + step)
      setPos(posRef.current)
      if (posRef.current >= len) stop()
    }, 60)
    setPos(posRef.current)
  }

  const showTip = (e: React.SyntheticEvent) => {
    const el = tip.current
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-i]')
    if (!el) return
    if (!t) { el.style.opacity = '0'; return }
    const d = asc[Number(t.dataset.i)]
    el.textContent = (inR.has(d.id) ? '' : 'מחוץ לסינון · ') + d.city + ' · ' + monthKey(d.date) + (d.kind > 1 ? ` · ${KIND_LABEL[d.kind - 1]} · ${d.nights ?? d.eligibleNights} לילות` : '')
    const r = t.getBoundingClientRect()
    el.style.opacity = '1'
    const w = el.offsetWidth
    el.style.top = Math.max(8, r.top - 38) + 'px'
    el.style.left = Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)) + 'px'
  }

  const toggle = (k: DimKey, v: string) => { setF(f => ({ ...f, [k]: f[k] === v ? '' : v })); setShown(10) }
  const clear = () => { setF(EMPTY_FILTER); setShown(10) }
  const logout = async () => {
    try { await fetch('/api/donor-report/auth', { method: 'DELETE' }) } catch { /* גם אם נכשל, מחזירים למסך הסיסמה */ }
    setData(null); setAdvOpen(false); setF(EMPTY_FILTER); setState('password')
  }

  const shell = (children: React.ReactNode) => (
    <div className="dr-root" data-theme={theme} dir="rtl" style={{ minHeight: '100vh' }}>
      <div className="bar">
        <div><b>דוח יולדות</b></div>
        <span className="barr">
        <span className="seg">
          <button aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>כהה</button>
          <button aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>בהיר</button>
        </span>
        {state === 'ok' && <a className="lo" href={`/donor-report/${encodeURIComponent(token)}/charges`}>דוח חיובים והתאמת אשראי</a>}
        {state === 'ok' && <button className="lo" onClick={() => void logout()}>התנתקות</button>}
        </span>
      </div>
      <main className="wrap"><div className="glow" />{children}</main>
    </div>
  )

  if (state === 'password') return shell(<PasswordScreen token={token} onAuth={() => { setState('loading'); void load() }} />)
  if (state === 'inactive') return shell(<Gate title="הקישור טרם הופעל" text="פנו למשרד לקבלת סיסמה." />)
  if (state === 'error') return shell(<Gate title={error} text="אם הגעתם לכאן בטעות, פנו למשרד לקבלת קישור חדש." />)
  if (!data) return shell(<Gate title="טוען…" text="" />)

  // ───────── פילוחים ─────────
  const breakdown = (k: DimKey, colors?: string[]) => {
    const values = dimValues(all, k)
    const gs = groupBy(R, k, values)
    const keep = new Set(gs.slice(0, BREAKDOWN_LIMIT).map(g => g.value))
    if (F[k]) keep.add(F[k])
    const shownG = gs.filter(g => keep.has(g.value))
    const rest = gs.filter(g => !keep.has(g.value))
    const restG: Group | null = rest.length
      ? { value: `אחרות (${rest.length})`, count: rest.reduce((a, g) => a + g.count, 0), amount: rest.reduce((a, g) => a + g.amount, 0) }
      : null
    const mx = Math.max(1, ...gs.map(g => g.amount))
    const pct = (c: number) => (R.length ? Math.round(c / R.length * 100) : 0)
    return (
      <>
        {shownG.map(g => (
          <button key={g.value} className={`dr${F[k] === g.value ? ' sel' : ''}${g.count ? '' : ' zero'}`} onClick={() => toggle(k, g.value)}>
            <span className="n">{colors && <i style={{ background: colors[values.indexOf(g.value) % colors.length] }} />}{g.value}</span>
            <span className="a num">{nis(g.amount)}</span>
            <span className="s num">{fmt(g.count)} יולדות · {pct(g.count)}%</span>
            <span className="t"><b style={{ width: `${g.amount / mx * 100}%` }} /></span>
          </button>
        ))}
        {restG && (
          <div className={`dr${restG.count ? '' : ' zero'}`} style={{ cursor: 'default' }}>
            <span className="n">{restG.value}</span>
            <span className="a num">{nis(restG.amount)}</span>
            <span className="s num">{fmt(restG.count)} יולדות · {pct(restG.count)}%</span>
            <span className="t"><b style={{ width: `${Math.min(100, restG.amount / mx * 100)}%` }} /></span>
          </div>
        )}
      </>
    )
  }

  // ───────── דונאט ─────────
  const tot = R.length || 1
  const circles = homeGroups.map((h, i) => {
    const l = h.count / tot * 301.6
    const off = homeGroups.slice(0, i).reduce((a, g) => a + g.count / tot * 301.6, 0)
    const c = (
      <circle key={h.value} cx="60" cy="60" r="48" style={{ stroke: HOME_COLORS[i % HOME_COLORS.length] }}
        strokeDasharray={`${Math.max(0, l - 2)} 301.6`} strokeDashoffset={-off} strokeLinecap="butt" />
    )
    return c
  })

  const mx = Math.max(1, ...monthGroups.map(g => g.amount))
  const pk = Math.max(0, ...monthGroups.map(g => g.amount))
  const filtered = isFiltered(F)
  const dateOn = !!(F.from || F.to)
  const dimCount = CHIP_DIMS.filter(k => F[k]).length + (dateOn ? 1 : 0)
  const heDate = (d: string) => d.split('-').reverse().join('.')
  const dateTag = dateOn ? `${F.from ? 'מ-' + heDate(F.from) : ''}${F.from && F.to ? ' ' : ''}${F.to ? 'עד ' + heDate(F.to) : ''}` : ''
  const left = R.length - shown
  const avg = T.paid ? (T.nights / T.paid).toFixed(1) : ''
  const range = rangeText(all)

  const chipValues = (k: DimKey) => {
    const vals = dimValues(all, k)
    if (vals.length <= CHIP_LIMIT || expanded.includes(k)) return { vals, hidden: 0 }
    const head = vals.slice(0, CHIP_LIMIT)
    if (F[k] && !head.includes(F[k])) head.push(F[k])
    return { vals: head, hidden: vals.length - head.length }
  }

  return shell(
    <>
      <div id="tip" ref={tip} />
      <div className="report">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <div className="top"><img className="logo" src="/logo.png" alt="איגוד הצאצאים של רבינו החתם סופר" width={512} height={428} /><div><h1>דוח יולדות</h1><p>היכל החתם סופר</p></div><span className="live"><i />מתעדכן חי</span></div>
        <div className="grid">
          <PeriodPanel all={all} rows={R} F={F} homes={homes} homeGroups={homeGroups} T={T}
            setRange={(from, to) => { setF(f => ({ ...f, from, to })); setShown(10) }}
            setHome={home => { setF(f => ({ ...f, home })); setShown(10) }} />
          <section className="tile game" aria-label="יולדות שהצטברו עד היום">
            <div className="gtop">
              <div>
                <p className="lbl">יולדות שהצטברו עד היום</p>
                <p className="gnum num ltr">{fmt(tGame)}</p>
                <p className="gmon">{p
                  ? <>עד <b className="num">{monthKey(asc[Math.max(0, p - 1)].date)}</b> · <span className="num">{fmt(gcount)}</span> מתוך <span className="num">{fmt(inR.size)}</span> יולדות בסינון</>
                  : 'לחצו על ניגון מחדש'}</p>
              </div>
              <div className="gctl">
                <button className="play" onClick={play}>{playing ? '❚❚ עצירה' : '▶ ניגון מחדש'}</button>
                <input type="range" min={0} max={asc.length} value={p} aria-label="גללו כדי לראות את ההצטברות לאורך הזמן"
                  onChange={e => { stop(); setPos(Number(e.target.value)) }} />
              </div>
            </div>
            <div className="field" role="img" aria-label="כל נקודה היא יולדת אחת" onMouseOver={showTip} onClick={showTip}
              onMouseLeave={() => { if (tip.current) tip.current.style.opacity = '0' }}>
              {asc.map((d, i) => (
                <span key={d.id} data-i={i}
                  className={`d${d.kind === 2 ? ' tw' : d.kind === 3 ? ' tr' : ''}${inR.has(d.id) && i < p ? ' on' : ''}${inR.has(d.id) ? '' : ' out'}${i === tNow ? ' now' : ''}`} />
              ))}
            </div>
            <div className="gleg"><span><i />יולדת</span><span><i className="t" />תאומים</span><span>★ שלישייה</span><span><i className="o" />מחוץ לסינון</span><span>לחיצה או מעבר על נקודה מראים עיר וחודש</span></div>
          </section>

          <section className="tile f" aria-label="חיפוש וסינון">
            <div className="fbar">
              <div className="q"><input type="search" placeholder="חיפוש לפי שם או מספר זהות" aria-label="חיפוש לפי שם או מספר זהות" autoComplete="off"
                value={F.q} onChange={e => { setF(f => ({ ...f, q: e.target.value })); setShown(10) }} /></div>
              <button className="adv" onClick={() => setAdvOpen(true)} aria-haspopup="dialog">חיפוש מתקדם{dimCount > 0 && <span className="cnt num">{dimCount}</span>}</button>
              {filtered && <button className="clr" onClick={clear}>ניקוי</button>}
            </div>
            <div className="fsum">
              <span>{filtered ? <>מוצגות <b className="num">{fmt(R.length)}</b> מתוך <span className="num">{fmt(all.length)}</span></> : 'מוצגות כל היולדות'}</span>
              {CHIP_DIMS.filter(k => F[k]).map(k => (
                <button key={k} className="tg" onClick={() => toggle(k, F[k])} aria-label={`הסרת הסינון ${DIM_LABELS[k]}: ${F[k]}`}>{DIM_LABELS[k]}: {F[k]} <span aria-hidden>×</span></button>
              ))}
              {dateOn && <button className="tg" onClick={() => { setF(f => ({ ...f, from: '', to: '' })); setShown(10) }} aria-label={`הסרת סינון התאריכים: ${dateTag}`}>תאריך: {dateTag} <span aria-hidden>×</span></button>}
              <span className="chk">{ok ? '✓ הסכומים מסתכמים' : '⚠ אי התאמה בסכומים'}</span>
            </div>
          </section>

          {advOpen && (
            <div className="modal" onClick={() => setAdvOpen(false)}>
              <div className="dlg" role="dialog" aria-modal="true" aria-label="חיפוש מתקדם" onClick={e => e.stopPropagation()}>
                <div className="dh"><h2>חיפוש מתקדם</h2><button className="x" onClick={() => setAdvOpen(false)} aria-label="סגירה">×</button></div>
                <div className="db">
                  <div className="chips dts">
                    <span className="cl">תאריך</span>
                    <label className="dt">מתאריך<input type="date" value={F.from} max={F.to || undefined} onChange={e => { setF(f => ({ ...f, from: e.target.value })); setShown(10) }} /></label>
                    <label className="dt">עד תאריך<input type="date" value={F.to} min={F.from || undefined} onChange={e => { setF(f => ({ ...f, to: e.target.value })); setShown(10) }} /></label>
                  </div>
                  {CHIP_DIMS.map(k => {
                    const { vals, hidden } = chipValues(k)
                    return (
                      <div className="chips" key={k}>
                        <span className="cl">{DIM_LABELS[k]}</span>
                        <button className={`chip${F[k] ? '' : ' on'}`} onClick={() => toggle(k, F[k])}>הכול</button>
                        {vals.map(v => (
                          <button key={v} className={`chip${F[k] === v ? ' on' : ''}`} onClick={() => toggle(k, v)}>
                            {v}<small className="num">{all.filter(r => matches(r, F, idMatches, k) && dimValue(r, k) === v).length}</small>
                          </button>
                        ))}
                        {hidden > 0 && <button className="chip" onClick={() => setExpanded(e => [...e, k])}>עוד<small className="num">{hidden}</small></button>}
                      </div>
                    )
                  })}
                </div>
                <div className="df">
                  {filtered && <button className="clr" onClick={clear}>ניקוי הכול</button>}
                  <button className="go" onClick={() => setAdvOpen(false)}>החל · <span className="num">{fmt(R.length)}</span> יולדות</button>
                </div>
              </div>
            </div>
          )}

          <section className="tile hero">
            <div>
              <p className="lbl">הועברו לבתי ההחלמה</p>
              <p className="big num ltr"><span className="cur">₪</span><span>{fmt(tTotal)}</span></p>
              <p className="sub">עבור <b className="num">{fmt(R.length)}</b> יולדות{filtered ? ' בסינון הנוכחי' : range ? ` · ${range}` : ''}</p>
            </div>
            <div className="donut">
              <div className="dwrap">
                <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="48" style={{ stroke: 'var(--trk)' }} />{circles}</svg>
                <div className="dc"><b className="num">{fmt(tDonut)}</b><span>יולדות</span></div>
              </div>
              <div className="leg">{homeGroups.map((h, i) => <div key={h.value}><i style={{ background: HOME_COLORS[i % HOME_COLORS.length] }} />{h.value}<em className="num">{fmt(h.count)}</em></div>)}</div>
            </div>
          </section>
          <section className="tile k1"><h3>יולדות</h3><p className="kv num"><Num to={T.count} /></p><p className="kn">{T.paid} עם סכום</p></section>
          <section className="tile k2"><h3>לילות בפועל</h3><p className="kv g num"><Num to={T.nights} /></p><p className="kn">{T.paid ? `ממוצע ${avg} לילות ליולדת` : 'אין נתונים'}</p></section>
          <section className="tile k3"><h3>תאומים ושלישיות</h3><p className="kv num"><Num to={T.twins + T.triplets} /></p><p className="kn">{T.twins} תאומים · {T.triplets} שלישיות</p></section>
          <section className="tile k4"><h3>ממתינות לקבלה</h3><p className="kv num"><Num to={T.pending} /></p><p className="kn">הסכום יתעדכן כשתתקבל הקבלה</p></section>

          <section className="tile mo"><h3>סכום לפי חודש <span>לחיצה על עמודה מסננת</span></h3>
            <div className="mbars">
              {monthGroups.map(x => (
                <button key={x.value} className={`mb${x.amount === pk && pk > 0 ? ' on' : ''}${F.month === x.value ? ' sel' : ''}${F.month && F.month !== x.value ? ' dim' : ''}`}
                  onClick={() => toggle('month', x.value)} aria-label={`${x.value}: ${x.count} יולדות, ${nis(x.amount)}`}>
                  <span className="v num">{x.amount ? (x.amount >= 1000 ? Math.round(x.amount / 1000) + 'K' : x.amount) : '—'}</span>
                  <span className="c" style={{ height: `${x.amount / mx * 140}px` }} />
                  <span className="m num">{x.value}</span><span className="v num">{x.count}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="tile ho"><h3>לפי בית החלמה <span>לחיצה מסננת</span></h3><div className="dd">{breakdown('home', HOME_COLORS)}</div></section>
          <section className="tile ci"><h3>לפי עיר <span>לחיצה מסננת</span></h3><div className="dd">{breakdown('city')}</div></section>
          <section className="tile co"><h3>לפי קהילה <span>לחיצה מסננת</span></h3><div className="dd">{breakdown('comm')}</div></section>
          <section className="tile ni"><h3>לילות ולידות מרובות</h3>
            <div className="dd">
              {([['לידה רגילה', 1, '2–3 לילות'], ['תאומים', 2, '4 לילות'], ['שלישייה', 3, '6 לילות']] as const).map(([t, kind, d]) => {
                const g = R.filter(r => r.kind === kind)
                return (
                  <div className="dr" style={{ cursor: 'default' }} key={t}>
                    <span className="n">{t}</span><span className="a num">{fmt(g.length)}</span>
                    <span className="s num">{fmt(g.reduce((a, r) => a + (r.amount > 0 ? (r.nights ?? 0) : 0), 0))} לילות בפועל · {d}</span>
                  </div>
                )
              })}
            </div>
          </section>
          <section className="tile li"><h3>פירוט יולדות <span>{fmt(R.length)} יולדות</span></h3>
            <div>
              {R.length
                ? R.slice(0, shown).map(r => <RowView key={r.id} r={r} />)
                : <p className="empty">לא נמצאו יולדות. נסו לשנות את החיפוש או הסינון.</p>}
            </div>
            <button className="more" style={{ display: left > 0 ? 'block' : 'none' }} onClick={() => setShown(s => s + 10)}>
              הצג עוד ({Math.min(10, left)} מתוך {fmt(left)})
            </button>
            <p className="note">מספר הלילות הוא מספר הלילות בפועל בבית ההחלמה. ליולדת שעוד לא הגיעה מוצג מספר הלילות שהיא זכאית להם. יולדת בלי סכום מוצגת עם הסבר ולא עם ₪0.</p>
          </section>
        </div>
      </div>
    </>,
  )
}
