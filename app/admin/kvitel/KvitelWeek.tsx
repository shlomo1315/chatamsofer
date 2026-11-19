'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
  const [fmt, setFmt] = useState<'pdf' | 'docx'>('pdf')
  const [cardIdx, setCardIdx] = useState<number | null>(null)
  const [previewRow, setPreviewRow] = useState<KvitelRequestRow | null>(null)

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

  // סגירת השבוע: קודם הורדה, ורק אם הצליחה — סימון "נשלח לציון" של אותן בקשות בדיוק
  async function closeWeek() {
    const ids = file.ids
    if (!(await download(fmt))) return
    setClosing(false)
    if (await setStatus(ids, 'done')) setMsg({ text: `הקובץ ירד, ו־${ids.length} בקשות סומנו "נשלח לציון".` })
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
              <button type="button" className={cx(s.btn, s.pri)} disabled={!canEdit || busy || !file.ids.length || !isCurrent} onClick={() => setClosing(true)}>
                <Ico icon={Download} />סגירת השבוע: הורדה וסימון כנשלח
              </button>
            </div>
            <p className={s.sheetnote}>
              {isCurrent
                ? 'רק מה שירד בפועל יסומן "נשלח לציון". מה שייכנס אחרי הסגירה עובר לשבוע הבא.'
                : `הסגירה נעשית בשבוע של ${current.parsha}.`}
            </p>
            {msg && <p role={msg.err ? 'alert' : 'status'} className={cx(s.msg, msg.err && s.err)}>{msg.text}</p>}
          </div>
        </div>
      </div>

      {closing && (
        <div className={s.ov} role="dialog" aria-modal="true" aria-labelledby="kvitel-close-t" onClick={e => { if (e.target === e.currentTarget && !busy) setClosing(false) }}>
          <div className={s.modal}>
            <h3 id="kvitel-close-t">סגירת הקוויטל של {current.parsha}</h3>
            <p className={s.mSub}>{fileStats}</p>
            <ol className={s.mstep}>
              <li className={s.done}><span className={s.ic}><Check size={14} strokeWidth={3} aria-hidden /></span><div><b>הקובץ נבנה</b><span>כולל הלוגו והכותרת של {current.label}</span></div></li>
              <li className={s.cur}><span className={s.ic}>2</span><div><b>הורדה</b><span>באיזה פורמט?</span>
                <div className={s.fmt}>
                  <label><input type="radio" name="kvitel-fmt" checked={fmt === 'pdf'} onChange={() => setFmt('pdf')} /> PDF</label>
                  <label><input type="radio" name="kvitel-fmt" checked={fmt === 'docx'} onChange={() => setFmt('docx')} /> Word</label>
                </div></div></li>
              <li><span className={s.ic}>3</span><div><b>סימון &quot;נשלח לציון&quot;</b><span>רק ה־{file.ids.length} שבקובץ, ורק אחרי שההורדה הצליחה</span></div></li>
            </ol>
            <div className={s.guard}><Check className={s.i} size={16} strokeWidth={1.8} style={{ width: 16 }} aria-hidden />אם ההורדה נכשלת, שום דבר לא מסומן ואפשר לנסות שוב.</div>
            {msg?.err && <p role="alert" className={cx(s.msg, s.err)}>{msg.text}</p>}
            <div className={s.macts}>
              <button type="button" className={cx(s.btn, s.pri)} disabled={busy} onClick={() => void closeWeek()}>{busy ? 'מוריד…' : 'הורדה וסימון'}</button>
              <button type="button" className={s.btn} disabled={busy} onClick={() => setClosing(false)}>ביטול</button>
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
