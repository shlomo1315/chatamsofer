'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChargeDay, ChargesReport } from '@/lib/donorCharges'
import type { CardColumns, MatchedRow, MatchStatus, ReconcileResult } from '@/lib/donorCardReconcile'
import { Gate, PasswordScreen } from '../DonorReportView'
import '../donor-report.css'
import './charges.css'

// דוח חיובים לנדיב ("לוח נייבי"): בחירת תאריכים בלוח שנה, מספר החתימה, מטריצה של
// יום × סניף עם פירוט, הדפסה ואקסל (01); והתאמה של קובץ האשראי מול החיובים במערכת (02).
// הכול נגזר מהשרת (/api/donor-report/charges ו-/reconcile), שגם נועל את הקישור לבית שלו.
// הקובץ שהועלה נשלח לשרת לקריאה בלבד ולא נשמר, גם לא בדפדפן אחרי השליחה.
type Mode = 'day' | 'range' | 'multi'
interface Data extends ChargesReport { label: string; lockedHome: string | null; selection: string; days: string[] }
interface RecCharge { id: string; date: string; home: string; name: string; amount: number }
interface RecData { columns: CardColumns; rows: MatchedRow[]; range: ReconcileResult['range']; missing: string[]; charges: RecCharge[] }
type Phase = 'reading' | 'learn' | 'run' | 'done' | 'error'
interface Rec { name: string; phase: Phase; data: RecData | null; chips: number; step: number; error: string }
type St = MatchStatus | 'miss'
interface Sheet { name: string; head: string[]; rows: (string | number | null)[][]; numFrom: number }

const DAY_MS = 86_400_000
const MAX_DATES = 62 // כמו MAX_SELECTED_DATES בשרת
const MAX_FILE = 5 * 1024 * 1024 // כמו MAX_CARD_FILE_BYTES בשרת
const FILE_TYPES = ['pdf', 'xlsx', 'xls', 'csv']
const COLORS = ['#E7BE62', '#6E8BE0', '#4FB58A', '#C58BE0', '#E07A6E', '#5BC0D0']
const ST: Record<St, string> = { ok: 'הותאם', diff: 'פער', none: 'לא נמצא', miss: 'לא בקובץ' }
const STL: Record<St, string> = { ok: 'הותאמו', diff: 'עם פער', none: 'לא נמצאו במערכת', miss: 'במערכת ולא בקובץ' }
const MODES: { key: Mode; label: string }[] = [
  { key: 'day', label: 'יום אחד' },
  { key: 'range', label: 'טווח' },
  { key: 'multi', label: 'ימים נבחרים' },
]
const COL_KEYS = ['date', 'merchant', 'ref', 'amount'] as const

const M = (n: number) => `₪${Math.round(n).toLocaleString('en-US')}`
const signed = (n: number) => (Math.round(n) === 0 ? '₪0' : `${n < 0 ? '−' : '+'}${M(Math.abs(n))}`)
const todayIL = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date())
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * DAY_MS).toISOString().slice(0, 10)
const fd = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`
const fdy = (d: string) => `${fd(d)}.${d.slice(0, 4)}`
const dayName = (d: string) => `יום ${['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'][new Date(`${d}T00:00:00Z`).getUTCDay()]}`
const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`)
const cssC = (c: string) => ({ '--c': c }) as React.CSSProperties

function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let t = Date.parse(from); t <= Date.parse(to) && out.length <= 366; t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

function selLabel(list: string[]): string {
  if (!list.length) return 'לא נבחרו תאריכים'
  if (list.length === 1) return `${dayName(list[0])} ${fdy(list[0])}`
  const first = list[0], last = list[list.length - 1]
  if (list.every((d, i) => i === 0 || d === addDays(list[i - 1], 1))) return `${fd(first)}–${fdy(last)} · ${list.length} ימים`
  const shown = list.slice(0, 6).map(fd).join(', ')
  return `${list.length} ימים: ${shown}${list.length > 6 ? '…' : ''}`
}

// שם הקובץ כמו chargesFileName בשרת: דוח-חיובים_17.11-23.11.2026
function fileName(first: string, last: string): string {
  if (first === last) return `דוח-חיובים_${fdy(first)}`
  return `דוח-חיובים_${first.slice(0, 4) === last.slice(0, 4) ? fd(first) : fdy(first)}-${fdy(last)}`
}

// התצוגה המקדימה של האקסל, באותו מבנה כמו chargesSheets בשרת.
function previewSheets(data: Data): Sheet[] {
  const summary: Sheet = {
    name: 'סיכום',
    head: ['תאריך', ...data.branches.map(b => b.home), 'סה״כ ליום'],
    rows: data.days.map(date => {
      const per = data.branches.map(b => b.days.find(d => d.date === date)?.amount ?? 0)
      return [date, ...per, per.reduce((a, n) => a + n, 0)]
    }),
    numFrom: 1,
  }
  summary.rows.push(['סה״כ', ...data.branches.map(b => b.amount), data.amount])
  return [summary, ...data.branches.map(b => {
    const rows: Sheet['rows'] = []
    for (const d of b.days) d.charges.forEach((c, i) => rows.push([d.date, c.name, c.nights, c.amount, i === d.charges.length - 1 ? d.amount : null]))
    rows.push([`סה״כ ${b.home}`, null, null, null, b.amount])
    return { name: b.home, head: ['תאריך', 'שם היולדת', 'לילות', 'סכום (₪)', 'סה״כ ליום (₪)'], rows, numFrom: 2 }
  })]
}
const cellText = (v: string | number | null) =>
  v === null ? '' : typeof v === 'number' ? v.toLocaleString('en-US') : /^\d{4}-\d{2}-\d{2}$/.test(v) ? fdy(v) : v

const ICONS = {
  print: ['M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2', 'M6 14h12v7H6z'],
  xl: ['M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z', 'M14 3v6h6M9 13l5 5M14 13l-5 5'],
  doc: ['M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z', 'M14 3v6h6M8 13h8M8 17h5'],
  up: ['M12 16V4M7 9l5-5 5 5M4 20h16'],
  re: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5'],
}
const Icon = ({ n }: { n: keyof typeof ICONS }) => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true">{ICONS[n].map(d => <path key={d} d={d} />)}</svg>
)

const readBase64 = (f: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''))
  r.onerror = () => reject(new Error('read'))
  r.readAsDataURL(f)
})

export default function ChargesView({ token }: { token: string }) {
  const [today] = useState(todayIL)
  const [mode, setMode] = useState<Mode>('range')
  const [dates, setDates] = useState<string[]>([today])
  const [from, setFrom] = useState(() => addDays(today, -6))
  const [to, setTo] = useState(today)
  const [anchor, setAnchor] = useState<string | null>(null)
  const [viewMonth, setViewMonth] = useState(today.slice(0, 7))
  const [monthDays, setMonthDays] = useState<Set<string>>(new Set())
  const [focus, setFocus] = useState<{ d: string; h: string } | null>(null)
  const [data, setData] = useState<Data | null>(null)
  const [state, setState] = useState<'loading' | 'password' | 'inactive' | 'error' | 'ok'>('loading')
  const [error, setError] = useState('')
  const [dlError, setDlError] = useState('')
  const [modal, setModal] = useState(false)
  const [sheet, setSheet] = useState(0)
  const [rec, setRec] = useState<Rec | null>(null)
  const [over, setOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const lastFocus = useRef<HTMLElement | null>(null)
  const closeBtn = useRef<HTMLButtonElement>(null)
  const recBox = useRef<HTMLDivElement>(null)
  const lines = useRef<SVGSVGElement>(null)

  const selected = useMemo(() => (mode === 'range' ? daysBetween(from, to) : [...dates].sort()), [mode, from, to, dates])
  const query = useMemo((): Record<string, string> | null => {
    if (mode === 'range') return { from, to }
    return dates.length ? { dates: [...dates].sort().join(',') } : null
  }, [mode, from, to, dates])

  const load = useCallback(async (silent = false) => {
    if (!query) { setData(null); setError(''); setState('ok'); return }
    try {
      const res = await fetch(`/api/donor-report/charges?${new URLSearchParams({ t: token, ...query })}`, { cache: 'no-store' })
      const json = await res.json()
      if (res.ok) { setData(json); setError(''); setState('ok') }
      else if (json.needsPassword) { setData(null); setState('password') }
      else if (json.inactive) { setData(null); setState('inactive') }
      else if (res.status === 400) { setData(null); setError(json.error); setState('ok') }
      else if (!silent) { setData(null); setError(json.error || 'שגיאה בטעינה'); setState('error') }
    } catch {
      if (!silent) { setError('שגיאת רשת, נסו שוב'); setState('error') }
    }
  }, [token, query])

  const loadMonth = useCallback(async () => {
    try {
      const res = await fetch(`/api/donor-report/charges?${new URLSearchParams({ t: token, month: viewMonth })}`, { cache: 'no-store' })
      if (res.ok) setMonthDays(new Set((await res.json()).days as string[]))
    } catch { /* הנקודות בלוח הן תוספת; בלי רשת פשוט לא מוצגות */ }
  }, [token, viewMonth])

  useEffect(() => {
    const t = setTimeout(() => void load(), 250)
    return () => clearTimeout(t)
  }, [load])
  useEffect(() => {
    const t = setTimeout(() => void loadMonth(), 0)
    return () => clearTimeout(t)
  }, [loadMonth])
  // מתעדכן אוטומטית: רענון שקט כל דקה, בלי להסתיר את הנתונים הקיימים.
  useEffect(() => {
    const i = setInterval(() => { void load(true); void loadMonth() }, 60_000)
    return () => clearInterval(i)
  }, [load, loadMonth])

  // ── בורר התאריכים ──
  const clickDay = (d: string) => {
    setFocus(null)
    if (mode === 'day') setDates([d])
    else if (mode === 'multi') setDates(p => (p.includes(d) ? p.filter(x => x !== d) : p.length >= MAX_DATES ? p : [...p, d].sort()))
    else if (!anchor) { setAnchor(d); setFrom(d); setTo(d) }
    else { const [a, b] = [anchor, d].sort(); setFrom(a); setTo(b); setAnchor(null) }
  }
  const switchMode = (m: Mode) => {
    if (m === mode) return
    const last = selected[selected.length - 1] ?? today
    setAnchor(null); setFocus(null)
    if (m === 'day') setDates([last])
    else if (m === 'range') { setFrom(selected[0] ?? today); setTo(last) }
    else setDates(selected.length <= MAX_DATES ? selected : [last])
    setMode(m)
  }
  const moveMonth = (n: number) => {
    const [y, m] = viewMonth.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    setViewMonth(d.toISOString().slice(0, 7))
  }
  const hint = mode === 'day' ? 'בחרו יום' : mode === 'multi' ? 'לחיצה מוסיפה או מסירה' : anchor ? 'בחרו יום סיום' : 'בחרו יום התחלה'
  const calCells = useMemo(() => {
    const first = `${viewMonth}-01`
    const blanks = new Date(`${first}T00:00:00Z`).getUTCDay()
    const [y, m] = viewMonth.split('-').map(Number)
    const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return { blanks, days: Array.from({ length: count }, (_, i) => `${viewMonth}-${String(i + 1).padStart(2, '0')}`) }
  }, [viewMonth])
  const monthTitle = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${viewMonth}-01T00:00:00Z`))

  // ── הדוח ──
  const branches = useMemo(() => data?.branches ?? [], [data])
  const colorOf = useMemo(() => new Map(branches.map((b, i) => [b.home, COLORS[i % COLORS.length]])), [branches])
  const cells = useMemo(() => {
    const map = new Map<string, ChargeDay>()
    for (const b of branches) for (const d of b.days) map.set(`${b.home}|${d.date}`, d)
    return map
  }, [branches])
  const chargeDates = useMemo(() => [...new Set(branches.flatMap(b => b.days.map(d => d.date)))].sort(), [branches])
  const rowDays = data && data.days.length <= 31 ? data.days : chargeDates
  const focusCell = focus ? cells.get(`${focus.h}|${focus.d}`) ?? null : null
  const label = selLabel(selected)

  const download = async () => {
    if (!query || !selected.length) return
    setDlError('')
    try {
      const res = await fetch(`/api/donor-report/charges?${new URLSearchParams({ t: token, ...query, format: 'xlsx' })}`, { cache: 'no-store' })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setDlError(j.error || 'ההורדה נכשלה'); return }
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `${fileName(selected[0], selected[selected.length - 1])}.xlsx`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setModal(false)
    } catch { setDlError('שגיאת רשת, נסו שוב') }
  }

  // ── חלון האקסל ──
  const sheets = useMemo(() => (data ? previewSheets(data) : []), [data])
  const activeSheet = sheets[Math.min(sheet, sheets.length - 1)]
  const openModal = () => {
    lastFocus.current = document.activeElement as HTMLElement | null
    setSheet(0); setDlError(''); setModal(true)
  }
  const closeModal = useCallback(() => { setModal(false); lastFocus.current?.focus() }, [])
  useEffect(() => {
    if (!modal) return
    closeBtn.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [modal, closeModal])

  // ── התאמה ──
  const upload = async (f: File) => {
    const fail = (msg: string) => setRec({ name: f.name, phase: 'error', data: null, chips: 0, step: 0, error: msg })
    if (!FILE_TYPES.includes(f.name.toLowerCase().split('.').pop() ?? '')) return fail('אפשר להעלות PDF, Excel או CSV')
    if (f.size > MAX_FILE) return fail('הקובץ גדול מ-5MB')
    setRec({ name: f.name, phase: 'reading', data: null, chips: 0, step: 0, error: '' })
    try {
      const body = JSON.stringify({ name: f.name, data: await readBase64(f) })
      const res = await fetch(`/api/donor-report/charges/reconcile?${new URLSearchParams({ t: token })}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (j.needsPassword) { setState('password'); return }
        return fail(j.error || 'ההתאמה נכשלה')
      }
      const d = j as RecData
      const quick = window.matchMedia('(prefers-reduced-motion: reduce)').matches || d.rows.length > 150
      setRec({ name: f.name, phase: quick ? 'done' : 'learn', data: d, chips: quick ? COL_KEYS.length : 0, step: quick ? d.rows.length : 0, error: '' })
    } catch { fail('שגיאת רשת, נסו שוב') }
  }
  const rerun = () => setRec(r => (r?.data ? { ...r, phase: 'learn', chips: 0, step: 0 } : r))

  const colNames = rec?.data ? COL_KEYS.map(k => rec.data!.columns[k]).filter((c): c is string => !!c) : []
  useEffect(() => {
    if (!rec?.data) return
    if (rec.phase === 'learn') {
      const more = rec.chips < colNames.length
      const t = setTimeout(() => setRec(r => r && (more ? { ...r, chips: r.chips + 1 } : { ...r, phase: 'run' })), more ? 300 : 350)
      return () => clearTimeout(t)
    }
    if (rec.phase === 'run') {
      const n = rec.data.rows.length
      const t = setTimeout(() => setRec(r => r && (r.step < n ? { ...r, step: r.step + 1 } : { ...r, phase: 'done' })), Math.min(620, 6000 / Math.max(n, 1)))
      return () => clearTimeout(t)
    }
  }, [rec, colNames.length])

  const rd = rec?.data ?? null
  const done = rec?.phase === 'done'
  const step = rec?.step ?? 0
  const passed = (i: number) => done || i < step
  const sysCharges = useMemo(() => (rd ? [...rd.charges].sort((a, b) => a.date.localeCompare(b.date) || a.home.localeCompare(b.home, 'he')) : []), [rd])
  const byId = useMemo(() => new Map(sysCharges.map(c => [c.id, c])), [sysCharges])
  const sysStatus = new Map<string, { st: St; just: boolean }>()
  rd?.rows.forEach((r, i) => { if (r.chargeId && passed(i)) sysStatus.set(r.chargeId, { st: r.status, just: !done && i === step - 1 }) })
  if (done) rd?.missing.forEach(id => sysStatus.set(id, { st: 'miss', just: false }))
  const counts: Record<St, number> = { ok: 0, diff: 0, none: 0, miss: done ? rd?.missing.length ?? 0 : 0 }
  rd?.rows.forEach((r, i) => { if (passed(i)) counts[r.status]++ })
  const nRows = rd?.rows.length ?? 0
  const progText = !rd || rec?.phase === 'learn' ? 'קורא את מבנה הקובץ…' : done ? `הבדיקה הסתיימה · ${nRows} שורות` : `בודק שורה ${Math.min(step + 1, nRows)} מתוך ${nRows}`

  const sums = useMemo(() => {
    if (!rd) return null
    const file = rd.rows.reduce((a, r) => a + r.amount, 0)
    const sys = rd.charges.reduce((a, c) => a + c.amount, 0)
    let diff = 0, none = 0
    for (const r of rd.rows) {
      if (r.status === 'diff' && r.chargeId) diff += r.amount - (byId.get(r.chargeId)?.amount ?? 0)
      if (r.status === 'none') none += r.amount
    }
    const miss = rd.missing.reduce((a, id) => a + (byId.get(id)?.amount ?? 0), 0)
    return { file, sys, total: file - sys, diff, none, miss }
  }, [rd, byId])

  // קווים בין השורה בקובץ לחיוב שנמצא. מצוירים ישירות ב-SVG לפי המיקום של השורות במסך.
  useLayoutEffect(() => {
    const box = recBox.current, svg = lines.current
    if (!box || !svg || !rd) return
    const draw = () => {
      if (getComputedStyle(svg).display === 'none') { svg.innerHTML = ''; return }
      const B = box.getBoundingClientRect()
      let out = ''
      rd.rows.forEach((r, i) => {
        if (!r.chargeId || !(done || i < step)) return
        const a = box.querySelector(`[data-row="${i}"]`), b = box.querySelector(`[data-id="${CSS.escape(r.chargeId)}"]`)
        if (!a || !b) return
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
        const x1 = ra.left - B.left, y1 = ra.top + Math.min(23, ra.height / 2) - B.top
        const x2 = rb.right - B.left, y2 = rb.top + Math.min(23, rb.height / 2) - B.top
        const mx = (x1 + x2) / 2
        out += `<g class="st-${r.status}${!done && i === step - 1 ? ' just' : ''}"><path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}"/><circle cx="${x1}" cy="${y1}" r="3"/><circle cx="${x2}" cy="${y2}" r="3"/></g>`
      })
      svg.innerHTML = out
    }
    draw()
    window.addEventListener('resize', draw)
    return () => window.removeEventListener('resize', draw)
  }, [rd, done, step])

  const logout = async () => {
    try { await fetch('/api/donor-report/auth', { method: 'DELETE' }) } catch { /* גם אם נכשל, מחזירים למסך הסיסמה */ }
    setData(null); setState('password')
  }
  const gate = (children: React.ReactNode) => (
    <div className="dr-root" data-theme="dark" dir="rtl" style={{ minHeight: '100vh' }}>
      <div className="bar">
        <div><b>דוח חיובים</b></div>
      </div>
      <main className="wrap">{children}</main>
    </div>
  )
  if (state === 'password') return gate(<PasswordScreen token={token} onAuth={() => { setState('loading'); void load() }} />)
  if (state === 'inactive') return gate(<Gate title="הקישור טרם הופעל" text="פנו למשרד לקבלת סיסמה." />)
  if (state === 'error') return gate(<Gate title={error} text="אם הגעתם לכאן בטעות, פנו למשרד לקבלת קישור חדש." />)

  const loaded = !!rec && rec.phase !== 'error'
  const homesText = data?.lockedHome ?? branches.map(b => b.home).join(' · ')

  return (
    <div className="ch2" dir="rtl">
      <div className="wrap">
        <header className="top">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="logo" src="/logo.png" alt="איגוד הצאצאים של רבינו החתם סופר" width={512} height={428} />
            <div>
              <h1>{data?.label || 'מעקב אשראי – יולדות שאושרו'}</h1>
              <small>קישור צפייה{homesText ? ` · ${homesText}` : ''}</small>
            </div>
          </div>
          <div className="top-l">
            <span className="live">מתעדכן אוטומטית</span>
            <button type="button" className="back" onClick={() => void logout()}>התנתקות</button>
          </div>
        </header>

        <section className="sec" aria-labelledby="ch2-rep">
          <div className="sec-h">
            <div>
              <span className="eyebrow">01 · דוח</span>
              <h2 id="ch2-rep">חיובים לפי יום וסניף</h2>
            </div>
            <div className="acts">
              <button type="button" className="btn" onClick={() => window.print()} disabled={!data}><Icon n="print" />הדפסה</button>
              <button type="button" className="btn gold" onClick={openModal} disabled={!data}><Icon n="xl" />הורדה לאקסל</button>
            </div>
          </div>
          <div className="printhead"><b>דוח חיובים לפי יום וסניף</b><span>{label}</span><span>הופק {fdy(today)}</span></div>

          <div className="rep-grid">
            <aside className="pick panel" aria-label="בחירת תאריכים">
              <div className="seg" role="group" aria-label="סוג הבחירה">
                {MODES.map(m => (
                  <button key={m.key} type="button" aria-pressed={mode === m.key} onClick={() => switchMode(m.key)}>{m.label}</button>
                ))}
              </div>
              <div className="cal-h">
                <div className="cal-nav">
                  <button type="button" aria-label="החודש הקודם" onClick={() => moveMonth(-1)}>›</button>
                  <b>{monthTitle}</b>
                  <button type="button" aria-label="החודש הבא" onClick={() => moveMonth(1)} disabled={viewMonth >= today.slice(0, 7)}>‹</button>
                </div>
                <span aria-live="polite">{hint}</span>
              </div>
              <div className="cal-g">
                {'אבגדהוש'.split('').map(w => <span key={w} className="cal-w" aria-hidden="true">{w}</span>)}
                {Array.from({ length: calCells.blanks }, (_, i) => <span key={`b${i}`} />)}
                {calCells.days.map(d => {
                  const on = mode === 'range' ? d === from || d === to : dates.includes(d)
                  const inside = mode === 'range' && d > from && d < to
                  const has = monthDays.has(d)
                  return (
                    <button
                      key={d} type="button"
                      className={`cal-d${on ? ' on' : ''}${inside ? ' in' : ''}${d === today ? ' today' : ''}`}
                      disabled={d > today} aria-pressed={on || inside}
                      aria-label={`${dayName(d)} ${fdy(d)}${has ? ', יש חיובים' : ''}`}
                      onClick={() => clickDay(d)}
                    >
                      {Number(d.slice(8))}{has && <i aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
              <div className="selsum">נבחר: <b>{label}</b></div>
            </aside>

            <div aria-live="polite">
              {error ? <div className="panel empty err" role="alert">{error}</div>
                : !query ? <div className="panel empty">בחרו תאריך בלוח השנה</div>
                : !data ? <div className="panel empty">טוען…</div>
                : !branches.length ? <div className="panel empty">אין חיובים בתאריכים שנבחרו</div>
                : (
                  <>
                    <div className="hero panel">
                      <div>
                        <div className="lbl">סה״כ חיובים · {label}</div>
                        <div className="big num">{M(data.amount)}</div>
                        <div className="sub">{plural(data.count, 'חיוב אחד', 'חיובים')} · {plural(branches.length, 'סניף אחד', 'סניפים')}</div>
                      </div>
                      <div className="split">
                        {branches.map(b => (
                          <div key={b.home}><span className="dot" style={cssC(colorOf.get(b.home)!)} />{b.home}<b className="num">{M(b.amount)}</b></div>
                        ))}
                      </div>
                      <div className="hbar" aria-hidden="true">
                        {branches.map(b => <i key={b.home} style={{ flex: b.amount || 1, background: colorOf.get(b.home) }} />)}
                      </div>
                    </div>

                    <div className="tscroll">
                      <table className="mx">
                        <thead>
                          <tr>
                            <th scope="col">יום</th>
                            {branches.map(b => <th key={b.home} scope="col"><span className="dot" style={cssC(colorOf.get(b.home)!)} />{b.home}</th>)}
                            <th scope="col">סה״כ ליום</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rowDays.map(d => {
                            const total = branches.reduce((a, b) => a + (cells.get(`${b.home}|${d}`)?.amount ?? 0), 0)
                            return (
                              <tr key={d}>
                                <th scope="row">{fd(d)}<small>{dayName(d)}</small></th>
                                {branches.map(b => {
                                  const c = cells.get(`${b.home}|${d}`)
                                  if (!c) return <td key={b.home} className="z">—</td>
                                  const sel = focus?.d === d && focus.h === b.home
                                  return (
                                    <td key={b.home}>
                                      <button
                                        type="button" className={sel ? 'sel' : undefined} aria-pressed={sel}
                                        aria-label={`${b.home} ${fdy(d)}: ${M(c.amount)}, ${plural(c.count, 'חיוב אחד', 'חיובים')}`}
                                        onClick={() => setFocus(sel ? null : { d, h: b.home })}
                                      >
                                        <b className="num">{M(c.amount)}</b><small>{plural(c.count, 'חיוב אחד', 'חיובים')}</small>
                                      </button>
                                    </td>
                                  )
                                })}
                                <td className="dt num">{total ? M(total) : '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <th scope="row">סה״כ לסניף</th>
                            {branches.map(b => <td key={b.home} className="num">{M(b.amount)}</td>)}
                            <td className="g num">{M(data.amount)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div className="det panel">
                      <div className="det-h">
                        {focus && focusCell ? (
                          <>
                            <b>פירוט · {focus.h} · {fd(focus.d)}</b>
                            <button type="button" className="btn sm" onClick={() => setFocus(null)}>כל התאים</button>
                          </>
                        ) : (
                          <><b>פירוט החיובים</b><span>לחיצה על תא בטבלה מסננת את הפירוט</span></>
                        )}
                      </div>
                      {(focus && focusCell ? [focus.d] : chargeDates).map(d => (
                        <div key={d} className="grp">
                          <div><b className="num">{fd(d)}</b>{dayName(d)}</div>
                          <div>
                            {branches.filter(b => !(focus && focusCell) || b.home === focus.h).map(b => {
                              const c = cells.get(`${b.home}|${d}`)
                              if (!c) return null
                              const dot = <span className="dot" style={cssC(colorOf.get(b.home)!)} />
                              return (
                                <div key={b.home}>
                                  {c.charges.map(x => (
                                    <div key={x.id} className="row">
                                      <span className="hm">{dot} {b.home}</span>
                                      <span>{x.name}</span>
                                      <span className="mut">{x.nights ? `${x.nights} לילות` : ''}</span>
                                      <span className="num">{M(x.amount)}</span>
                                    </div>
                                  ))}
                                  <div className="row sub">
                                    <span className="hm" />
                                    <span>סה״כ {b.home} ב-{fd(d)}</span>
                                    <span />
                                    <span className="num">{M(c.amount)}</span>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
            </div>
          </div>
        </section>

        <section className="sec noprint" aria-labelledby="ch2-rec">
          <div className="sec-h">
            <div>
              <span className="eyebrow">02 · התאמה</span>
              <h2 id="ch2-rec">פירוט האשראי מול המערכת</h2>
              <p>מעלים את קובץ החיובים מחברת האשראי. כל שורה בקובץ נבדקת ומשויכת לחיוב במערכת לפי סניף, תאריך וסכום. הקו מחבר בין השורה בקובץ לחיוב שנמצא.</p>
            </div>
          </div>

          <div
            className={`drop${over ? ' over' : ''}${loaded ? ' loaded' : ''}`}
            onDragOver={e => { e.preventDefault(); setOver(true) }}
            onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void upload(f) }}
          >
            <div className="ic"><Icon n={loaded ? 'doc' : 'up'} /></div>
            <div className="tx" aria-live="polite">
              {loaded ? (
                <>
                  <b className="ltr">{rec.name}</b>
                  <span>{!rd || rec.phase === 'learn' ? 'מזהה עמודות בקובץ…' : `זוהו ${colNames.length} עמודות ו-${nRows} שורות חיוב · התאמה לפי סניף, תאריך וסכום`}</span>
                  {rd && <div className="chips">{colNames.map((c, i) => <span key={c} className={`chip${i < rec.chips ? ' on' : ''}`}>{c}</span>)}</div>}
                </>
              ) : (
                <>
                  <b>העלאת פירוט חיובים מחברת האשראי</b>
                  <span>PDF או Excel. המערכת מזהה לבד את העמודות ומשייכת כל שורה לחיוב.</span>
                </>
              )}
              {rec?.error && <span className="err" role="alert">{rec.error}</span>}
            </div>
            <div className="acts">
              {rd && <button type="button" className="btn sm" onClick={rerun} disabled={rec?.phase === 'learn' || rec?.phase === 'run'}><Icon n="re" />הרצה מחדש</button>}
              <button type="button" className={`btn ${loaded ? 'sm' : 'gold'}`} onClick={() => fileInput.current?.click()} disabled={rec?.phase === 'reading'}>
                {loaded ? 'קובץ אחר' : 'בחירת קובץ'}
              </button>
              <input
                ref={fileInput} type="file" hidden accept=".pdf,.xlsx,.xls,.csv"
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f) }}
              />
            </div>
          </div>

          {rd && (
            <div className="recon">
              <div className="meter panel">
                <div>
                  <div className="lbl" aria-live="polite">{progText}</div>
                  <div className="bar"><i style={{ width: `${done ? 100 : nRows ? (step / nRows) * 100 : 0}%` }} /></div>
                </div>
                {(['ok', 'diff', 'none', 'miss'] as St[]).map(s => (
                  <div key={s} className={`tile st-${s}`}><b className="num">{counts[s]}</b><span>{STL[s]}</span></div>
                ))}
              </div>

              <div className="c-rec" ref={recBox}>
                <svg className="c-lines" ref={lines} aria-hidden="true" />
                <div className="c-cols">
                  <div className="c-col c-file">
                    <h4>קובץ האשראי <span>{nRows} שורות</span></h4>
                    {rd.rows.map((r, i) => {
                      const isPassed = passed(i), scan = !done && rec?.phase === 'run' && i === step
                      const ch = r.chargeId ? byId.get(r.chargeId) : undefined
                      const cls = isPassed ? `st-${r.status}${!done && i === step - 1 ? ' just' : ''}` : scan ? 'scan' : 'pending'
                      return (
                        <div key={r.line} className={`cf ${cls}`} data-row={i}>
                          <span className="num">{fd(r.date)}</span>
                          <b>{r.merchant || r.ref || '—'}</b>
                          <span className="num">{M(r.amount)}</span>
                          <span className="tag">{isPassed ? <span className="pill">{ST[r.status]}</span> : scan ? <span className="scan-t">בודק…</span> : null}</span>
                          {isPassed && ch && <span className="to">← {ch.name} · {ch.home} · {fd(ch.date)}</span>}
                          {isPassed && r.why && <em className="why">{r.why}</em>}
                        </div>
                      )
                    })}
                  </div>
                  <div className="c-gap" aria-hidden="true" />
                  <div className="c-col c-sys">
                    <h4>חיובים במערכת <span>{fd(rd.range.from)}–{fd(rd.range.to)} · {sysCharges.length}</span></h4>
                    {sysCharges.map(c => {
                      const s = sysStatus.get(c.id)
                      return (
                        <div key={c.id} className={`cs${s ? ` st-${s.st}${s.just ? ' just' : ''}` : ''}`} data-id={c.id}>
                          <span className="num">{fd(c.date)}</span>
                          <b>{c.name}</b>
                          <span className="mut">{c.home}</span>
                          <span className="num">{M(c.amount)}</span>
                          {s?.st === 'miss' && <em className="why st-miss" style={{ gridColumn: '1/-1' }}>נרשם במערכת ולא הופיע בקובץ</em>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {done && sums && (
                <div className="recsum panel">
                  <div><span>סה״כ בקובץ האשראי</span><b className="num">{M(sums.file)}</b></div>
                  <div><span>סה״כ במערכת · {fd(rd.range.from)}–{fd(rd.range.to)}</span><b className="num">{M(sums.sys)}</b></div>
                  <div className="dif">
                    <span>הפרש לבירור</span>
                    <b className="num">{signed(sums.total)}</b>
                    <small className="num">פער סכום {signed(sums.diff)} · לא נמצא {signed(sums.none)} · לא בקובץ {signed(-sums.miss)}</small>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {modal && data && activeSheet && (
        <div className="modal" onMouseDown={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div className="mbox" role="dialog" aria-modal="true" aria-labelledby="ch2-xl">
            <header>
              <div>
                <small>תצוגה מקדימה של הקובץ</small>
                <h3 id="ch2-xl" className="ltr">{fileName(selected[0], selected[selected.length - 1])}.xlsx</h3>
              </div>
              <button type="button" className="x" aria-label="סגירה" ref={closeBtn} onClick={closeModal}>✕</button>
            </header>
            <div className="xl-tabs" role="group" aria-label="גיליונות">
              {sheets.map((s, i) => (
                <button key={s.name} type="button" aria-pressed={s === activeSheet} onClick={() => setSheet(i)}>{s.name}</button>
              ))}
            </div>
            <div className="xl-body">
              <table className="xl">
                <tbody>
                  <tr><td className="cl rn" />{activeSheet.head.map((_, i) => <td key={i} className="cl">{String.fromCharCode(65 + (i % 26))}</td>)}</tr>
                  <tr className="hd"><td className="rn">1</td>{activeSheet.head.map((h, i) => <td key={i}>{h}</td>)}</tr>
                  {activeSheet.rows.map((r, ri) => (
                    <tr key={ri} className={ri === activeSheet.rows.length - 1 ? 'tt' : undefined}>
                      <td className="rn">{ri + 2}</td>
                      {r.map((v, ci) => <td key={ci} className={ci >= activeSheet.numFrom ? 'n' : undefined}>{cellText(v)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer>
              <span>גיליון סיכום (יום × סניף) וגיליון פירוט לכל סניף, עם סה״כ ליום ולסניף.</span>
              {dlError && <span className="err" role="alert">{dlError}</span>}
              <button type="button" className="btn pri" onClick={() => void download()}><Icon n="xl" />הורדת הקובץ</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
