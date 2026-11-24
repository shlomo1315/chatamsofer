'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChargesReport } from '@/lib/donorCharges'
import { Gate, PasswordScreen } from '../DonorReportView'
import '../donor-report.css'
import './charges.css'

// דוח חיובים לפי תאריך: יום אחד, טווח, או כמה תאריכים נבחרים. הפירוט מקובץ לפי סניף
// (בית ההחלמה שהגיש את הקבלה) ולפי יום, עם סכום יומי לכל סניף. הכול נגזר מהשרת
// (/api/donor-report/charges), שגם נועל את הקישור לבית שלו.
type Mode = 'day' | 'range' | 'dates'
interface Data extends ChargesReport { label: string; lockedHome: string | null; selection: string }

const nis = (n: number) => `₪${Math.round(n).toLocaleString('en-US')}`
const MODES: { key: Mode; label: string }[] = [
  { key: 'day', label: 'יום אחד' },
  { key: 'range', label: 'טווח תאריכים' },
  { key: 'dates', label: 'כמה תאריכים' },
]

// בלי ייבוא פונקציות מ-lib/donorCharges: הוא מושך קוד שרת (שליפה מהמסד) לדפדפן.
const heDate = (d: string) => d.split('-').reverse().join('.')
const todayIL = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date())
function addDays(d: string, n: number): string {
  const t = new Date(`${d}T12:00:00Z`)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}
const weekday = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('he-IL', { weekday: 'long', timeZone: 'UTC' })

export default function ChargesView({ token }: { token: string }) {
  const [today] = useState(todayIL)
  const [mode, setMode] = useState<Mode>('day')
  const [day, setDay] = useState(today)
  const [from, setFrom] = useState(addDays(today, -6))
  const [to, setTo] = useState(today)
  const [dates, setDates] = useState<string[]>([today])
  const [pick, setPick] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [state, setState] = useState<'loading' | 'password' | 'inactive' | 'error' | 'ok'>('loading')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [dlError, setDlError] = useState('')

  // הפרמטרים לשרת לפי מצב הבחירה; null כשהבחירה עוד לא שלמה.
  const query = useMemo((): Record<string, string> | null => {
    if (mode === 'day') return day ? { dates: day } : null
    if (mode === 'dates') return dates.length ? { dates: [...dates].sort().join(',') } : null
    return from && to && from <= to ? { from, to } : null
  }, [mode, day, dates, from, to])

  const load = useCallback(async () => {
    if (!query) { setData(null); setState('ok'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/donor-report/charges?${new URLSearchParams({ t: token, ...query })}`, { cache: 'no-store' })
      const json = await res.json()
      if (res.ok) { setData(json); setError(''); setState('ok') }
      else if (json.needsPassword) { setData(null); setState('password') }
      else if (json.inactive) { setData(null); setState('inactive') }
      else if (res.status === 400) { setData(null); setError(json.error); setState('ok') }
      else { setData(null); setError(json.error || 'שגיאה בטעינה'); setState('error') }
    } catch { setError('שגיאת רשת, נסו שוב'); setState('error') }
    finally { setBusy(false) }
  }, [token, query])

  useEffect(() => {
    const t = setTimeout(() => void load(), 250)
    return () => clearTimeout(t)
  }, [load])

  const preset = (f: string, t: string) => { setMode('range'); setFrom(f); setTo(t) }
  const monthStart = `${today.slice(0, 8)}01`
  const prevMonthEnd = addDays(monthStart, -1)

  const addDate = () => {
    if (!pick) return
    setDates(d => (d.includes(pick) ? d : [...d, pick].sort()))
    setPick('')
  }

  const download = async () => {
    if (!query) return
    setDlError('')
    try {
      const res = await fetch(`/api/donor-report/charges?${new URLSearchParams({ t: token, ...query, format: 'xlsx' })}`, { cache: 'no-store' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setDlError(j.error || 'ההורדה נכשלה'); return }
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `דוח חיובים ${(data?.selection ?? '').replace(/\./g, '-').replace(/,\s*/g, ' ')}.xlsx`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setDlError('שגיאת רשת, נסו שוב') }
  }

  const back = `/donor-report/${encodeURIComponent(token)}`
  const shell = (children: React.ReactNode) => (
    <div className="dr-root ch" data-theme="light" dir="rtl" style={{ minHeight: '100vh' }}>
      <div className="bar">
        <div><b>דוח חיובים</b></div>
        <span className="barr"><a className="lo" href={back}>חזרה לדוח היולדות</a></span>
      </div>
      <main className="wrap">{children}</main>
    </div>
  )

  if (state === 'password') return shell(<PasswordScreen token={token} onAuth={() => { setState('loading'); void load() }} />)
  if (state === 'inactive') return shell(<Gate title="הקישור טרם הופעל" text="פנו למשרד לקבלת סיסמה." />)
  if (state === 'error') return shell(<Gate title={error} text="אם הגעתם לכאן בטעות, פנו למשרד לקבלת קישור חדש." />)

  return shell(
    <>
      <div className="top">
        <div className="mark">ח</div>
        <div>
          <h1>דוח חיובים לפי תאריך</h1>
          <p>היכל החתם סופר{data?.lockedHome ? ` · ${data.lockedHome}` : ''}{data?.selection ? ` · ${data.selection}` : ''}</p>
        </div>
      </div>

      <section className="tile ch-pick no-print" aria-label="בחירת תאריכים">
        <div className="seg" role="group" aria-label="סוג הבחירה">
          {MODES.map(m => <button key={m.key} aria-pressed={mode === m.key} onClick={() => setMode(m.key)}>{m.label}</button>)}
        </div>

        <div className="ch-inputs">
          {mode === 'day' && <label className="dt">תאריך<input type="date" value={day} max={today} onChange={e => setDay(e.target.value)} /></label>}
          {mode === 'range' && <>
            <label className="dt">מתאריך<input type="date" value={from} max={to || today} onChange={e => setFrom(e.target.value)} /></label>
            <label className="dt">עד תאריך<input type="date" value={to} min={from || undefined} max={today} onChange={e => setTo(e.target.value)} /></label>
          </>}
          {mode === 'dates' && <>
            <label className="dt">הוספת תאריך<input type="date" value={pick} max={today} onChange={e => setPick(e.target.value)} /></label>
            <button className="lo" onClick={addDate} disabled={!pick}>הוספה</button>
            <div className="ch-chips">
              {dates.map(d => (
                <button key={d} className="tg" onClick={() => setDates(x => x.filter(y => y !== d))} aria-label={`הסרת ${heDate(d)}`}>
                  <span className="num">{heDate(d)}</span> <span aria-hidden>×</span>
                </button>
              ))}
              {!dates.length && <span className="ch-hint">בחרו תאריך ולחצו הוספה</span>}
            </div>
          </>}
        </div>

        <div className="ch-presets">
          <button className="chip" onClick={() => { setMode('day'); setDay(today) }}>היום</button>
          <button className="chip" onClick={() => { setMode('day'); setDay(addDays(today, -1)) }}>אתמול</button>
          <button className="chip" onClick={() => preset(addDays(today, -6), today)}>7 הימים האחרונים</button>
          <button className="chip" onClick={() => preset(monthStart, today)}>החודש</button>
          <button className="chip" onClick={() => preset(`${prevMonthEnd.slice(0, 8)}01`, prevMonthEnd)}>החודש הקודם</button>
        </div>
      </section>

      {error && <p role="alert" className="ch-err">{error}</p>}

      <div className="ch-actions no-print">
        <button className="go" onClick={() => window.print()} disabled={!data}>הדפסה</button>
        <button className="lo" onClick={() => void download()} disabled={!data}>הורדה לאקסל</button>
        {busy && <span className="ch-hint">טוען…</span>}
        {dlError && <span role="alert" className="ch-err">{dlError}</span>}
      </div>

      {data && (
        <>
          <section className="tile ch-sum" aria-label="סיכום">
            <div><p className="lbl">סה״כ חיובים</p><p className="ch-big num ltr">{nis(data.amount)}</p></div>
            <div><p className="lbl">מספר חיובים</p><p className="ch-mid num">{data.count}</p></div>
            <div><p className="lbl">סניפים</p><p className="ch-mid num">{data.branches.length}</p></div>
          </section>

          {data.branches.length > 1 && (
            <section className="tile ch-branch" aria-label="סיכום לפי סניף">
              <h2>סיכום לפי סניף ויום</h2>
              <div className="ch-scroll"><table className="ch-t">
                <thead><tr><th>סניף</th><th>תאריך</th><th>חיובים</th><th>סכום</th></tr></thead>
                <tbody>
                  {data.branches.flatMap(b => [
                    ...b.days.map(d => (
                      <tr key={`${b.home}-${d.date}`}><td>{b.home}</td><td className="num">{heDate(d.date)} · {weekday(d.date)}</td><td className="num">{d.count}</td><td className="num">{nis(d.amount)}</td></tr>
                    )),
                    <tr key={`${b.home}-total`} className="ch-tot"><td>סה״כ {b.home}</td><td /><td className="num">{b.count}</td><td className="num">{nis(b.amount)}</td></tr>,
                  ])}
                </tbody>
                <tfoot><tr className="ch-tot"><td>סה״כ כל הסניפים</td><td /><td className="num">{data.count}</td><td className="num">{nis(data.amount)}</td></tr></tfoot>
              </table></div>
            </section>
          )}

          {data.branches.length === 0 && <section className="tile"><p className="empty">אין חיובים בתאריכים שנבחרו.</p></section>}

          {data.branches.map(b => (
            <section key={b.home} className="tile ch-branch" aria-label={`סניף ${b.home}`}>
              <h2>{b.home}<span className="num">{b.count} חיובים · {nis(b.amount)}</span></h2>
              {b.days.map(d => (
                <div key={d.date} className="ch-day">
                  <h3 className="num">{heDate(d.date)} · {weekday(d.date)}</h3>
                  <div className="ch-scroll"><table className="ch-t">
                    <thead><tr><th>שעה</th><th>יולדת</th><th>ת״ז</th><th>לילות</th><th>סוג</th><th>הערת בית ההחלמה</th><th>סכום</th></tr></thead>
                    <tbody>
                      {d.charges.map(c => (
                        <tr key={c.id}>
                          <td className="num">{c.time}</td><td>{c.name}</td>
                          <td className="num"><span className="ltr">{c.idLast4 ? '••••' + c.idLast4 : '—'}</span></td>
                          <td className="num">{c.nights ?? '—'}</td><td>{c.initial ? 'חיוב ראשון' : 'תוספת'}</td>
                          <td>{c.note ?? ''}</td><td className="num">{nis(c.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="ch-tot"><td colSpan={6}>סה״כ ליום {heDate(d.date)} · {d.count} חיובים</td><td className="num">{nis(d.amount)}</td></tr></tfoot>
                  </table></div>
                </div>
              ))}
            </section>
          ))}
          <p className="note">כל חיוב הוא קבלה שבית ההחלמה הגיש, בתאריך ההגשה. הסכום היומי מחושב לכל סניף בנפרד.</p>
        </>
      )}
    </>,
  )
}
