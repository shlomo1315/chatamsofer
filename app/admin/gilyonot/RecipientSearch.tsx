'use client'

// חיפוש נמען בגיליון (בתוך החלון של השליחה החיה): חיפוש לפי מייל או חלק ממנו על כל מי שנשלח לו,
// כולל מי שלא פתח, ולכל נמען שורת מצב ומתי נשלח, נמסר, נפתח, הקליק והוריד.
// נתונים: /api/admin/gilyonot/issues/[id]/recipients (חיפוש בצד השרת, 50 בעמוד).

import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { recipientSummary, type RecipientFilter, type RecipientRow } from '@/lib/gilyonotRecipients'
import s from './SendLive.module.css'

const TABS: [RecipientFilter | '', string][] = [['', 'כולם'], ['opened', 'פתחו'], ['unopened', 'לא פתחו'], ['clicked', 'הקליקו'], ['downloaded', 'הורידו'], ['bounced', 'חזרו']]
const f = (n: number) => n.toLocaleString('en')
const dhm = (iso: string) => new Date(iso).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
// בתוך משפט בעברית: "25.11 בשעה 13:40", כדי שהתאריך והשעה לא יתהפכו
const when = (iso: string) => `${new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })} בשעה ${new Date(iso).toTimeString().slice(0, 5)}`

function When({ at, n }: { at: string | null; n?: number }) {
  if (!at) return <>—</>
  return <>{dhm(at)}{n !== undefined && n > 1 && <span className={s.cnt}>×{n}</span>}</>
}

export function RecipientSearch({ issueId }: { issueId: string }) {
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [tab, setTab] = useState<RecipientFilter | ''>('')
  const [page, setPage] = useState(0)
  const [data, setData] = useState<{ rows: RecipientRow[]; total: number; size: number } | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    const t = setTimeout(() => { setTerm(q.trim()); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [q])

  const qs = `q=${encodeURIComponent(term)}&f=${tab}`
  useEffect(() => {
    let live = true
    fetch(`/api/admin/gilyonot/issues/${issueId}/recipients?${qs}&page=${page}`, { cache: 'no-store' })
      .then(async res => {
        const j = await res.json().catch(() => ({}))
        if (!live) return
        if (res.ok) { setData(j); setErr('') } else setErr(j.error || 'החיפוש נכשל')
      })
      .catch(() => { if (live) setErr('החיפוש נכשל') })
    return () => { live = false }
  }, [issueId, qs, page])

  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1

  return (
    <>
      <div className={s.mtools}>
        <input className={s.search} value={q} onChange={e => setQ(e.target.value)} placeholder="מייל או חלק ממנו" aria-label="חיפוש נמען לפי מייל" dir="ltr" autoFocus />
        <div className={s.tabs} role="tablist" aria-label="סינון נמענים">
          {TABS.map(([k, l]) => (
            <button key={k || 'all'} type="button" role="tab" aria-selected={tab === k} className={tab === k ? s.on : undefined} onClick={() => { setTab(k); setPage(0) }}>{l}</button>
          ))}
        </div>
      </div>
      <p className={s.hint} aria-live="polite">
        {err ? <span className={s.bad}>{err}</span> : data ? <>נמצאו <b className={s.num}>{f(data.total)}</b> נמענים{term ? <> שהמייל שלהם מכיל <b dir="ltr">{term}</b></> : null}</> : 'מחפש...'}
        {' · '}<a className={s.csv} href={`/api/admin/gilyonot/issues/${issueId}/recipients?${qs}&csv=1`}><Download size={13} aria-hidden />ייצוא לאקסל</a>
      </p>
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead><tr><th>נמען ומה קרה</th><th>נשלח</th><th>נמסר</th><th>נפתח</th><th>הקליק</th><th>הוריד</th></tr></thead>
          <tbody>
            {data?.rows.map(r => {
              const sum = recipientSummary(r, when)
              return (
                <tr key={r.email}>
                  <td><div dir="ltr" className={s.mail}>{r.email}</div><div className={`${s.state} ${s[sum.tone]}`}>{sum.text}</div></td>
                  <td className={s.num}><When at={r.sent_at} /></td>
                  <td className={s.num}><When at={r.delivered_at} /></td>
                  <td className={s.num}><When at={r.opened_at} n={r.open_count} /></td>
                  <td className={s.num}><When at={r.clicked_at} n={r.click_count} /></td>
                  <td className={s.num}><When at={r.downloaded_at} n={r.download_count} /></td>
                </tr>
              )
            })}
            {data && !data.rows.length && <tr><td colSpan={6} className={s.empty}>לא נמצא נמען כזה בגיליון הזה</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className={s.pager}>
          <button type="button" onClick={() => setPage(p => p - 1)} disabled={page === 0}>הקודם</button>
          <span className={s.num}>עמוד {page + 1} מתוך {f(pages)}</span>
          <button type="button" onClick={() => setPage(p => p + 1)} disabled={page + 1 >= pages}>הבא</button>
        </div>
      )}
      <p className={s.hint}>&quot;נמסר&quot; מגיע מ-Resend, ולכן מופיע רק במשלוחים מאז שהופעל ה-Webhook. &quot;נפתח&quot; נספר לפי תמונת מעקב: מי שחוסם תמונות נספר רק כשהוא מקליק או מוריד.</p>
    </>
  )
}
