'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { kvitelCloseFlow, type KvitelFormat } from '@/lib/kvitelCloseFlow'
import { CalendarDays, Check, Download, Landmark, Link2, Mail, Phone, type LucideIcon } from 'lucide-react'
import type { KvitelChannel, KvitelStatus } from '@/lib/kvitel'
import { KVITEL_CHANNELS, KVITEL_STATUSES } from '@/lib/kvitel'
import { israelDay, kvitelRequestLines, type KvitelRequestRow } from '@/lib/kvitelQuery'
import { reviewReason } from '@/lib/kvitelView'
import {
  closeLabel, hoursToClose, kvitelFile, recentWeeks, sentLabel, weekIntake, weekSent, maskPhone, whenLabel,
} from '@/lib/kvitelWeek'
import { downloadKvitel, KvitelLogo } from './KvitelPreview'
import KvitelCardModal from './KvitelCardModal'
import KvitelPreview from './KvitelPreview'
import s from './KvitelWeek.module.css'

// מסך "השבוע" — כיוון א׳ מהעיצוב המאושר של ארי. כל המספרים מהבקשות האמיתיות:
// "צריך עין" = בקשות "לבדיקה" (לא נכנסות לקובץ עד שמאשרים), "בקובץ" = מה שירד בסגירה (רק "לא נשלח" עם שמות).
// הסגירה מורידה את הקובץ, ורק אם ההורדה הצליחה מסמנת "נשלח לציון" את אותן בקשות בדיוק.

const PRINT_FILE = '/api/admin/kvitel/print-file'
const BATCHES = '/api/admin/kvitel/batches'

interface KvitelBatch { id: string; closed_at: string; closed_by_name: string | null; parsha: string | null; request_count: number; name_count: number }
type BatchList = { list: KvitelBatch[]; missing: boolean; err?: boolean }

async function fetchBatches(): Promise<BatchList> {
  const res = await fetch(BATCHES, { cache: 'no-store' }).catch(() => null)
  const data = res?.ok ? await res.json().catch(() => null) : null
  return data ? { list: data.batches ?? [], missing: !!data.missing } : { list: [], missing: false, err: true }
}
const SHEET_LINES = 13     // השורות שנראות בדף לפני הקיפול, כמו בעיצוב
const MAX_CARDS = 4

const CHANNEL_ICON: Record<KvitelChannel, LucideIcon> = { web: Link2, nedarim: Landmark, phone: Phone, email: Mail }
const Ico = ({ icon: I }: { icon: LucideIcon }) => <I className={s.i} size={18} strokeWidth={1.8} aria-hidden />
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ')

export default function KvitelWeek({ rows, canEdit, tabs, onReload, onOpenList }: {
  rows: KvitelRequestRow[]          // כפי שהגיעו מהשרת, כולל "לבדיקה" ו"נשלח"
  canEdit: boolean
  tabs?: ReactNode
  onReload: () => Promise<void>
  onOpenList: () => void
}) {
  const [now] = useState(() => Date.now())
  const weeks = useMemo(() => recentWeeks(israelDay(new Date(now).toISOString())), [now])
  const current = weeks[weeks.length - 1]
  const [weekIdx, setWeekIdx] = useState(weeks.length - 1)
  const w = weeks[weekIdx]
  const isCurrent = weekIdx === weeks.length - 1

  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null)
  const [closing, setClosing] = useState(false)
  const [cardIdx, setCardIdx] = useState<number | null>(null)
  const [previewRow, setPreviewRow] = useState<KvitelRequestRow | null>(null)
  const [batches, setBatches] = useState<BatchList | null>(null)

  const review = useMemo(() => rows.filter(r => r.status === 'review')
    .sort((a, b) => Date.parse(b.submitted_at) - Date.parse(a.submitted_at)), [rows])
  // לכרטיס הבקשה — כמו ברשימה: "לבדיקה" מוצג כ"לא נשלח" עם אישור
  const reviewCards = useMemo(() => review.map(r => ({ ...r, status: 'pending' as const, needsReview: true })), [review])
  const file = useMemo(() => kvitelFile(rows), [rows])
  const intake = useMemo(() => weekIntake(rows, w), [rows, w])
  const sent = useMemo(() => weekSent(rows, w), [rows, w])
  const prevSent = useMemo(() => (weekIdx > 0 ? weekSent(rows, weeks[weekIdx - 1]) : null), [rows, weeks, weekIdx])
  const maxChan = Math.max(1, ...intake.byChannel.map(c => c.n))
  const hours = hoursToClose(w, now)

  async function setStatus(ids: string[], status: KvitelStatus): Promise<boolean> {
    if (!ids.length) return false
    setBusy(true)
    setMsg(null)
    try {
      const res = await fetch('/api/admin/kvitel/requests', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ text: data.error || 'העדכון נכשל', err: true }); return false }
      setMsg({ text: `עודכנו ${data.updated} בקשות ל"${KVITEL_STATUSES[status]}"` })
      await onReload()
      return true
    } finally {
      setBusy(false)
    }
  }

  async function download(format: 'pdf' | 'docx') {
    setBusy(true)
    setMsg(null)
    const err = await downloadKvitel(PRINT_FILE, file.ids, format)
    if (err) setMsg({ text: err, err: true })
    setBusy(false)
    return !err
  }

  const loadBatches = () => fetchBatches().then(setBatches)
  useEffect(() => { void fetchBatches().then(setBatches) }, [])

  // רישום המנה וסימון "נשלח לציון" — רק מתוך האישור בחלון, עם הבקשות שירדו בפועל
  async function recordBatch(ids: string[]): Promise<boolean> {
    const res = await fetch(BATCHES, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, parsha: current.parsha }),
    }).catch(() => null)
    const data = await res?.json().catch(() => ({})) ?? {}
    if (!res?.ok) { setMsg({ text: data.error || 'הסימון נכשל. אפשר ללחוץ שוב על האישור.', err: true }); return false }
    setClosing(false)
    setMsg(data.recorded
      ? { text: `המנה נרשמה, ו־${data.updated} בקשות סומנו שנשלחו לציון הקדוש.` }
      : { text: `${data.updated} בקשות סומנו שנשלחו לציון הקדוש, אבל המנה לא נרשמה: טבלת המנות עוד לא נוצרה במסד.`, err: true })
    await Promise.all([onReload(), loadBatches()])
    return true
  }

  // החלון: שתי הורדות (PDF ו-Word) שלא מסמנות כלום, ואחריהן שאלת אישור — ראו lib/kvitelCloseFlow
  const flowRef = useRef<ReturnType<typeof kvitelCloseFlow> | null>(null)
  const [got, setGot] = useState<KvitelFormat[]>([])
  const [marked, setMarked] = useState(0)
  function openClose() {
    flowRef.current = kvitelCloseFlow({ download: (ids, f) => downloadKvitel(PRINT_FILE, ids, f), record: recordBatch })
    setGot([])
    setMarked(0)
    setMsg(null)
    setClosing(true)
  }
  async function closeDownload(format: KvitelFormat) {
    const flow = flowRef.current
    if (!flow) return
    setBusy(true)
    setMsg(null)
    const err = await flow.download(file.ids, format)
    if (err) setMsg({ text: err, err: true })
    else { setGot(g => (g.includes(format) ? g : [...g, format])); setMarked(flow.downloadedIds.length) }
    setBusy(false)
  }
  async function confirmClose() {
    const flow = flowRef.current
    if (!flow) return
    setBusy(true)
    setMsg(null)
    try { await flow.confirm() } finally { setBusy(false) }
  }

  async function redownload(id: string, format: 'pdf' | 'docx') {
    setBusy(true)
    setMsg(null)
    const err = await downloadKvitel(`${BATCHES}/${id}/file`, [], format)
    if (err) setMsg({ text: err, err: true })
    setBusy(false)
  }

  useEffect(() => {
    if (!closing) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) setClosing(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closing, busy])

  const shown = file.lines.slice(0, SHEET_LINES)
  const fileStats = <><span className={s.num}>{file.ids.length}</span> בקשות · <span className={s.num}>{file.lines.length}</span> שמות · <span className={s.num}>{file.pages}</span> עמודי A4</>

  return (
    <div className={cx(s.root, 'space-y-6')}>
      {tabs}
      <div>
        <div className={s.head}>
          <div>
            <p className={s.crumb}>מחלקות / קוויטלאך</p>
            <h1 className={s.h1}>הקוויטל של {w.parsha}</h1>
            <p className={s.aClose}>
              <Ico icon={CalendarDays} />{w.label} · <b>נסגר {closeLabel(w)}</b>
              {hours !== null && <> · עוד <span className={s.num}>{hours}</span> שעות</>}
            </p>
          </div>
          <div className={s.wk} role="group" aria-label="שבוע">
            {weeks.map((x, i) => (
              <button key={x.shabbat} type="button" className={cx(i === weekIdx && s.on)} aria-current={i === weekIdx || undefined}
                onClick={() => setWeekIdx(i)}>{x.parsha}</button>
            ))}
          </div>
        </div>

        <div className={s.pipe}>
          <div>
            <p className={s.k}>נכנסו השבוע</p>
            <p className={cx(s.v, s.num)}>{intake.total}</p>
            <div className={s.chan}>
              {intake.byChannel.map(c => (
                <div key={c.channel}><span>{c.label}</span><i style={{ width: `${Math.round((c.n / maxChan) * 100)}%` }} /><span className={s.num}>{c.n}</span></div>
              ))}
            </div>
          </div>
          <div className={s.warn}>
            <p className={s.k}><span className={s.dot} style={{ color: 'var(--warn)' }} />צריך עין</p>
            <p className={cx(s.v, s.num)}>{review.length}</p>
            <p className={s.d}>לא ייכנסו לקובץ לפני שמישהו יאשר</p>
          </div>
          <div className={s.hot}>
            <p className={s.k}><span className={s.dot} style={{ color: 'var(--info)' }} />בקובץ</p>
            <p className={cx(s.v, s.num)}>{file.ids.length} <span style={{ fontSize: 'var(--t-lg)', fontWeight: 700, color: 'var(--ink-2)' }}>בקשות</span></p>
            <p className={s.d}><b className={s.num}>{file.lines.length}</b> שמות · <span className={s.num}>{file.pages}</span> עמודי A4</p>
          </div>
          <div>
            <p className={s.k}><span className={s.dot} style={{ color: 'var(--ok)' }} />נשלח לציון</p>
            {sent.count
              ? <>
                  <p className={cx(s.v, s.num)}>{sent.count} <span style={{ fontSize: 'var(--t-lg)', fontWeight: 700, color: 'var(--ink-2)' }}>בקשות</span></p>
                  <p className={s.d}>נשלחו {sentLabel(sent.at!)}</p>
                </>
              : <>
                  <p className={s.v} style={{ fontSize: 'var(--t-xl)', marginTop: 'var(--s4)' }}>עוד לא</p>
                  {prevSent?.count ? <p className={s.d}>{weeks[weekIdx - 1].parsha}: {prevSent.count} בקשות, נשלחו {sentLabel(prevSent.at!)}</p> : null}
                </>}
          </div>
        </div>

        <div className={s.aGrid}>
          <div>
            <div className={s.secH}><h2>צריך יד אדם</h2><p>כל ההחלטות במקום אחד, מכל הערוצים</p></div>
            <ul className={s.dec}>
              {reviewCards.slice(0, MAX_CARDS).map((r, i) => {
                const names = kvitelRequestLines(r)
                const recording = r.channel === 'phone' && !!r.recording_url
                return (
                  <li key={r.id} className={s.card}>
                    <div className={s.top}>
                      <span className={s.ch}><Ico icon={CHANNEL_ICON[r.channel]} />{KVITEL_CHANNELS[r.channel]}</span>
                      {r.channel === 'email' && r.contact_email
                        ? <span className={s.ltr}>{r.contact_email}</span>
                        : r.contact_phone ? <span className={cx(s.ltr, s.num)}>{maskPhone(r.contact_phone)}</span> : null}
                      <span>· {whenLabel(r.submitted_at, now)}</span>
                      <span className={cx(s.chip, s.warn)}>{recording ? 'הקלטה' : reviewReason(r) ?? 'לבדיקה'}</span>
                    </div>
                    {recording
                      ? <div className={s.transc}><span>תמלול אוטומטי, {names.length} שמות:</span>{names.map((n, j) => <b key={j}>{n.replace(' - ', ' · ')}</b>)}</div>
                      : <>
                          <p className={s.line}>{names[0]?.replace(' - ', ' · ') ?? 'לא נקלטו שמות'}</p>
                          {names.length > 1 && <p className={s.why}>ועוד {names.length - 1} שמות בבקשה</p>}
                        </>}
                    {canEdit && (
                      <div className={s.act}>
                        {names.length > 0 && (
                          <button type="button" className={cx(s.btn, s.sm, s.ok)} disabled={busy} onClick={() => void setStatus([r.id], 'pending')}>
                            {names.length === 1 ? 'אישור השם' : `אישור ${names.length} השמות`}
                          </button>
                        )}
                        <button type="button" className={cx(s.btn, s.sm)} onClick={() => setCardIdx(i)}>תיקון</button>
                      </div>
                    )}
                  </li>
                )
              })}
              {!review.length && <li className={cx(s.card, s.allClear)}><b>הכול נבדק</b><p>הקובץ של {current.parsha} מוכן לסגירה.</p></li>}
            </ul>
            <p className={s.sheetnote} style={{ textAlign: 'start', marginTop: 'var(--s3)' }}>
              {review.length > MAX_CARDS && <>ועוד {review.length - MAX_CARDS} · </>}
              <button type="button" className={s.link} onClick={onOpenList}>{review.length > MAX_CARDS ? `פתיחת כל ה־${review.length}` : 'כל הבקשות'}</button>
            </p>
          </div>

          <div className={s.sheetwrap}>
            <div className={s.sheetbar}>
              <span className={cx(s.chip, s.gold)}><span className={s.dot} />הקובץ נבנה תוך כדי</span>
              {file.pages > 0 && <span className={cx(s.pg, s.num)}>עמוד 1 מתוך {file.pages}</span>}
              <span className={s.sp} />
              <button type="button" className={cx(s.btn, s.sm, s.ghost)} disabled={busy || !file.ids.length} onClick={() => void download('docx')}>Word</button>
              <button type="button" className={cx(s.btn, s.sm, s.ghost)} disabled={busy || !file.ids.length} onClick={() => void download('pdf')}>PDF</button>
            </div>
            <div className={s.paper} aria-label="תצוגה של הקוויטל">
              <div className={s.ph}>
                <div className={s.tt}><div className={s.a}>קויטל לציון רבינו הקדוש</div><div className={s.b}>מרנא ורבנא בעל החתם סופר זיע&quot;א</div><div className={s.c}>[{current.label.replace(/״/g, '"')}]</div></div>
                <KvitelLogo />
              </div>
              <div className={s.dbl} />
              <div className={s.lt}>רשימת שמות ובקשות לתפילה</div>
              {shown.length
                ? <ol>{shown.map((l, i) => <li key={i}>{l}</li>)}</ol>
                : <p className={s.empty}>אין עדיין שמות בקובץ</p>}
              {file.lines.length > SHEET_LINES && (
                <div className={s.fold}>ועוד {file.lines.length - SHEET_LINES} שמות ב־{Math.max(1, file.pages - 1)} עמודים</div>
              )}
            </div>
            <div className={s.sheetfoot}>
              <button type="button" className={cx(s.btn, s.pri)} disabled={!canEdit || busy || !file.ids.length || !isCurrent} onClick={openClose}>
                <Ico icon={Download} />הורדת הקויטלאך וסימון שנשלח לציון הקדוש
              </button>
            </div>
            <p className={s.sheetnote}>
              {isCurrent
                ? 'הסימון רק אחרי אישור, ורק למה שירד בפועל. מה שייכנס אחרי הסגירה עובר לשבוע הבא.'
                : `הסגירה נעשית בשבוע של ${current.parsha}.`}
            </p>
            {msg && <p role={msg.err ? 'alert' : 'status'} className={cx(s.msg, msg.err && s.err)}>{msg.text}</p>}
          </div>
        </div>
      </div>

      <section aria-labelledby="kvitel-batches-t">
        <div className={s.secH}><h2 id="kvitel-batches-t">מנות קודמות</h2><p>כל סגירה נרשמת, ואפשר להוריד שוב את הקובץ בדיוק כפי שנשלח</p></div>
        {!batches
          ? <p className={s.sheetnote} style={{ textAlign: 'start' }}>טוען…</p>
          : batches.missing
            ? <p className={cx(s.msg, s.err)}>טבלת המנות עוד לא נוצרה במסד, ולכן סגירות לא נרשמות עדיין.</p>
            : batches.err
              ? <p className={cx(s.msg, s.err)}>טעינת המנות נכשלה.</p>
              : !batches.list.length
                ? <p className={s.sheetnote} style={{ textAlign: 'start' }}>עוד לא נסגרה מנה. המנה הראשונה תופיע כאן אחרי הסגירה.</p>
                : <ul className={s.batches}>
                    {batches.list.map(b => (
                      <li key={b.id} className={s.batch}>
                        <div className={s.bWhen}><b>{b.parsha ?? 'מנה'}</b><span>נסגרה {sentLabel(b.closed_at)}</span></div>
                        <p className={s.bCount}><span className={s.num}>{b.request_count}</span> בקשות · <span className={s.num}>{b.name_count}</span> שמות</p>
                        <p className={s.bWho}>סימן: {b.closed_by_name ? <span className={s.ltr}>{b.closed_by_name}</span> : 'לא ידוע'}</p>
                        <div className={s.bAct}>
                          <button type="button" className={cx(s.btn, s.sm, s.ghost)} disabled={busy} onClick={() => void redownload(b.id, 'docx')}>Word</button>
                          <button type="button" className={cx(s.btn, s.sm, s.ghost)} disabled={busy} onClick={() => void redownload(b.id, 'pdf')}>PDF</button>
                        </div>
                      </li>
                    ))}
                  </ul>}
      </section>

      {closing && (
        <div className={s.ov} role="dialog" aria-modal="true" aria-labelledby="kvitel-close-t" onClick={e => { if (e.target === e.currentTarget && !busy) setClosing(false) }}>
          <div className={s.modal}>
            <h3 id="kvitel-close-t">הורדת הקויטלאך וסימון שנשלח לציון הקדוש</h3>
            <p className={s.mSub}>{current.parsha} · {fileStats}</p>
            <ol className={s.mstep}>
              <li className={s.done}><span className={s.ic}><Check size={14} strokeWidth={3} aria-hidden /></span><div><b>הקובץ נבנה</b><span>כולל הלוגו והכותרת של {current.label}</span></div></li>
              <li className={got.length ? s.done : s.cur}><span className={s.ic}>{got.length ? <Check size={14} strokeWidth={3} aria-hidden /> : 2}</span><div><b>הורדה</b><span>אפשר להוריד את שני הקבצים. ההורדה לא מסמנת כלום.</span>
                <div className={s.fmt}>
                  {(['pdf', 'docx'] as const).map(f => (
                    <button key={f} type="button" className={cx(s.btn, s.sm, got.includes(f) && s.ghost)} disabled={busy} onClick={() => void closeDownload(f)}>
                      {got.includes(f) ? <Check size={14} strokeWidth={3} aria-hidden /> : <Download size={14} strokeWidth={2} aria-hidden />}
                      הורדת {f === 'pdf' ? 'PDF' : 'Word'}
                    </button>
                  ))}
                </div></div></li>
              <li className={got.length ? s.cur : undefined}><span className={s.ic}>3</span><div><b>סימון שנשלח לציון הקדוש</b>
                {got.length
                  ? <><span>לסמן את כולם (<span className={s.num}>{marked}</span> בקשות) כנשלחו לציון הקדוש?</span>
                      <div className={s.fmt}>
                        <button type="button" className={cx(s.btn, s.pri)} disabled={busy} onClick={() => void confirmClose()}>{busy ? 'מסמן…' : 'לאישור לחץ כאן'}</button>
                      </div></>
                  : <span>השאלה תופיע אחרי שאחד הקבצים ירד</span>}
              </div></li>
            </ol>
            <div className={s.guard}><Check className={s.i} size={16} strokeWidth={1.8} style={{ width: 16 }} aria-hidden />בלי לחיצה על האישור שום בקשה לא מסומנת. הסימון חל רק על הבקשות שבקובץ שירד.</div>
            {msg?.err && <p role="alert" className={cx(s.msg, s.err)}>{msg.text}</p>}
            <div className={s.macts}>
              <button type="button" className={s.btn} disabled={busy} onClick={() => setClosing(false)}>{got.length ? 'סגירה בלי סימון' : 'ביטול'}</button>
            </div>
          </div>
        </div>
      )}

      {cardIdx !== null && reviewCards[cardIdx] && (
        <KvitelCardModal rows={reviewCards} index={cardIdx} onIndex={setCardIdx} onClose={() => setCardIdx(null)} startEditing
          canEdit={canEdit} busy={busy} setStatus={(ids, st) => void setStatus(ids, st)} onPreview={setPreviewRow}
          onSaved={m => { setMsg({ text: m }); void onReload() }} />
      )}
      <KvitelPreview open={!!previewRow} onClose={() => setPreviewRow(null)} lines={previewRow ? kvitelRequestLines(previewRow) : []}
        downloadHref="/api/admin/kvitel/export?status=all" downloadIds={previewRow ? [previewRow.id] : []} />
    </div>
  )
}
