'use client'
import { useState, useEffect, useMemo } from 'react'
import { Loader2, Save, RotateCcw, Eye, ChevronDown, Check, AlertCircle, Download } from 'lucide-react'
import { EMAIL_CATALOG, GROUP_LABELS, textOf, type EmailGroup, type EmailTexts } from '@/lib/emailCatalog'

// ─────────────────────────────────────────────────────────────────────────────
// עריכת הטקסטים של כל המיילים היוצאים, עם תצוגה מקדימה חיה.
// השמירה היא ל-DB — לצמיתות. כפתור השמירה מופיע רק כשיש שינוי שלא נשמר.
// ─────────────────────────────────────────────────────────────────────────────

const GROUP_ORDER: EmailGroup[] = [
  'registration', 'portal_requests', 'mail_requests', 'maternity',
  'loans', 'aid', 'gratitude', 'auto_reply', 'system',
]

export default function EmailTextsManager() {
  const [saved, setSaved] = useState<EmailTexts>({})     // מה שבמסד
  const [draft, setDraft] = useState<EmailTexts>({})     // מה שנערך כרגע
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const [openId, setOpenId] = useState<string | null>(null)
  // התצוגה מתעדכנת תוך כדי הקלדה — לא כפתור. subject נשמר בנפרד כדי להציג
  // את שורת הנושא מעל המייל, כמו בתיבת דואר.
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/email-texts')
      .then(r => r.json())
      .then(d => { setSaved(d.texts ?? {}); setDraft(d.texts ?? {}) })
      .catch(() => setErr('טעינת הטקסטים נכשלה'))
      .finally(() => setLoading(false))
  }, [])

  // האם יש שינוי שלא נשמר
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(saved),
    [draft, saved],
  )

  // אזהרה לפני יציאה מהדף עם שינויים שלא נשמרו
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const setField = (emailId: string, key: string, value: string) => {
    setOkMsg('')
    setDraft(d => ({ ...d, [emailId]: { ...(d[emailId] ?? {}), [key]: value } }))
  }

  const save = async () => {
    setSaving(true); setErr(''); setOkMsg('')
    try {
      const res = await fetch('/api/admin/email-texts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: draft }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'השמירה נכשלה'); return }
      // מסתנכרנים עם מה שהשרת שמר בפועל (אחרי הניקוי שלו)
      setSaved(d.texts ?? {})
      setDraft(d.texts ?? {})
      setOkMsg('השינויים נשמרו')
      setTimeout(() => setOkMsg(''), 3000)
    } catch {
      setErr('שגיאת תקשורת — השינויים לא נשמרו')
    } finally {
      setSaving(false)
    }
  }

  /** החזרת מייל אחד לברירת המחדל שבקוד. */
  const resetEmail = (emailId: string) => {
    setDraft(d => {
      const next = { ...d }
      delete next[emailId]
      return next
    })
    setOkMsg('')
  }

  // תצוגה חיה: מתרנדרת מחדש עם כל הקלדה (עם השהיה קצרה, כדי לא להציף בקשות).
  // כשאין מייל פתוח — אין תצוגה.
  useEffect(() => {
    if (!openId) { setPreview(null); return }

    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/email-texts/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: openId, texts: draft }),
        })
        const d = await res.json()
        if (cancelled || !res.ok) return
        setPreview({ subject: d.subject, html: d.html })
      } catch { /* התצוגה בלבד — לא מפילים את המסך */ }
    }, 250)

    return () => { cancelled = true; clearTimeout(t) }
  }, [openId, draft])

  if (loading) {
    return <div className="flex items-center gap-2 text-slate-500 text-sm py-6"><Loader2 size={16} className="animate-spin" /> טוען…</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-500 leading-relaxed">
        עריכת הטקסטים של כל המיילים שהמערכת שולחת. המייל מוצג לצד העריכה ומתעדכן בזמן אמת — זה בדיוק מה שיישלח.
        לאחר השמירה, השינוי חל <strong>מיד</strong> על המייל הבא שיישלח.
        העיצוב (לוגו, צבעים, מסגרות) נשאר אחיד ואינו ניתן לעריכה, כדי שטעות לא תוכל לשבור מייל.
      </p>

      {/* מסמך מרוכז מעוצב של כל נוסחי המיילים — נפתח בטאב חדש (לקריאה/הדפסה/שמירה כ-PDF) */}
      <a
        href="/api/admin/email-catalog-pdf"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 self-start rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3.5 py-2 text-sm font-semibold transition-colors"
      >
        <Download size={15} /> צפייה בכל נוסחי המיילים
      </a>

      {/* קבוצות — רק מיילים שהתבנית שלהם באמת קוראת את הטקסטים הערוכים.
          הצגת מייל שאינו wired הייתה מטעה: העריכה לא הייתה משפיעה על כלום. */}
      {GROUP_ORDER.map(group => {
        const emails = EMAIL_CATALOG.filter(e => e.group === group && e.wired)
        if (!emails.length) return null

        return (
          <div key={group} className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-slate-800 border-r-4 border-indigo-400 pr-2.5 mt-2">
              {GROUP_LABELS[group]}
            </h3>

            {emails.map(spec => {
              const open = openId === spec.id
              const edited = Boolean(draft[spec.id] && Object.keys(draft[spec.id]).length)

              return (
                <div key={spec.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : spec.id)}
                    className="w-full flex items-start justify-between gap-3 px-4 py-3 text-right hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 text-sm">{spec.title}</span>
                        {edited && (
                          <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                            נערך
                          </span>
                        )}
                      </div>
                      {/* מתי נשלח — הדבר החשוב ביותר להבנה */}
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        <span className="text-slate-400">נשלח: </span>{spec.trigger}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">אל: {spec.recipient}</p>
                    </div>
                    <ChevronDown size={16} className={`shrink-0 mt-1 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>

                  {open && (
                    // עריכה מימין, המייל החי משמאל — משתנה עם כל הקלדה.
                    <div className="border-t border-slate-100 bg-slate-50/50 grid lg:grid-cols-2 gap-0">
                      <div className="px-4 py-4 flex flex-col gap-3 lg:border-l lg:border-slate-200">
                        {spec.fields.map(f => {
                          const val = textOf(draft, spec.id, f.key)
                          return (
                            <div key={f.key} className="flex flex-col gap-1">
                              <label className="text-xs font-semibold text-slate-700">
                                {f.label}
                                {f.hint && <span className="font-normal text-slate-400 mr-1.5">· {f.hint}</span>}
                              </label>
                              {f.multiline ? (
                                <textarea
                                  value={val}
                                  onChange={e => setField(spec.id, f.key, e.target.value)}
                                  rows={3}
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 resize-y"
                                />
                              ) : (
                                <input
                                  type="text"
                                  value={val}
                                  onChange={e => setField(spec.id, f.key, e.target.value)}
                                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
                                />
                              )}
                            </div>
                          )
                        })}

                        {edited && (
                          <button
                            type="button"
                            onClick={() => resetEmail(spec.id)}
                            className="self-start inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 border border-slate-200 rounded-lg px-3 py-2 hover:bg-white transition-colors"
                          >
                            <RotateCcw size={13} /> החזרה לברירת המחדל
                          </button>
                        )}
                      </div>

                      {/* המייל כפי שהוא ייראה — מתעדכן בזמן אמת */}
                      <div className="px-4 py-4 flex flex-col gap-2 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                          <Eye size={13} /> כך ייראה המייל
                        </div>
                        {preview ? (
                          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden flex flex-col">
                            <div className="px-3 py-2 border-b border-slate-100 bg-slate-50 min-w-0">
                              <p className="text-[10px] text-slate-400 font-semibold">שורת הנושא</p>
                              <p className="text-xs font-bold text-slate-900 truncate">{preview.subject}</p>
                            </div>
                            <iframe
                              srcDoc={preview.html}
                              title="תצוגת המייל"
                              sandbox=""
                              className="w-full border-0 bg-white"
                              style={{ height: 460 }}
                            />
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-40 rounded-xl border border-dashed border-slate-200 text-slate-400 text-sm">
                            <Loader2 size={16} className="animate-spin ml-2" /> מרנדר…
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {err && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
          <AlertCircle size={15} className="shrink-0" /> {err}
        </div>
      )}

      {/* סרגל שמירה — מופיע רק כשיש שינוי שלא נשמר */}
      {dirty && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 shadow-lg px-4 py-3">
          <p className="text-sm font-semibold text-amber-900 flex items-center gap-2">
            <AlertCircle size={16} /> יש שינויים שלא נשמרו
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setDraft(saved); setErr('') }}
              disabled={saving}
              className="text-sm font-medium text-slate-600 px-3 py-2 rounded-lg hover:bg-white/60 transition-colors disabled:opacity-50"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              שמור שינויים
            </button>
          </div>
        </div>
      )}

      {okMsg && !dirty && (
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
          <Check size={15} /> {okMsg}
        </div>
      )}

    </div>
  )
}
