'use client'
// דף חלוקות החגים בקישור השיתוף, בעיצוב "חדר בקרה" (כיוון ב׳ מהמוקאפ המאושר).
// סינון רק בלחיצה על עמודה, שורה או פס, וחלונית "נרשמה עכשיו" לכל נרשם חדש ברענון.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import c from './control.module.css'
import { channelKeyOf, cityOf, familyAmount } from '@/lib/sharedBoard'
import {
  CR_EMPTY, CR_KEYS, CR_NAMES, channelLabel, subRows, toggleF, stLevel, kpis, communityMoney, topCommunities, regTable, REG_STATUS, COMM_TOP, channelCounts,
  cityTop, hourCountsCr, rateBuckets, ratePerMinute, sparkPoints, pickup, takeFresh, isStale, famLabel, latest,
  num, shekel, pad2, regOrder, type CrRow, type CrFilter, type CrKey,
} from '@/lib/controlRoom'
import { REG_PAGE_SIZE, clampPage, regPages, fetchRegDetails, withDetails, type RegDetails } from '@/lib/sharedBoardFetch'

export type CrDist = { id: string; name: string; live?: boolean; amount_per_family?: number | null }

type Props = {
  live: CrDist | null
  prevDists: CrDist[]
  selected: CrDist | null
  rows: CrRow[]
  closesAt: string | null
  updatedAt: Date | null
  /** נרשמים שכבר נטענו כשעוד נטענים ברקע (null = הכול נטען). */
  loadingMore?: number | null
  loadError?: string | null
  onRetry?: () => void
  onPickLive: () => void
  onPickPrev: (id: string) => void
  onLogout: () => void
  /** כשהגדרת "חגים בלבד" כבויה: קישורים לשאר המחלקות בתפריט. */
  otherPages?: boolean
}

const TOAST_MS = 5000
const UNITS: [string, number][] = [['ימים', 86_400_000], ['שעות', 3_600_000], ['דקות', 60_000], ['שניות', 1000]]
const CH_CLASS = [c.c0, c.c1, c.c2, c.c3, c.c4]
const hhmm = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false }) : '')
const cls = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

export default function ControlRoom({ live, prevDists, selected, rows, closesAt, updatedAt, loadingMore = null, loadError = null, onRetry, onPickLive, onPickPrev, onLogout, otherPages }: Props) {
  const isLive = !!selected && selected.id === live?.id
  const per = selected?.amount_per_family

  // סינון: נשמר ברענון, ומתאפס במעבר חלוקה
  const [fState, setFState] = useState<{ id?: string; f: CrFilter }>({ f: CR_EMPTY })
  const f = fState.id === selected?.id ? fState.f : CR_EMPTY
  const setF = (nf: CrFilter) => setFState({ id: selected?.id, f: nf })
  const pick = (k: CrKey, v: string | number) => setF(toggleF(f, k, v))

  // שעון: מתקתק כל שנייה (שעון עצר ושעה נוכחית)
  const [tick, setTick] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(t) }, [])

  const stale = isStale(updatedAt, tick)

  // חלונית "נרשמה עכשיו": רק בחלוקה החיה, לא בטעינה הראשונה, עד 3 בתור, 5 שניות לכל אחת.
  // seen מצטבר לכל החלוקה, כך שנרשם שכבר הוצג לא יוצג שוב.
  const [alertOn, setAlertOn] = useState(true)
  const [queue, setQueue] = useState<CrRow[]>([])
  const seen = useRef<{ id?: string; ids: Set<string> }>({ ids: new Set() })
  // ⚠️ נרשמים שמגיעים בטעינה ברקע (וגם בחלק האחרון שלה) הם לא "נרשמו עכשיו"
  const wasLoading = useRef(false)
  useEffect(() => {
    const seeding = loadingMore != null || wasLoading.current
    wasLoading.current = loadingMore != null
    if (seen.current.id !== selected?.id || seeding) {
      seen.current = { id: selected?.id, ids: new Set(rows.map(r => r.id)) }
      return
    }
    const fresh = takeFresh(seen.current.ids, rows)
    if (isLive && alertOn && fresh.length) setQueue(q => [...q, ...fresh].slice(0, 3))
  }, [rows, selected?.id, isLive, alertOn, loadingMore])
  const toast = queue[0] ?? null
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setQueue(q => q.slice(1)), TOAST_MS)
    return () => clearTimeout(t)
  }, [toast])
  const toggleAlert = () => { setAlertOn(on => !on); setQueue([]) }

  // ── נתונים ──
  const all = useMemo(() => subRows(rows, f), [rows, f])
  const k = useMemo(() => kpis(all, per, tick), [all, per, tick])
  // רק 10 הקהילות המובילות (לפי כל החלוקה), וכל השאר בשורת סיכום אחת
  const { comms, commRest } = useMemo(() => {
    const order = topCommunities(communityMoney(rows, per)).top.map(x => x.label)
    const filtered = communityMoney(subRows(rows, f, 'comm'), per)
    const m = new Map(filtered.map(x => [x.label, x]))
    return {
      comms: order.map(label => m.get(label) ?? { label, value: 0, pending: 0, count: 0 }),
      commRest: topCommunities(filtered.filter(x => !order.includes(x.label)), 0).rest,
    }
  }, [rows, f, per])
  // טבלת הנרשמים בעמודים: הסדר והספירה מכל השורות הקלות שכבר בדף, ופרטי
  // המשפחה (טלפונים, כתובת) נטענים רק לעמוד המוצג — ראו fetchRegDetails.
  const ordered = useMemo(() => regOrder(all), [all])
  const pgKey = `${selected?.id}|${JSON.stringify(f)}`
  const [pg, setPg] = useState({ key: '', n: 0 })
  const page = clampPage(pg.key === pgKey ? pg.n : 0, ordered.length)
  const pages = regPages(ordered.length)
  const goPage = (n: number) => setPg({ key: pgKey, n: clampPage(n, ordered.length) })
  const pageRows = useMemo(() => ordered.slice(page * REG_PAGE_SIZE, (page + 1) * REG_PAGE_SIZE), [ordered, page])
  const [details, setDetails] = useState<Map<string, RegDetails>>(() => new Map())
  const [detErr, setDetErr] = useState<{ key: string; msg: string } | null>(null)
  const [retry, setRetry] = useState(0)
  const missingKey = pageRows.filter(r => !details.has(r.id)).map(r => r.id).join(',')
  useEffect(() => {
    if (!missingKey) return
    let alive = true
    const ids = missingKey.split(',')
    fetchRegDetails(ids).then(r => {
      if (!alive) return
      if (r.kind !== 'ok') {
        setDetErr({ key: missingKey, msg: r.kind === 'locked' ? 'פג תוקף הכניסה. רענן את הדף והזן את הסיסמה.' : r.message })
        return
      }
      setDetErr(null)
      setDetails(prev => {
        const m = new Map(prev)
        for (const d of r.details) m.set(d.id, d)
        // ⚠️ מזהה שלא חזר (נמחק בינתיים) מסומן כטעון, אחרת היה נשלח שוב בכל ציור.
        for (const id of ids) if (!m.has(id)) m.set(id, { id })
        return m
      })
    })
    return () => { alive = false }
  }, [missingKey, retry])
  const pageErr = detErr && detErr.key === missingKey ? detErr.msg : null
  const regs = useMemo(() => regTable(withDetails(pageRows, details), per), [pageRows, details, per])
  const commMax = Math.max(1, ...comms.map(x => x.value))
  const chans = useMemo(() => channelCounts(subRows(rows, f, 'ch')), [rows, f])
  const chTotal = chans.reduce((s, x) => s + x.count, 0)
  const hours = useMemo(() => hourCountsCr(subRows(rows, f, 'hour')), [rows, f])
  const hMax = Math.max(1, ...hours)
  const peak = hours.indexOf(Math.max(...hours))
  const cities = useMemo(() => {
    const top = cityTop(rows, 6).map(x => x.label)
    const m = new Map(cityTop(subRows(rows, f, 'city'), 1e6).map(x => [x.label, x.count]))
    return top.map(label => ({ label, count: m.get(label) ?? 0 }))
  }, [rows, f])
  const cityMax = Math.max(1, ...cities.map(x => x.count))

  // החלק החי מחושב על כל השורות של החלוקה, בלי הסינון
  const ref = updatedAt?.getTime() ?? tick
  const buckets = useMemo(() => rateBuckets(rows, ref), [rows, ref])
  const pts = sparkPoints(buckets)
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p.join(' ')).join('')
  const pk = useMemo(() => pickup(rows), [rows])
  const feed = useMemo(() => latest(rows, 4), [rows])

  const closeMs = closesAt ? Date.parse(closesAt) : NaN
  const left = Number.isNaN(closeMs) ? null : Math.max(0, closeMs - tick)
  const closeText = Number.isNaN(closeMs) ? '' : new Date(closeMs).toLocaleString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  const countdown = (() => {
    if (left == null) return null
    let d = left
    return UNITS.map(([label, ms]) => { const v = Math.floor(d / ms); d -= v * ms; return { label, v } })
  })()

  const on = CR_KEYS.filter(key => f[key] != null)
  const valueText = (key: CrKey, v: string | number) => key === 'ch' ? channelLabel(String(v)) : key === 'hour' ? `${pad2(Number(v))}:00` : String(v)
  const lvl = (key: CrKey, v: string | number) => { const x = stLevel(f, key, v); return x === 'sel' ? c.sel : x === 'dim' ? c.dim : '' }
  const nowHour = new Date(tick).getHours()

  return (
    <div className={c.R} dir="rtl">
      <div className={c.app}>
        <main>
          <div className={c.hd}>
            <h1><small>חלוקות חגים · דף הנהלה</small>{selected?.name ?? 'אין חלוקות להצגה'}</h1>
            <span className={cls(c.live, stale && c.stale)}><i /><span>{stale ? 'לא מתעדכן, מנסה שוב · עודכן לאחרונה ' : 'מתעדכן חי · '}{(updatedAt ?? new Date(tick)).toLocaleTimeString('he-IL', { hour12: false })}</span></span>
            {isLive && (
              <button type="button" className={c.tg} aria-pressed={alertOn} onClick={toggleAlert}>
                התראת נרשם חדש: {alertOn ? 'פועלת' : 'כבויה'}
              </button>
            )}
          </div>
          {loadError ? (
            <div role="alert" className={cls(c.note, c.err)}>
              <span>{loadError}</span>
              {onRetry && <button type="button" onClick={onRetry}>נסה שוב</button>}
            </div>
          ) : loadingMore != null && (
            <div role="status" className={c.note}>
              נטענו {loadingMore.toLocaleString('he-IL')} נרשמים · טוען את השאר ברקע, הסיכומים מתעדכנים תוך כדי…
            </div>
          )}

          <div className={c.fl}>
            {on.length ? (
              <>
                מסונן לפי:{' '}
                {on.map(key => (
                  <button key={key} type="button" onClick={() => setF({ ...f, [key]: null })}>
                    {CR_NAMES[key]}: {valueText(key, f[key]!)} <span aria-hidden="true">✕</span>
                  </button>
                ))}
                <button type="button" className={c.x} onClick={() => setF(CR_EMPTY)}>ניקוי הסינון</button>
              </>
            ) : 'לחיצה על כל עמודה, שורה או פס בגרפים מסננת את כל הדף.'}
          </div>

          {selected && (
            <div className={c.grid}>
              <section className={cls(c.p, c.kpi, c.sKpi)} aria-label="מחוונים">
                <div className={c.k}><small>משפחות רשומות</small><b>{num(k.n)}</b><div className={c.d}><em>+{num(k.today)}</em> היום</div></div>
                <div className={c.k}><small>סך הכול לחלוקה</small><b>{shekel(k.sum)}</b><div className={c.d}>לפי סכום הזכאות</div></div>
                <div className={c.k}><small>ממוצע למשפחה</small><b>{shekel(k.avg)}</b><div className={c.d}>{k.kidsAvg.toFixed(1)} ילדים בממוצע</div></div>
                <div className={c.k}>
                  <small>מאושר מול ממתין</small>
                  <div className={c.ap}><i className={c.a} style={{ flex: k.approved || 1 }} /><i className={c.w} style={{ flex: k.pending || 1 }} /></div>
                  <div className={c.apl}><span><b>{shekel(k.approved)}</b> מאושר</span><span><b>{shekel(k.pending)}</b> ממתין</span></div>
                </div>
              </section>

              {isLive && (
                <section className={cls(c.p, c.clk, c.sClk)}>
                  {countdown && left! > 0 ? (
                    <>
                      <small>הרישום נסגר בעוד</small>
                      <div className={c.cd}>
                        {countdown.map((u, i) => (
                          <span key={u.label} style={{ display: 'contents' }}>
                            {i > 0 && <i>:</i>}
                            <span><b>{pad2(u.v)}</b><em>{u.label}</em></span>
                          </span>
                        ))}
                      </div>
                      <div className={c.cl}>מועד הסגירה: {closeText}</div>
                    </>
                  ) : countdown ? (
                    <><small>סגירת הרישום</small><div className={c.closed}>הרישום נסגר</div><div className={c.cl}>מועד הסגירה: {closeText}</div></>
                  ) : (
                    <><small>סגירת הרישום</small><div className={c.closed}>טרם נקבע</div><div className={c.cl}>מועד הסגירה עוד לא נקבע</div></>
                  )}
                </section>
              )}

              {isLive && (
                <section className={cls(c.p, c.sLive)}>
                  <h2>קצב רישום <small>15 הדקות האחרונות · מתעדכן כל 10 שניות</small></h2>
                  <div className={c.lvTop}>
                    <div className={c.rate}><b>{ratePerMinute(buckets)}</b><small>נרשמים בדקה</small></div>
                    <div className={c.cn}>
                      <div><small>נרשמו</small><b>{num(pk.registered)}</b></div>
                      <div><small>הגיעו לאסוף</small><b>{num(pk.arrived)}</b></div>
                      <div><small>ממתינים לאיסוף</small><b>{num(pk.waiting)}</b></div>
                    </div>
                  </div>
                  <svg className={c.spk} viewBox="0 0 600 110" preserveAspectRatio="none" aria-hidden="true">
                    <path d={`${line}L600 110L0 110Z`} fill="var(--ac)" opacity=".1" />
                    <path d={line} fill="none" stroke="var(--ac)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                    <circle cx="600" cy={pts[pts.length - 1][1]} r="4" fill="var(--ac2)" />
                  </svg>
                  {feed.length ? (
                    <ul className={c.feed}>
                      {feed.map(r => (
                        <li key={r.id}>
                          <time>{hhmm(r.registered_at)}</time>
                          <b>{famLabel(r)}</b>
                          <span>{[cityOf(r), channelLabel(channelKeyOf(r.source))].filter(Boolean).join(' · ')}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className={c.empty}>עוד אין נרשמים.</p>}
                </section>
              )}

              <section className={cls(c.p, c.sComm)}>
                <h2>כסף לפי קהילה <small>{COMM_TOP} הקהילות המובילות · לחיצה על שורה מסננת את הדף</small></h2>
                {comms.map(x => (
                  <button key={x.label} type="button" className={cls(c.rw, lvl('comm', x.label))} onClick={() => pick('comm', x.label)}>
                    <span className={c.n}>{x.label}<small>{num(x.count)} משפחות</small></span>
                    <span className={c.br}>
                      <i className={c.a} style={{ width: `${(x.value - x.pending) / commMax * 100}%` }} />
                      <i className={c.w} style={{ width: `${x.pending / commMax * 100}%` }} />
                    </span>
                    <span className={c.v}>{shekel(x.value)}</span>
                  </button>
                ))}
                {!comms.length && <p className={c.empty}>אין נתונים.</p>}
                {commRest.communities > 0 && (
                  <p className={c.more}>ועוד {num(commRest.communities)} קהילות · {num(commRest.count)} משפחות · {shekel(commRest.value)}</p>
                )}
                <div className={c.lg}><span><i />מאושר</span><span><i className={c.w} />ממתין לאישור</span></div>
              </section>

              <section className={cls(c.p, isLive ? c.sCh : c.sChWide)}>
                <h2>ערוצי רישום <small>{num(chTotal)} רישומים</small></h2>
                <div className={c.cs}>
                  {chans.map((x, i) => (
                    <button key={x.key} type="button" aria-label={x.label} style={{ flex: x.count }}
                      className={cls(CH_CLASS[i], f.ch != null && f.ch !== x.key && c.dim)} onClick={() => pick('ch', x.key)} />
                  ))}
                </div>
                {chans.map((x, i) => (
                  <button key={x.key} type="button" className={cls(c.cr, lvl('ch', x.key))} onClick={() => pick('ch', x.key)}>
                    <i className={CH_CLASS[i]} /><span>{x.label}</span><b>{num(x.count)}</b><em>{Math.round(x.count / (chTotal || 1) * 100)}%</em>
                  </button>
                ))}
              </section>

              <section className={cls(c.p, c.sHour)}>
                <h2>רישום לפי שעה <small>{f.hour != null
                  ? `${num(hours[f.hour] ?? 0)} ב-${pad2(f.hour)}:00`
                  : hours[peak] ? `שיא ב-${pad2(peak)}:00 · ${num(hours[peak])} משפחות` : 'אין רישומים'}</small></h2>
                <div className={c.hr}>
                  <div className={c.gl} />
                  {hours.map((v, h) => {
                    const ht = v / hMax * 86
                    return (
                      <button key={h} type="button" aria-label={`${pad2(h)}:00 · ${v}`} style={{ '--h': `${ht}%` } as CSSProperties}
                        className={cls(isLive && h === nowHour && c.now, f.hour != null && f.hour !== h && c.dim)} onClick={() => pick('hour', h)}>
                        <i style={{ height: `${ht}%` }} />
                        {((h === peak && f.hour == null && v > 0) || f.hour === h) && <span>{v}</span>}
                      </button>
                    )
                  })}
                </div>
                <div className={c.hx}>{hours.map((_, h) => <span key={h}>{h % 3 ? '' : pad2(h)}</span>)}</div>
              </section>

              <section className={cls(c.p, c.sCity)}>
                <h2>לפי עיר <small>6 ערים מובילות</small></h2>
                {cities.map(x => (
                  <button key={x.label} type="button" className={cls(c.ct, lvl('city', x.label))} onClick={() => pick('city', x.label)}>
                    <span>{x.label}</span><span className={c.t}><i style={{ width: `${x.count / cityMax * 100}%` }} /></span><b>{num(x.count)}</b>
                  </button>
                ))}
                {!cities.length && <p className={c.empty}>אין נתונים.</p>}
              </section>

              <section className={cls(c.p, c.sNames)}>
                <h2>הנרשמים <small>{num(ordered.length)} משפחות · החדש ראשון</small></h2>
                {regs.length ? (<>
                  {pageErr && (
                    <p className={c.pgErr} role="alert">
                      לא נטענו הטלפונים והכתובות של העמוד הזה. {pageErr}
                      <button type="button" onClick={() => setRetry(x => x + 1)}>נסה שוב</button>
                    </p>
                  )}
                  <div className={c.tw}>
                    <table className={c.regs}>
                      <thead><tr>
                        <th>שם</th><th>טלפון</th><th>כתובת</th><th>עיר</th><th>קהילה</th><th>ילדים</th><th>סכום</th><th>סטטוס</th><th>ערוץ</th><th>שעה</th>
                      </tr></thead>
                      <tbody>{regs.map(x => {
                        const wait = !details.has(x.id) && !pageErr
                        return (
                        <tr key={x.id}>
                          <th scope="row">{x.name}{x.spouse && <small>{x.spouse}</small>}</th>
                          <td dir="ltr" className={c.ph}>{wait ? <span className={c.wait}>…</span> : x.phones}</td>
                          <td>{wait ? <span className={c.wait}>…</span> : x.address}</td>
                          <td>{x.city}</td>
                          <td>{x.comm}</td>
                          <td className={c.nm}>{x.kids ?? ''}</td>
                          <td className={c.nm}>{x.amount ? shekel(x.amount) : ''}</td>
                          <td><span className={cls(c.st, c[x.status])}>{REG_STATUS[x.status]}</span></td>
                          <td>{x.channel}</td>
                          <td className={c.nm}>{hhmm(x.at)}</td>
                        </tr>
                      )})}</tbody>
                    </table>
                  </div>
                  <div className={c.pager}>
                    <button type="button" onClick={() => goPage(page - 1)} disabled={page === 0}>→ הקודם</button>
                    <span>עמוד <b>{num(page + 1)}</b> מתוך {num(pages)} · {num(page * REG_PAGE_SIZE + 1)}–{num(page * REG_PAGE_SIZE + regs.length)} מתוך {num(ordered.length)}</span>
                    <button type="button" onClick={() => goPage(page + 1)} disabled={page >= pages - 1}>הבא ←</button>
                  </div>
                </>) : <p className={c.empty}>עוד אין נרשמים.</p>}
              </section>
            </div>
          )}
        </main>

        <nav aria-label="ניווט">
          <div className={c.brand}><i>חס</i><div><b>היכל החתם סופר</b><small>צפייה בלבד</small></div></div>
          {live && (
            <div>
              <h6>חלוקות חגים</h6>
              <a href="#holidays" className={isLive ? c.on : undefined} aria-current={isLive ? 'page' : undefined}
                onClick={e => { e.preventDefault(); onPickLive() }}>{live.name} <em>פעילה</em></a>
            </div>
          )}
          {prevDists.length > 0 && (
            <div>
              <h6>חלוקות קודמות</h6>
              {prevDists.map(d => (
                <a key={d.id} href="#holidays" className={!isLive && selected?.id === d.id ? c.on : undefined}
                  aria-current={!isLive && selected?.id === d.id ? 'page' : undefined}
                  onClick={e => { e.preventDefault(); onPickPrev(d.id) }}>{d.name}</a>
              ))}
            </div>
          )}
          {otherPages && (
            <div>
              <h6>מחלקות</h6>
              <a href="#home">בית</a><a href="#maternity">עזר יולדות</a><a href="#tree">צאצאים</a>
            </div>
          )}
          <div className={c.ft}><button type="button" onClick={onLogout}>התנתקות</button></div>
        </nav>
      </div>

      <div className={cls(c.toast, toast && c.show)} role="status" aria-live="polite">
        {toast && (
          <>
            <small>נרשמה עכשיו</small>
            <b>{famLabel(toast)}</b>
            <p>{[cityOf(toast), `${Number(toast.beneficiary?.children_count ?? 0) || 0} ילדים`, channelLabel(channelKeyOf(toast.source)), shekel(familyAmount(toast, per))].filter(Boolean).join(' · ')}</p>
            <div key={toast.id} className={c.pr} />
          </>
        )}
      </div>
    </div>
  )
}
