'use client'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, X, Send, RotateCcw, UserRound, Check, Loader2 } from 'lucide-react'
import FormatToolbar from '@/components/newsletter/FormatToolbar'
import { NAME_TOKEN, requestErrorMessage, type LineageFaultTemplate } from '@/lib/lineageFaultNotice'

// הודעה מרוכזת לכל המשפחות בבדיקה מעמיקה: "התגלתה תקלה בסדר הדורות".
// הפתיחה מריצה תצוגה מקדימה בלבד (כמה ייכנסו, מי בלי מייל, המייל המלא),
// והשליחה יוצאת רק אחרי לחיצה נוספת על "שלח".
//
// כל הנוסח ניתן לעריכה (אותו סרגל עיצוב כמו בעורך הניוזלטר והגיליונות),
// התצוגה מתעדכנת בזמן ההקלדה, והנוסח נשמר אוטומטית. השרת שולח רק את הנוסח
// השמור, ולכן כפתור השליחה נעול עד שהשמירה הסתיימה.
type Person = { id: string; name: string; email: string | null }
//
// סבב חוזר (תזכורת): נשלח גם למי שקיבל בימים קודמים ועדיין בבדיקה מעמיקה.
// נחסם רק מי שקיבל היום. בשני הסבבים לא מקבל מי שסדר הדורות שלו תקין עכשיו
// (chainOk), ומי שבבדיקה מעמיקה מסיבה שהמזכירות הקלידה (otherReason).
type Preview = {
  total: number; toSend: number; alreadySent: number; resend?: boolean
  noEmail: Person[]; noLineage: Person[]; otherReason?: Person[]; chainOk?: Person[]
  from: string; sample: { to: string | null; name: string; subject: string; html: string }
  template: LineageFaultTemplate; defaultTemplate: LineageFaultTemplate
}
type Failure = { name: string; email: string; error: string }
type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

const API = '/api/admin/beneficiaries/lineage-fault-notice'
const input = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100'
const label = 'block text-xs font-bold text-slate-600 mb-1'

const NAME_CHIP = `<span data-name-token="1" contenteditable="false" class="mx-0.5 rounded bg-indigo-100 px-1.5 text-indigo-700">${NAME_TOKEN}</span>`
const toEditorHtml = (html: string) => html.split(NAME_TOKEN).join(NAME_CHIP)
const fromEditorHtml = (html: string) => html.replace(/<span[^>]*data-name-token[^>]*>[\s\S]*?<\/span>/g, NAME_TOKEN)

async function post(payload: object) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    .catch(() => { throw new Error(requestErrorMessage(0, null)) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(requestErrorMessage(r.status, d))
  return d
}

export default function BulkLineageFaultButton() {
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState<number | null>(null)
  const [failed, setFailed] = useState<Failure[]>([])
  const [resend, setResend] = useState(false)

  const [tpl, setTpl] = useState<LineageFaultTemplate | null>(null)
  const [mail, setMail] = useState<{ subject: string; html: string } | null>(null)
  const [save, setSave] = useState<SaveState>('saved')
  const bodyRef = useRef<HTMLDivElement>(null)
  const lastEditable = useRef<HTMLElement | null>(null)
  const savedJson = useRef('')
  const latestJson = useRef('')

  const openPreview = async (again = resend) => {
    setResend(again)
    setOpen(true); setPreview(null); setTpl(null); setMail(null); setSent(null); setFailed([]); setErr(''); setBusy(true)
    try {
      const d: Preview = await post({ send: false, resend: again })
      savedJson.current = JSON.stringify(d.template)
      setPreview(d); setTpl(d.template); setMail(d.sample); setSave('saved')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  // גוף המייל נערך ישירות ב-DOM (contentEditable), ולכן ה-HTML נכתב אליו רק
  // בטעינה ובשחזור ולא בכל הקלדה (אחרת הסמן קופץ להתחלה).
  // שם המשפחה מוצג בעורך כתג נעול (contenteditable=false), כדי שלא יימחק
  // או ישתבש בטעות באמצע הקלדה. בנוסח שנשמר הוא חוזר להיות NAME_TOKEN.
  const loadBody = (html: string) => { if (bodyRef.current) bodyRef.current.innerHTML = toEditorHtml(html) }
  const bodyReady = !!tpl
  useEffect(() => { if (bodyReady && tpl) loadBody(tpl.bodyHtml) }, [bodyReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p: Partial<LineageFaultTemplate>) => setTpl(t => (t ? { ...t, ...p } : t))
  const syncBody = () => { if (bodyRef.current) patch({ bodyHtml: fromEditorHtml(bodyRef.current.innerHTML) }) }

  // תצוגה חיה: אותה בנייה כמו בשליחה, עם שם המשפחה הראשונה ברשימה.
  const sampleName = preview?.sample.name
  useEffect(() => {
    if (!tpl) return
    const t = setTimeout(() => {
      post({ action: 'render', template: tpl, sampleName }).then(setMail).catch(e => setErr((e as Error).message))
    }, 300)
    return () => clearTimeout(t)
  }, [tpl, sampleName])

  // שמירה אוטומטית
  useEffect(() => {
    if (!tpl) return
    const json = JSON.stringify(tpl)
    latestJson.current = json
    if (json === savedJson.current) { setSave('saved'); return }
    setSave('dirty')
    const t = setTimeout(async () => {
      setSave('saving')
      try {
        await post({ action: 'save', template: tpl })
        savedJson.current = json
        // אם הוקלד עוד משהו בזמן השמירה, נשארים במצב "שומר" עד השמירה הבאה
        if (latestJson.current === json) setSave('saved')
      } catch (e) { setSave('error'); setErr((e as Error).message) }
    }, 800)
    return () => clearTimeout(t)
  }, [tpl])

  const insertName = () => {
    const el = bodyRef.current
    if (!el) return
    el.focus()
    const s = document.getSelection()
    if (s && !(s.rangeCount && el.contains(s.anchorNode))) { s.selectAllChildren(el); s.collapseToEnd() }
    document.execCommand('insertHTML', false, NAME_CHIP)
    syncBody()
  }

  const resetDefault = () => {
    if (!preview || !confirm('לשחזר את נוסח ברירת המחדל? כל השינויים בנוסח יימחקו.')) return
    setTpl(preview.defaultTemplate)
    loadBody(preview.defaultTemplate.bodyHtml)
  }

  const sendAll = async () => {
    if (save !== 'saved' || missingName) return
    setBusy(true); setErr(''); setSent(0)
    let total = 0
    try {
      // שולחים במנות עד שלא נשאר אף אחד, או עד מנה שבה אף מייל לא יצא
      // (כשל קבוע אצל כולם), כדי לא להיתקע בלולאה.
      for (;;) {
        const d = await post({ send: true, resend })
        total += d.sent; setSent(total); setFailed(d.failed ?? [])
        if (!d.remaining || !d.sent) break
      }
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const done = sent !== null && !busy
  const locked = busy || sent !== null
  const missingName = !!tpl && !tpl.bodyHtml.includes(NAME_TOKEN)

  return (
    <>
      <button type="button" onClick={() => openPreview()}
        className="inline-flex items-center gap-1.5 rounded-xl border border-orange-300 bg-orange-50 px-3.5 py-2 text-sm font-bold text-orange-800 hover:bg-orange-100 transition-colors">
        <AlertTriangle size={15} /> הודעה על תקלה בסדר הדורות
      </button>

      {open && (
        <div className="dlg-backdrop" onClick={() => { if (!busy) setOpen(false) }}>
          <div dir="rtl" onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] overflow-y-auto">
            <div className="bg-navy px-5 py-4 text-white flex items-start gap-3">
              <AlertTriangle size={20} className="flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-base">הודעה למשפחות בבדיקה מעמיקה</p>
                <p className="text-gold-soft text-xs mt-1">
                  עורכים את הנוסח מימין ורואים את המייל משמאל. מה שמוצג הוא מה שיישלח.{' '}
                  {resend ? 'תזכורת: נשלח שוב גם למי שקיבל בימים קודמים. מי שקיבל היום לא יקבל שוב.' : 'משפחה שכבר קיבלה לא תקבל שוב.'}
                </p>
              </div>
              <button onClick={() => { if (!busy) setOpen(false) }} className="text-line hover:text-white"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-4 text-sm">
              <div role="radiogroup" aria-label="סוג השליחה" className="inline-flex rounded-xl border border-line p-1 gap-1">
                {([[false, 'שליחה ראשונה'], [true, 'תזכורת חוזרת']] as const).map(([v, l]) => (
                  <button key={l} type="button" role="radio" aria-checked={resend === v}
                    disabled={busy || sent !== null || resend === v} onClick={() => openPreview(v)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${resend === v ? 'bg-navy text-white' : 'text-slate-600 hover:bg-sand disabled:opacity-50'}`}>
                    {l}
                  </button>
                ))}
              </div>
              {busy && !preview && <p className="text-slate-500">טוען תצוגה מקדימה…</p>}
              {err && <p className="text-red-700 font-semibold">{err}</p>}

              {preview && tpl && (
                <>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      ['בבדיקה מעמיקה', preview.total],
                      ['יקבלו מייל', preview.toSend],
                      ['בלי מייל תקין', preview.noEmail.length],
                      [resend ? 'קיבלו היום' : 'כבר קיבלו', preview.alreadySent],
                    ].map(([l, v]) => (
                      <div key={l} className="rounded-xl border border-line px-3 py-2">
                        <dt className="text-xs text-slate-500">{l}</dt>
                        <dd className="text-xl font-bold text-navy-dark">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {preview.noLineage.length > 0 && (
                    <p className="text-slate-600">{preview.noLineage.length} משפחות עם מייל אבל בלי שיוך לעץ הדורות, ולכן לא יקבלו קישור.</p>
                  )}
                  {(preview.otherReason?.length ?? 0) > 0 && (
                    <p className="text-slate-600">{preview.otherReason!.length} משפחות בבדיקה מעמיקה מסיבה שהמזכירות רשמה (לא סדר הדורות), ולכן לא יקבלו מייל.</p>
                  )}
                  {(preview.chainOk?.length ?? 0) > 0 && (
                    <p className="text-slate-600">{preview.chainOk!.length} משפחות בבדיקה מעמיקה שסדר הדורות שלהן תקין כעת, ולכן לא יקבלו מייל. כדאי להריץ &quot;בדיקה מחדש של סדר הדורות&quot; כדי לשחרר אותן.</p>
                  )}
                  {preview.noEmail.length > 0 && (
                    <details className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2">
                      <summary className="cursor-pointer font-semibold text-amber-900">בלי מייל תקין: {preview.noEmail.length} משפחות. צריך לפנות אליהן בטלפון</summary>
                      <ul className="mt-2 space-y-0.5 text-amber-900 max-h-48 overflow-y-auto">
                        {preview.noEmail.map(p => <li key={p.id}>{p.name}{p.email ? <> · <span dir="ltr">{p.email}</span></> : ''}</li>)}
                      </ul>
                    </details>
                  )}

                  <div className="grid gap-5 lg:grid-cols-2">
                    {/* עורך הנוסח */}
                    <fieldset disabled={locked} className="space-y-3 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-navy-dark">עריכת הנוסח</p>
                        <SaveBadge state={save} />
                      </div>
                      <div>
                        <label className={label} htmlFor="lf-subject">נושא המייל</label>
                        <input id="lf-subject" className={input} value={tpl.subject} onChange={e => patch({ subject: e.target.value })} />
                      </div>
                      <div>
                        <label className={label} htmlFor="lf-title">כותרת בראש המייל</label>
                        <input id="lf-title" className={input} value={tpl.title} onChange={e => patch({ title: e.target.value })} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className={label + ' mb-0'}>גוף המייל</span>
                          <button type="button" onClick={insertName}
                            className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-sand">
                            <UserRound size={13} /> הוספת שם המשפחה
                          </button>
                        </div>
                        <div className="rounded-xl border border-line overflow-hidden">
                          {/* הסרגל בנוי לעמוד עם ריפוד (‎-mx-6 -mt-6); כאן הוא בתוך מסגרת */}
                          <div className="[&>div]:m-0"><FormatToolbar targetRef={lastEditable} onCommit={syncBody} /></div>
                          <div ref={bodyRef} contentEditable={!locked} suppressContentEditableWarning data-block-id="body"
                            onInput={syncBody} onBlur={syncBody}
                            className="min-h-[220px] max-h-[380px] overflow-y-auto px-4 py-3 text-[15px] leading-7 text-slate-800 focus:outline-none [&_p]:mb-3" />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          <b dir="rtl">{NAME_TOKEN}</b> מוחלף אוטומטית בשם של כל משפחה, גם בנושא.
                        </p>
                        {missingName && <p className="mt-1 text-xs font-semibold text-amber-700">שם המשפחה נמחק מגוף המייל. החזירו אותו בכפתור &quot;הוספת שם המשפחה&quot; כדי לשלוח.</p>}
                      </div>
                      <div>
                        <label className={label} htmlFor="lf-btn">טקסט הכפתור</label>
                        <input id="lf-btn" className={input} value={tpl.buttonLabel} onChange={e => patch({ buttonLabel: e.target.value })} />
                        <p className="mt-1 text-xs text-slate-500">הקישור של הכפתור אישי לכל משפחה ונוצר אוטומטית בשליחה.</p>
                      </div>
                      <div>
                        <label className={label} htmlFor="lf-note">הערה מתחת לכפתור (אפשר להשאיר ריק)</label>
                        <textarea id="lf-note" rows={2} className={input} value={tpl.note} onChange={e => patch({ note: e.target.value })} />
                      </div>
                      <button type="button" onClick={resetDefault}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-navy-dark">
                        <RotateCcw size={13} /> שחזור נוסח ברירת המחדל
                      </button>
                    </fieldset>

                    {/* תצוגה חיה */}
                    <div className="min-w-0">
                      <p className="font-bold text-navy-dark mb-3">כך ייראה המייל</p>
                      <div className="rounded-xl border border-line overflow-hidden">
                        <div className="bg-sand px-3 py-2 text-xs text-slate-600 space-y-0.5">
                          <p><b>מאת:</b> <span dir="ltr">{preview.from}</span></p>
                          <p><b>אל (דוגמה):</b> {preview.sample.name} <span dir="ltr">{preview.sample.to ?? ''}</span></p>
                          <p><b>נושא:</b> {mail?.subject}</p>
                        </div>
                        <iframe title="דוגמת המייל" srcDoc={mail?.html ?? ''} sandbox="" className="w-full h-[560px] bg-white" />
                      </div>
                    </div>
                  </div>

                  {(preview.noLineage.length > 0 || (preview.otherReason?.length ?? 0) > 0 || (preview.chainOk?.length ?? 0) > 0) && (
                    <details className="rounded-xl border border-line px-3 py-2">
                      <summary className="cursor-pointer font-semibold text-slate-700">משפחות נוספות שלא יקבלו ({preview.noLineage.length + (preview.otherReason?.length ?? 0) + (preview.chainOk?.length ?? 0)})</summary>
                      <ul className="mt-2 space-y-0.5 text-slate-600 max-h-48 overflow-y-auto">
                        {preview.noLineage.map(p => <li key={p.id}>{p.name}: אין שיוך לעץ</li>)}
                        {preview.otherReason?.map(p => <li key={p.id}>{p.name}: בבדיקה מעמיקה מסיבה אחרת</li>)}
                        {preview.chainOk?.map(p => <li key={p.id}>{p.name}: סדר הדורות תקין</li>)}
                      </ul>
                    </details>
                  )}

                  {sent !== null && (
                    <p className="font-semibold text-navy-dark">{busy ? `שולח… ${sent} נשלחו עד כה` : `נשלחו ${sent} מיילים.`}</p>
                  )}
                  {done && failed.length > 0 && (
                    <ul className="text-red-700 space-y-0.5">
                      {failed.map(f => <li key={f.email}>{f.name} ({f.email}): {f.error}</li>)}
                    </ul>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    {sent === null && (missingName
                      ? <span className="text-xs text-amber-700">השליחה תיפתח אחרי שיוחזר שם המשפחה לגוף המייל</span>
                      : save !== 'saved' && <span className="text-xs text-slate-500">השליחה תיפתח אחרי שמירת הנוסח</span>)}
                    <button type="button" disabled={busy} onClick={() => setOpen(false)}
                      className="rounded-xl border border-line px-4 py-2 font-semibold text-slate-600 hover:bg-sand disabled:opacity-50">
                      {done ? 'סגירה' : 'ביטול'}
                    </button>
                    {sent === null && preview.toSend > 0 && (
                      <button type="button" disabled={busy || save !== 'saved' || missingName} onClick={sendAll}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-navy px-4 py-2 font-bold text-white hover:bg-navy-dark disabled:opacity-50">
                        <Send size={15} /> שלח ל-{preview.toSend} משפחות
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === 'saved') return <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><Check size={13} /> הנוסח נשמר</span>
  if (state === 'error') return <span className="text-xs font-semibold text-red-700">השמירה נכשלה</span>
  return <span className="inline-flex items-center gap-1 text-xs text-slate-500"><Loader2 size={13} className="animate-spin" /> שומר…</span>
}
