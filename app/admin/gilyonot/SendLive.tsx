'use client'

// שליחה חיה של גיליון: מחוון התקדמות, ספירה לאחור, קצב לפי דקה, משפך, עשרת האחרונים ויומן.
// בנוי לפי המוקאפ שאושר (uploads/…-mockup-gilyonot-send-live.html). נתונים: /api/admin/gilyonot/issues/[id]/live
// בזמן שליחה מתעדכן כל 5 שניות, והשעון יורד כל שנייה בין עדכון לעדכון.

import { useEffect, useState } from 'react'
import type { LiveGap, LiveMinute } from '@/lib/gilyonotLive'
import s from './SendLive.module.css'

interface LiveData {
  issue: { id: string; title: string; parasha: string; status: string; started_at: string | null; completed_at: string | null }
  total: number; sent: number; pending: number; failed: number
  delivered: number; opened: number; clicked: number; downloaded: number
  recent: { email: string; sent_at: string }[]
  rate: number; etaSec: number | null; active: boolean
  firstSent: string | null; lastSent: string | null
  minutes: LiveMinute[]; gaps: LiveGap[]
}

const POLL_MS = 5000
const ARC = 653
const f = (n: number) => n.toLocaleString('en')
const hm = (iso: string | null | undefined) => iso ? new Date(iso).toTimeString().slice(0, 5) : '—'
const hms = (iso: string) => new Date(iso).toTimeString().slice(0, 8)
const clock = (sec: number) => {
  const r = Math.max(0, Math.round(sec))
  return `${Math.floor(r / 3600)}:${String(Math.floor((r % 3600) / 60)).padStart(2, '0')}:${String(r % 60).padStart(2, '0')}`
}
const w = (n: number, of: number) => `${of ? Math.min(100, (n / of) * 100) : 0}%`

export function SendLive({ issueId }: { issueId: string }) {
  const [d, setD] = useState<LiveData | null>(null)
  const [at, setAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [err, setErr] = useState('')
  const sending = d?.issue.status === 'sending'

  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = async () => {
      try {
        const res = await fetch(`/api/admin/gilyonot/issues/${issueId}/live`, { cache: 'no-store' })
        const j = await res.json().catch(() => ({}))
        if (!live) return
        if (!res.ok) setErr(j.error || 'הטעינה נכשלה')
        else { setD(j); setAt(Date.now()); setErr('') }
        if (res.ok && j.issue?.status !== 'sending') return
      } catch { if (live) setErr('הטעינה נכשלה') }
      if (live) timer = setTimeout(load, POLL_MS)
    }
    load()
    return () => { live = false; clearTimeout(timer) }
  }, [issueId])

  useEffect(() => {
    if (!sending) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [sending])

  if (!d) return <div className={s.wrap}><p className={s.sub}>{err || 'טוען את מצב השליחה...'}</p></div>

  const p = d.total ? d.sent / d.total : 0
  const left = d.etaSec !== null ? Math.max(0, d.etaSec - Math.max(0, now - at) / 1000) : null
  const endIso = left !== null ? new Date(now + left * 1000).toISOString() : d.issue.completed_at
  const stopped = sending && !d.active && d.pending > 0
  const max = Math.max(1, ...d.minutes.map(m => m.count))
  const lastGap = d.gaps.at(-1)

  const events: [string, string][] = []
  if (d.issue.started_at || d.firstSent) events.push([hm(d.issue.started_at ?? d.firstSent), `השליחה התחילה · ${f(d.total)} נמענים`])
  for (const g of d.gaps) {
    events.push([hm(g.from), `השליחה נעצרה${g.to ? ` ל-${g.minutes} דקות` : ''} (פריסה של האתר או נעילה)`])
    if (g.to && g.resumedAt) events.push([hm(g.to), `השליחה המשיכה מנמען ${f(g.resumedAt)}`])
  }
  events.push(d.issue.status === 'sent'
    ? [hm(d.issue.completed_at), `השליחה הסתיימה · ${f(d.sent)} נשלחו${d.failed ? `, ${f(d.failed)} נכשלו` : ''}`]
    : ['—', stopped ? `השליחה עצורה כבר ${lastGap?.minutes ?? 0} דקות · ${f(d.pending)} ממתינים` : 'השליחה פעילה · לא למזג ולא לפרוס עד הסיום'])

  return (
    <div className={s.wrap}>
      <div className={s.top}><div><h1 className={s.title}>גיליונות החתם סופר</h1><div className={s.sub}>שליחה חיה · {d.issue.title} · פרשת {d.issue.parasha}</div></div></div>

      <div className={s.hero}>
        <div className={s.ring}>
          <svg width="240" height="240" aria-hidden>
            <circle cx="120" cy="120" r="104" stroke="#ffffff18" strokeWidth="18" fill="none" />
            <circle cx="120" cy="120" r="104" stroke="#c8902d" strokeWidth="18" fill="none" strokeLinecap="round" strokeDasharray={ARC} strokeDashoffset={ARC * (1 - p)} />
          </svg>
          <div className={s.c}><b className={s.num}>{Math.round(p * 100)}%</b><small className={s.num}>{f(d.sent)} / {f(d.total)}</small></div>
        </div>
        <div style={{ position: 'relative', zIndex: 1 }}>
          {d.active
            ? <span className={s.live}><span className={s.dot} />שולח עכשיו</span>
            : <span className={s.live} style={stopped ? { background: '#ef444422', color: '#f87171' } : undefined}>{stopped ? 'השליחה עצורה' : d.issue.status === 'sent' ? 'השליחה הסתיימה' : 'ממתין לשליחה'}</span>}
          <h2 className={s.h2}>{d.issue.status === 'sent' ? 'השליחה הסתיימה' : left !== null ? <>נותרו <span className={s.num}>{clock(left)}</span> שעות</> : 'אין קצב לחשב זמן סיום'}</h2>
          <div style={{ color: '#b9c1d4', fontSize: 14 }}>
            {d.issue.status === 'sent' ? 'הסתיימה ב-' : 'צפי סיום: '}<b style={{ color: '#fff' }} className={s.num}>{hm(endIso)}</b> · קצב <b style={{ color: '#fff' }}>~{d.rate} מיילים בשנייה</b>
          </div>
          <div className={s.kp}>
            <div><span>נשלחו</span><b className={s.num}>{f(d.sent)}</b></div>
            <div><span>ממתינים</span><b className={s.num}>{f(d.pending)}</b></div>
            <div><span>נכשלו</span><b className={s.num}>{f(d.failed)}</b></div>
            <div><span>נפתחו</span><b className={s.num}>{f(d.opened)}</b></div>
          </div>
          <div className={s.bar}><i style={{ background: '#c8902d', width: w(d.sent, d.total) }} /><i style={{ background: '#ef4444', width: w(d.failed, d.total) }} /></div>
          <div className={s.tl}><span>התחלה {hm(d.issue.started_at ?? d.firstSent)}</span><span>עכשיו</span><span>סיום משוער</span></div>
          <div className={s.shield}>🛡 {lastGap
            ? lastGap.to
              ? `עצירה אחרונה ב-${hm(lastGap.from)} למשך ${lastGap.minutes} דקות, השליחה המשיכה מנמען ${f(lastGap.resumedAt ?? 0)} בלי כפילות.`
              : `השליחה עצורה מאז ${hm(lastGap.from)}. היא תמשיך מהנמען הבא כשהנעילה תשתחרר.`
            : 'אין עצירות בשליחה הזו עד עכשיו.'}</div>
        </div>
      </div>

      <div className={s.grid}>
        <div className={s.card}><h3>קצב שליחה לפי דקה</h3><p>כל עמודה היא דקה; הקו הצהוב מסמן עצירה בשליחה (בדרך כלל פריסה של האתר)</p>
          <svg viewBox="0 0 600 180" width="100%" height="180" role="img" aria-label="מיילים שנשלחו בכל דקה ב-40 הדקות האחרונות">
            {d.minutes.map((m, i) => {
              // גובה מרבי 130 כמו במוקאפ, כדי שהתווית למעלה לא תעלה על העמודות. דקת עצירה: עמודה אדומה נמוכה
              const v = m.count ? Math.max(3, (m.count / max) * 130) : m.gap ? 8 : 0
              return <rect key={m.t} x={590 - i * 15} y={170 - v} width="10" height={v} rx="3" fill={m.gap ? '#ef4444' : '#16213a'}><title>{`${hm(m.t)} · ${f(m.count)}`}</title></rect>
            })}
            {d.minutes.map((m, i) => m.gap && !d.minutes[i + 1]?.gap
              ? <g key={`g${m.t}`}><line x1={590 - i * 15} x2={590 - i * 15} y1="0" y2="170" stroke="#c8902d" strokeDasharray="4" /><text x={585 - i * 15} y="12" fontSize="11" fill="#c8902d" textAnchor="end">עצירה</text></g>
              : null)}
          </svg>
        </div>
        <div className={s.card}><h3>משפך פתיחה</h3><p>מתעדכן בזמן אמת</p><div className={s.funnel}>
          {([['נמסרו', d.delivered], ['פתחו', d.opened], ['הקליקו', d.clicked], ['הורידו PDF', d.downloaded]] as const).map(([l, v]) => (
            <div key={l}><div className={s.l}><span>{l}</span><span className={s.num}>{f(v)}</span></div><div className={s.t}><i style={{ width: w(v, d.total) }} /></div></div>
          ))}
        </div></div>
        <div className={s.card}><h3>נשלחו עכשיו</h3><p>עשרת האחרונים</p>
          <ul className={s.feed}>
            {d.recent.length ? d.recent.map(r => <li key={r.email + r.sent_at}><span dir="ltr">{r.email}</span><em className={s.num}>✓ {hms(r.sent_at)}</em></li>) : <li>עוד לא נשלח אף מייל</li>}
          </ul>
        </div>
        <div className={s.card}><h3>יומן אירועים</h3><p>מה קרה בשליחה הזו</p>
          {events.map(([t, x], i) => <div key={i} className={s.ev}><b className={s.num}>{t}</b>{x}</div>)}
        </div>
      </div>
      {err && <p className={s.sub} style={{ marginTop: 12, color: '#b91c1c' }}>{err} · מנסה שוב</p>}
    </div>
  )
}
