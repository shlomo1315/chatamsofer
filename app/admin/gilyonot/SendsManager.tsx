'use client'

// ניהול שליחות: תזמון (קביעה, שינוי וביטול), טבלת כל השליחות והקלקות לפי קישור.
// נתונים: /api/admin/gilyonot/issues/[id]/{schedule,links} · השליחה בפועל ב-lib/gilyonotSender.ts

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Loader2, MousePointerClick } from 'lucide-react'
import { Badge, btnDanger, btnPrimary, Card, CardHeader, input, Notice, type Tone } from './ui'
import type { IssueView } from './GilyonotClient'

const num = (n: number) => n.toLocaleString('he-IL')
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 1000) / 10}%` : '–')
const fmt = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '–'

/** ערך ל-input מסוג datetime-local (שעון מקומי של הדפדפן). */
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || 'הפעולה נכשלה')
  return d
}

/** קביעה או שינוי של זמן שליחה. בטיוטה: כפתור "תזמון"; במתוזמן: שינוי וביטול. */
export function SchedulePanel({ issue, listIds, canEdit }: { issue: IssueView; listIds: string[]; canEdit: boolean }) {
  const router = useRouter()
  const scheduled = issue.status === 'scheduled'
  const [at, setAt] = useState(() => toLocalInput(issue.scheduled_at ? new Date(issue.scheduled_at) : new Date(Date.now() + 24 * 3600 * 1000)))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const base = `/api/admin/gilyonot/issues/${issue.id}/schedule`

  async function run(fn: () => Promise<string>) {
    setBusy(true); setMsg(null)
    try { setMsg({ ok: true, text: await fn() }); router.refresh() }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : 'הפעולה נכשלה' }) }
    finally { setBusy(false) }
  }
  const save = () => run(async () => {
    const d = await call(base, 'POST', { at: new Date(at).toISOString(), listIds })
    return `השליחה תתחיל ב-${fmt(d.scheduled_at)} (לא בשבת ובחג)`
  })
  const cancel = () => {
    if (!confirm('לבטל את השליחה המתוזמנת? הגיליון יחזור להיות טיוטה.')) return
    run(async () => { await call(base, 'DELETE'); return 'התזמון בוטל, הגיליון חזר לטיוטה' })
  }

  return (
    <div className="rounded-xl p-4 ring-1 ring-inset ring-slate-900/10">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><CalendarClock className="h-4 w-4 text-[#2563eb]" aria-hidden />{scheduled ? 'שליחה מתוזמנת' : 'או: תזמון לשעה עתידית'}</h3>
      {scheduled && <p className="mt-1 text-sm text-slate-700">יוצא לדרך ב-<b>{fmt(issue.scheduled_at)}</b>. עד אז אפשר לשנות את הזמן או לבטל.</p>}
      {!scheduled && issue.schedule_error && <p className="mt-1 text-sm font-medium text-rose-700">{issue.schedule_error}</p>}
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-xs text-slate-500">תאריך ושעה
            <input type="datetime-local" className={`${input} mt-1`} value={at} onChange={e => setAt(e.target.value)} />
          </label>
          <button type="button" disabled={busy || !at} className={btnPrimary} onClick={save}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarClock className="h-4 w-4" aria-hidden />}{scheduled ? 'עדכון זמן' : 'תזמון'}
          </button>
          {scheduled && <button type="button" disabled={busy} className={btnDanger} onClick={cancel}>ביטול התזמון</button>}
        </div>
      )}
      {!scheduled && <p className="mt-2 text-xs text-slate-500">הנמענים נקבעים ברשימות שנבחרו למעלה, ומתעדכנים לפי הרשימה ברגע השליחה.</p>}
      <div className="mt-2"><Notice msg={msg} /></div>
    </div>
  )
}

/** הקלקות לפי קישור בגיליון אחד. */
export function LinkClicks({ issueId }: { issueId: string }) {
  const [rows, setRows] = useState<{ link: string; clicks: number; unique: number }[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    fetch(`/api/admin/gilyonot/issues/${issueId}/links`).then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!live) return; if (ok) setRows(d.links); else setErr(d.error || 'הטעינה נכשלה') })
      .catch(() => live && setErr('הטעינה נכשלה'))
    return () => { live = false }
  }, [issueId])

  return (
    <div className="px-5 pb-1">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><MousePointerClick className="h-4 w-4 text-[#2563eb]" aria-hidden />הקלקות לפי קישור</h3>
      {err ? <p className="mt-2 text-sm text-rose-700">{err}</p>
        : !rows ? <p className="mt-2 text-sm text-slate-500">טוען...</p>
        : !rows.length ? <p className="mt-2 text-sm text-slate-500">עוד אין הקלקות.</p>
        : (
          <div className="mt-2 rounded-xl ring-1 ring-inset ring-slate-900/[0.06]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="p-2.5 text-start font-medium">קישור</th><th className="p-2.5 text-start font-medium">הקלקות</th><th className="p-2.5 text-start font-medium">מקליקים ייחודיים</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(r => (
                  <tr key={r.link}><td className="max-w-[10rem] truncate p-2.5 sm:max-w-[28rem] text-slate-700" dir="ltr" title={r.link}>{r.link}</td><td className="p-2.5 font-medium">{num(r.clicks)}</td><td className="p-2.5">{num(r.unique)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}

const HEADS = ['פרשה', 'מצב', 'זמן', 'נמענים', 'נמסרו', 'לא תקינים', 'פתחו', 'הקליקו', 'הורידו', 'הסירו']
// בנייד נשארות העמודות החשובות; השאר מופיעות מרוחב גדול יותר
const COL = ['', '', 'hidden sm:table-cell', 'hidden sm:table-cell', 'hidden xl:table-cell', '', 'hidden md:table-cell', 'hidden md:table-cell', 'hidden lg:table-cell', 'hidden xl:table-cell']

const TONE: Record<IssueView['status'], { label: string; tone: Tone }> = {
  draft: { label: 'טיוטה', tone: 'amber' },
  scheduled: { label: 'מתוזמן', tone: 'navy' },
  sending: { label: 'בשליחה', tone: 'sky' },
  sent: { label: 'נשלח', tone: 'green' },
}

/** לשונית "שליחות": כל הגיליונות שנשלחו או מתוזמנים, עם המספרים, והקלקות לפי קישור לפי בחירה. */
export function SendsManager({ rows }: { rows: IssueView[] }) {
  const list = rows.filter(r => r.status !== 'draft')
    .sort((a, b) => (b.scheduled_at ?? b.started_at ?? b.created_at).localeCompare(a.scheduled_at ?? a.started_at ?? a.created_at))
  const [openId, setOpenId] = useState<string | null>(null)
  if (!list.length) return <Card><div className="p-8 text-center text-sm text-slate-500">עוד לא נשלח או תוזמן אף גיליון.</div></Card>

  return (
    <Card className="overflow-hidden">
      <CardHeader title="כל השליחות" hint="לחצו על שורה לפירוט ההקלקות לפי קישור" />
      <div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>{HEADS.map((h, i) => <th key={h} className={`p-2.5 text-start font-medium ${COL[i]}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map(r => {
              const total = r.total_count ?? 0
              const bad = r.bounced_count + r.failed_count
              return (
                <FragmentRow key={r.id} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} id={r.id}
                  cells={[
                    <b key="p">{r.parasha}</b>,
                    <Badge key="s" tone={TONE[r.status].tone} dot>{TONE[r.status].label}</Badge>,
                    fmt(r.status === 'scheduled' ? r.scheduled_at : r.started_at),
                    total ? num(total) : '–',
                    total ? `${num(r.delivered_count)} (${pct(r.delivered_count, total)})` : '–',
                    bad ? <span key="b" className="font-medium text-rose-700">{num(bad)}</span> : '0',
                    total ? `${num(r.opened_count)} (${pct(r.opened_count, total)})` : '–',
                    total ? `${num(r.clicked_count)} (${pct(r.clicked_count, total)})` : '–',
                    total ? `${num(r.downloaded_count)} (${pct(r.downloaded_count, total)})` : '–',
                    num(r.unsubscribed_count),
                  ]} />
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function FragmentRow({ cells, open, onToggle, id }: { cells: React.ReactNode[]; open: boolean; onToggle: () => void; id: string }) {
  return (
    <>
      <tr className="cursor-pointer hover:bg-slate-50" onClick={onToggle} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }} aria-expanded={open}>
        {cells.map((c, i) => <td key={i} className={`p-2.5 ${COL[i]}`}>{c}</td>)}
      </tr>
      {open && <tr><td colSpan={cells.length} className="bg-slate-50/60 py-3"><LinkClicks issueId={id} /></td></tr>}
    </>
  )
}

