'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CHUMASH_NAMES, filterRows, type ArchiveRow } from '@/lib/gilyonotArchiveView'

export default function ArchiveClient({ rows, fileBase, failed }: { rows: ArchiveRow[]; fileBase: string; failed: boolean }) {
  const [q, setQ] = useState('')
  const [year, setYear] = useState('')
  const [chumash, setChumash] = useState('')
  const [topic, setTopic] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  const years = useMemo(() => [...new Set(rows.map(r => r.yearLabel).filter(Boolean))], [rows])
  const chumashim = useMemo(() => CHUMASH_NAMES.filter(c => rows.some(r => r.chumash === c)), [rows])
  const topics = useMemo(() => [...new Set(rows.map(r => r.topic).filter((t): t is string => !!t))], [rows])
  const shown = useMemo(() => filterRows(rows, { q, year, chumash, topic }), [rows, q, year, chumash, topic])
  const filtering = !!(q.trim() || year || chumash || topic)

  // "/" קופץ לחיפוש
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(document.activeElement instanceof HTMLInputElement)) { e.preventDefault(); searchRef.current?.focus() }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const reset = () => { setQ(''); setYear(''); setChumash(''); setTopic('') }
  const view = (r: ArchiveRow) => `${fileBase}/${r.id}`
  const download = (r: ArchiveRow) => `${fileBase}/${r.id}?download=${encodeURIComponent(r.title)}`

  const Cover = ({ r, isNew }: { r: ArchiveRow; isNew?: boolean }) => (
    <div className="cover">
      {isNew && <span className="pill">חדש</span>}
      <span className="pm">{r.chumash === 'מועדים' ? 'מועדים' : 'פרשת'}</span>
      <span className="pn">{r.parasha.replace(/^פרשת\s+/, '')}</span>
      <span className="ln" />
      <span className="yr">{r.yearLabel}</span>
    </div>
  )
  const Acts = ({ r }: { r: ArchiveRow }) => (
    <div className="acts">
      <a className="btn" href={view(r)} target="_blank" rel="noopener noreferrer">צפייה</a>
      <a className="btn" href={download(r)} rel="noopener noreferrer">הורדה</a>
    </div>
  )

  return (
    <div className="arch" dir="rtl" lang="he">
      <header className="pub-head">
        <div className="wrap">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-heichal.png" alt="היכל החתם סופר" />
            <div><b style={{ fontSize: 18 }}>היכל החתם סופר</b><small>ארכיון הגיליונות</small></div>
          </div>
          <h1 className="pub-title">כל הגיליונות,<br /><em>בכל הפרשיות.</em></h1>
          <p>צפייה והורדה חופשית של כל גיליונות החתם סופר. מחפשים לפי פרשה, שנה או נושא.</p>
          <label className="search">
            <input ref={searchRef} value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש: וירא, הכנסת אורחים, תשפ״ה…" aria-label="חיפוש גיליונות" />
            <kbd>/</kbd>
          </label>
        </div>
      </header>

      <div className="filters">
        <div className="wrap">
          <select className="sel-f" value={year} onChange={e => setYear(e.target.value)} aria-label="שנה">
            <option value="">כל השנים</option>{years.map(y => <option key={y}>{y}</option>)}
          </select>
          <select className="sel-f" value={chumash} onChange={e => setChumash(e.target.value)} aria-label="חומש">
            <option value="">כל החומשים</option>{chumashim.map(c => <option key={c}>{c}</option>)}
          </select>
          <div className="chips">
            <button className="chip" aria-pressed={!topic} onClick={() => setTopic('')}>כל הנושאים</button>
            {topics.map(t => <button key={t} className="chip" aria-pressed={topic === t} onClick={() => setTopic(t)}>{t}</button>)}
          </div>
        </div>
      </div>

      <main className="wrap" style={{ paddingTop: 28 }}>
        <div className="results-h"><h2 aria-live="polite">{shown.length.toLocaleString('he-IL')} גיליונות</h2></div>
        {failed && <div className="empty"><h2>הארכיון אינו זמין כרגע</h2><p>נסו שוב בעוד כמה דקות.</p></div>}
        {!failed && !shown.length && (
          <div className="empty">
            <h2>לא מצאנו גיליון כזה</h2>
            <p>נסו מילה אחרת, או נקו את הסינון.</p>
            {filtering && <button className="btn primary" style={{ flex: 'none', padding: '8px 24px' }} onClick={reset}>ניקוי הסינון</button>}
          </div>
        )}
        <div className="bento">
          {shown.slice(0, 120).map((r, i) => i === 0 && !filtering ? (
            <article key={r.id} className="g feat">
              <Cover r={r} isNew />
              <div className="side">
                <span className="pill" style={{ alignSelf: 'flex-start' }}>הגיליון האחרון</span>
                <h3>{r.title}</h3>
                <p>{r.parasha} · {r.yearLabel}{r.topic ? ` · נושא: ${r.topic}` : ''}</p>
                <Acts r={r} />
              </div>
            </article>
          ) : (
            <article key={r.id} className="g">
              <Cover r={r} />
              <div className="meta"><b>{r.title}</b>{r.topic && <span>{r.topic}</span>}</div>
              <Acts r={r} />
            </article>
          ))}
        </div>
      </main>

      <footer className="pub-foot">דף לקריאה והורדה בלבד · היכל החתם סופר · chasamsofer.co.il</footer>
    </div>
  )
}
