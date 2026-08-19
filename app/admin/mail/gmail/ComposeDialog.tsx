'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  X, Send, Loader2, Paperclip, Trash2,
  Bold, Italic, Underline, List, ListOrdered, Link2, AlertTriangle,
  AlignRight, AlignCenter, AlignLeft, Palette, Clock,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// חלון כתיבת אימייל — עורך עשיר, אנשי קשר, וצירופים.
//
// ⚠️ העורך הוא contentEditable ולא textarea: סרגל העיצוב (מודגש/נטוי/רשימה)
// דורש HTML חי, ו-textarea מחזיק טקסט שטוח בלבד.
//
// ⚠️ אנשי הקשר מגיעים מחיפוש המוטבים הקיים — לפי שם, ת"ז או מייל. ההקלדה
// אינה מחייבת בחירה: אפשר להקליד כתובת חופשית, כי לא כל נמען הוא מוטב.
// ─────────────────────────────────────────────────────────────────────────────

interface Contact {
  id: string
  full_name?: string | null
  family_name?: string | null
  email?: string | null
  phone?: string | null
  city?: string | null
  id_number?: string | null
}

interface Att { name: string; size: number; type: string; data: string }

/** ⚠️ תקרת גודל לכל הצירופים יחד. Gmail חוסם מעל 25MB, והכשל שם אינו מוסבר. */
const MAX_TOTAL = 20 * 1024 * 1024

export default function ComposeDialog({
  mode, initialTo, initialSubject, accountEmail, accounts, fromId, onFromChange, onClose, onSent,
}: {
  mode: 'new' | 'reply'
  initialTo?: string
  initialSubject?: string
  accountEmail?: string | null
  /** התיבות המחוברות — לבורר "מאת". ריק/יחיד ⇒ הבורר אינו מוצג. */
  accounts?: { id: string; email: string }[]
  fromId?: string
  onFromChange?: (id: string) => void
  onClose: () => void
  onSent: (payload: { to: string; cc?: string; bcc?: string; subject: string; html: string; attachments: Att[]; scheduledAt?: string }) => Promise<boolean>
}) {
  const [to, setTo] = useState(initialTo ?? '')
  const [subject, setSubject] = useState(initialSubject ?? '')
  // עותק / עותק מוסתר — מוסתרים עד שלוחצים, כמו בג'ימייל
  const [cc, setCc] = useState('')
  const [bcc, setBcc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [attachments, setAttachments] = useState<Att[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── שליחה מתוזמנת ──
  // 🔴 התזמון מתבצע ב-Resend עצמו (scheduledAt ב-lib/sendMail), לא ב-Cron
  // שלנו: אין סריקה תקופתית, והמועד מדויק לדקה.
  //
  // ⚠️ Gmail אינו תומך בתזמון — sendMail מפנה אוטומטית ל-Resend כשהשדה
  // מאוכלס. לכן אין מה לחסום כאן לפי סוג הנמען.
  const [scheduledAt, setScheduledAt] = useState('')
  const [showSchedule, setShowSchedule] = useState(false)

  const [contactQ, setContactQ] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [showContacts, setShowContacts] = useState(false)
  const [searching, setSearching] = useState(false)

  const editorRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // ── חיפוש אנשי קשר ──
  // ⚠️ מושהה: חיפוש בכל הקלדה היה יורה עשרות בקשות בזמן שמקלידים שם.
  const searchContacts = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setContacts([]); return }
    setSearching(true)
    try {
      const digits = q.replace(/\D/g, '')
      const param = digits.length >= 5 ? `id_number=${digits}` : `q=${encodeURIComponent(q)}`
      const res = await fetch(`/api/admin/beneficiary-search?${param}&limit=8`, { cache: 'no-store' })
      const json = await res.json()
      setContacts(Array.isArray(json) ? json : (json.results ?? json.beneficiaries ?? []))
    } catch { /* חיפוש שנכשל אינו חוסם הקלדה חופשית */ } finally { setSearching(false) }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { void searchContacts(contactQ) }, 300)
    return () => clearTimeout(t)
  }, [contactQ, searchContacts])

  // ── צירופים ──
  async function addFiles(files: FileList | null) {
    if (!files?.length) return
    setError(null)
    const next: Att[] = [...attachments]
    let total = next.reduce((s, a) => s + a.size, 0)

    for (const f of Array.from(files)) {
      total += f.size
      // ⚠️ הבדיקה על הסכום המצטבר ולא על כל קובץ בנפרד: חמישה קבצים של
      // 5MB עוברים כל אחד ונחסמים יחד — והכשל בגמייל אינו מוסבר.
      if (total > MAX_TOTAL) {
        setError(`הצירופים חורגים מ-${Math.round(MAX_TOTAL / 1024 / 1024)}MB. הסירו קובץ ונסו שוב.`)
        break
      }
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result ?? '').split(',')[1] ?? '')
        r.onerror = reject
        r.readAsDataURL(f)
      }).catch(() => '')
      if (data) next.push({ name: f.name, size: f.size, type: f.type || 'application/octet-stream', data })
    }
    setAttachments(next)
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── סרגל העיצוב ──
  // ⚠️ execCommand מיושן אך הוא הדרך היחידה שעובדת בכל הדפדפנים ללא
  // ספריית עורך כבדה. הפעולות כאן בסיסיות ולא דורשות יותר מזה.
  const exec = (cmd: string, val?: string) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, val)
  }

  async function submit() {
    const html = editorRef.current?.innerHTML ?? ''
    if (!to.trim()) { setError('חסרה כתובת נמען'); return }
    if (!html.replace(/<[^>]*>/g, '').trim() && !attachments.length) {
      setError('ההודעה ריקה'); return
    }
    // ⚠️ אותו סף כמו בשרת (30 שניות): מועד שחלף מתעלמים ממנו שם ושולחים
    // מיד — עדיף לומר זאת כאן מאשר להפתיע בשליחה מיידית.
    let scheduledIso: string | undefined
    if (showSchedule && scheduledAt) {
      const t = new Date(scheduledAt).getTime()
      if (!Number.isFinite(t)) { setError('מועד השליחה אינו תקין'); return }
      if (t <= Date.now() + 30_000) { setError('מועד השליחה חייב להיות עתידי (לפחות דקה מעכשיו)'); return }
      scheduledIso = new Date(t).toISOString()
    }

    setSending(true); setError(null)
    const ok = await onSent({
      to: to.trim(),
      cc: cc.trim() || undefined,
      bcc: bcc.trim() || undefined,
      subject: subject.trim() || '(ללא נושא)',
      html, attachments,
      ...(scheduledIso ? { scheduledAt: scheduledIso } : {}),
    })
    setSending(false)
    if (ok) onClose()
    else setError('השליחה נכשלה')
  }

  const tbBtn = 'p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full sm:max-w-3xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">

        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 flex-shrink-0">
          <h3 className="font-extrabold text-slate-900">
            {mode === 'reply' ? 'תשובה' : 'אימייל חדש'}
          </h3>
          <div className="flex items-center gap-2">
            {/* 🔴 בורר "מאת" — בחירת התיבה השולחת מתוך החלון.
                ⚠️ בתשובה הבורר *אינו* מוצג: התשובה חייבת לצאת מהתיבה
                שאליה ההודעה הגיעה, אחרת המשפחה מקבלת מענה מכתובת שלא
                כתבה אליה, והשרשור אצלה נשבר.
                ⚠️ מוצג רק כשמחוברת יותר מתיבה אחת — אחרת אין מה לבחור. */}
            {mode === 'new' && (accounts?.length ?? 0) > 1 ? (
              <label className="hidden sm:flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-slate-400">מאת</span>
                <select value={fromId ?? ''} onChange={e => onFromChange?.(e.target.value)} dir="ltr"
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200">
                  {accounts!.map(a => <option key={a.id} value={a.id}>{a.email}</option>)}
                </select>
              </label>
            ) : accountEmail ? (
              <span dir="ltr" className="text-[11px] text-slate-400 hidden sm:inline">מ: {accountEmail}</span>
            ) : null}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* נמען + אנשי קשר */}
          <div className="px-5 pt-4 pb-2 relative">
            {/* 🔴 השלמה אוטומטית בתוך שדה "אל" עצמו — בלי כפתור "אנשי קשר".
                ⚠️ קודם החיפוש היה מאחורי כפתור נפרד: המשתמש נדרש לדעת
                שהוא קיים, ללחוץ, ולהקליד שוב באותו שדה. עכשיו מקלידים
                ישירות שם, ת"ז או מייל — והרשימה נפתחת מאליה. */}
            <div className="relative">
              <input
                value={to}
                onChange={e => { setTo(e.target.value); setContactQ(e.target.value); setShowContacts(true) }}
                onFocus={() => { if (to.trim().length >= 2) setShowContacts(true) }}
                // ⚠️ ההשהיה נחוצה: בלעדיה onBlur סוגר את הרשימה לפני
                // ש-onClick של השורה שנלחצה מספיק לרוץ.
                onBlur={() => setTimeout(() => setShowContacts(false), 150)}
                // ⚠️ הכפתורים יושבים מימין (right-2), ולכן הריווח שמפנה להם
                // מקום הוא pr — לא pl. placeholder בעברית על שדה dir="ltr"
                // מתחיל משמאל, כך שהוא רחוק מהם ואינו נחתך.
                dir="ltr" placeholder="אל…"
                className={`w-full rounded-xl border border-slate-200 py-2 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                  (!showCc && !showBcc) ? 'pr-24' : (!showCc || !showBcc) ? 'pr-14' : 'pr-3'
                }`} />
              {searching && (
                <Loader2 size={14} className="absolute top-1/2 -translate-y-1/2 left-3 animate-spin text-slate-400" />
              )}
              {/* ⚠️ מוסתרים עד שלוחצים, כמו בג'ימייל: רוב ההודעות אינן
                  צריכות עותק, ושני שדות ריקים קבועים רק מעמיסים. */}
              {(!showCc || !showBcc) && (
                <div className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center gap-1">
                  {!showCc && (
                    <button type="button" onClick={() => setShowCc(true)}
                      className="rounded px-1.5 py-0.5 text-[11px] font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                      עותק
                    </button>
                  )}
                  {!showBcc && (
                    <button type="button" onClick={() => setShowBcc(true)}
                      className="rounded px-1.5 py-0.5 text-[11px] font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                      מוסתר
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* ההסבר ירד מה-placeholder (הוא נחתך מול הכפתורים) — כאן הוא
                נשאר גלוי גם אחרי שמתחילים להקליד. */}
            {!to.trim() && (
              <p className="mt-1 px-1 text-right text-[11px] text-slate-400">שם, ת״ז או כתובת מייל</p>
            )}

            {showCc && (
              <div dir="rtl" className="mt-2 flex items-center gap-2">
                <span className="w-12 flex-shrink-0 text-right text-[11px] font-bold text-slate-500">עותק</span>
                <input value={cc} onChange={e => setCc(e.target.value)} dir="ltr"
                  placeholder="כתובות מופרדות בפסיק"
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                <button type="button" onClick={() => { setShowCc(false); setCc('') }}
                  className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
              </div>
            )}
            {showBcc && (
              <div dir="rtl" className="mt-2 flex items-center gap-2">
                <span className="w-12 flex-shrink-0 text-right text-[11px] font-bold text-slate-500">מוסתר</span>
                <input value={bcc} onChange={e => setBcc(e.target.value)} dir="ltr"
                  placeholder="כתובות מופרדות בפסיק"
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                <button type="button" onClick={() => { setShowBcc(false); setBcc('') }}
                  className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
              </div>
            )}

            {showContacts && contactQ.trim().length >= 2 && (contacts.length > 0 || searching) && (
              <div className="absolute z-20 mt-1 w-[calc(100%-2.5rem)] rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                <div className="max-h-60 overflow-y-auto">
                  {searching && contacts.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-slate-400 flex items-center gap-2">
                      <Loader2 size={12} className="animate-spin" /> מחפש…
                    </p>
                  ) : contacts.map(c => {
                    const name = [c.family_name, c.full_name].filter(Boolean).join(' ') || c.full_name || '—'
                    return (
                      <button key={c.id} disabled={!c.email}
                        // ⚠️ onMouseDown ולא onClick: onBlur של השדה יורה
                        // קודם, ובלי זה הלחיצה הייתה מתבטלת.
                        onMouseDown={e => {
                          e.preventDefault()
                          if (c.email) { setTo(c.email); setShowContacts(false); setContactQ('') }
                        }}
                        className="w-full text-right px-3 py-2 hover:bg-indigo-50 disabled:opacity-40 transition-colors border-b border-slate-50 last:border-0">
                        <p className="text-xs font-bold text-slate-800">
                          {name}
                          {c.id_number && <span className="mr-1.5 font-normal text-slate-400 ltr-num">· {c.id_number}</span>}
                        </p>
                        <p dir="ltr" className="text-[11px] text-slate-500 text-right">
                          {c.email || 'אין כתובת מייל'}{c.city ? ` · ${c.city}` : ''}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="px-5 pb-2">
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="נושא"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>

          {/* סרגל עיצוב */}
          <div className="px-5 pb-1 flex items-center gap-0.5 flex-wrap border-b border-slate-100 pb-2">
            {/* גופן וגודל — ⚠️ execCommand('fontName'/'fontSize') הוא
                המנגנון היחיד שעובד בכל הדפדפנים בלי ספריית עורך כבדה.
                fontSize מקבל 1–7 בלבד (ולא פיקסלים) — זה תקן ישן. */}
            <select onChange={e => { exec('fontName', e.target.value); e.currentTarget.selectedIndex = 0 }}
              title="גופן"
              className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-semibold text-slate-600 focus:outline-none">
              <option value="">גופן</option>
              {['Arial', 'David', 'Times New Roman', 'Courier New', 'Verdana'].map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <select onChange={e => { exec('fontSize', e.target.value); e.currentTarget.selectedIndex = 0 }}
              title="גודל"
              className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-semibold text-slate-600 focus:outline-none">
              <option value="">גודל</option>
              {[['2', 'קטן'], ['3', 'רגיל'], ['5', 'גדול'], ['7', 'ענק']].map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <span className="w-px h-4 bg-slate-200 mx-1" />
            <button onClick={() => exec('bold')} className={tbBtn} title="מודגש"><Bold size={15} /></button>
            <button onClick={() => exec('italic')} className={tbBtn} title="נטוי"><Italic size={15} /></button>
            <button onClick={() => exec('underline')} className={tbBtn} title="קו תחתון"><Underline size={15} /></button>
            {/* צבע טקסט — ⚠️ input[type=color] ולא בורר מותאם: הוא נתמך
                בכל הדפדפנים ופותח את בוחר הצבעים של מערכת ההפעלה. */}
            <label className={`${tbBtn} relative cursor-pointer`} title="צבע טקסט">
              <Palette size={15} />
              <input type="color" defaultValue="#000000"
                onChange={e => exec('foreColor', e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
            <span className="w-px h-4 bg-slate-200 mx-1" />
            <button onClick={() => exec('insertUnorderedList')} className={tbBtn} title="רשימה"><List size={15} /></button>
            <button onClick={() => exec('insertOrderedList')} className={tbBtn} title="רשימה ממוספרת"><ListOrdered size={15} /></button>
            <span className="w-px h-4 bg-slate-200 mx-1" />
            {/* יישור — ⚠️ ברירת המחדל בעברית היא ימין, ולכן הוא ראשון. */}
            <button onClick={() => exec('justifyRight')} className={tbBtn} title="יישור לימין"><AlignRight size={15} /></button>
            <button onClick={() => exec('justifyCenter')} className={tbBtn} title="מרכוז"><AlignCenter size={15} /></button>
            <button onClick={() => exec('justifyLeft')} className={tbBtn} title="יישור לשמאל"><AlignLeft size={15} /></button>
            <span className="w-px h-4 bg-slate-200 mx-1" />
            <button title="קישור" className={tbBtn}
              onClick={() => { const u = prompt('כתובת הקישור:'); if (u) exec('createLink', u) }}>
              <Link2 size={15} />
            </button>
            <span className="w-px h-4 bg-slate-200 mx-1" />
            <button onClick={() => fileRef.current?.click()} className={tbBtn} title="צירוף קובץ">
              <Paperclip size={15} />
            </button>
            <input ref={fileRef} type="file" multiple hidden onChange={e => addFiles(e.target.files)} />
          </div>

          {/* גוף ההודעה */}
          {/* ⚠️ dir=rtl אך plaintext-only מבוטל: הגוף נשלח כ-HTML ולכן חייב
              לשמור עיצוב. suppressContentEditableWarning נדרש כי React אינו
              שולט בתוכן. */}
          <div ref={editorRef} contentEditable suppressContentEditableWarning dir="rtl"
            className="mx-5 my-3 min-h-[220px] rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-200 overflow-y-auto"
          />

          {/* צירופים */}
          {attachments.length > 0 && (
            <div className="px-5 pb-3 flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-700">
                  <Paperclip size={11} />
                  <span className="max-w-40 truncate">{a.name}</span>
                  <span className="text-slate-400">{(a.size / 1024).toFixed(0)}KB</span>
                  <button onClick={() => setAttachments(list => list.filter((_, j) => j !== i))}
                    className="text-slate-400 hover:text-rose-600"><Trash2 size={11} /></button>
                </span>
              ))}
            </div>
          )}

          {error && (
            <p className="mx-5 mb-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 flex items-center gap-1.5">
              <AlertTriangle size={13} /> {error}
            </p>
          )}
        </div>

        {/* בורר מועד — נפתח מהשעון שבשורת הפעולות */}
        {showSchedule && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-indigo-50/60 px-5 py-2.5 flex-shrink-0">
            <Clock size={14} className="text-indigo-600" />
            <span className="text-[11px] font-bold text-indigo-900">שליחה בתאריך:</span>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => { setScheduledAt(e.target.value); setError(null) }}
              className="rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            <button type="button"
              onClick={() => { setShowSchedule(false); setScheduledAt(''); setError(null) }}
              className="text-[11px] font-bold text-indigo-700 hover:underline">ביטול תזמון</button>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <span className="text-[11px] text-slate-400">
            {showSchedule && scheduledAt
              ? 'ההודעה תמתין ותישלח במועד שנבחר'
              : mode === 'reply' ? 'התשובה תישלח בשרשור הקיים' : 'ההודעה תישלח מהתיבה הנבחרת'}
          </span>
          <div className="flex items-center gap-2">
            {!showSchedule && (
              <button type="button" onClick={() => setShowSchedule(true)} title="שליחה מתוזמנת"
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
                <Clock size={14} /> תזמון
              </button>
            )}
            <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">ביטול</button>
            <button onClick={submit} disabled={sending || !to.trim()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50">
              {sending ? <Loader2 size={14} className="animate-spin" />
                : (showSchedule && scheduledAt) ? <Clock size={14} /> : <Send size={14} />}
              {(showSchedule && scheduledAt) ? 'תזמן שליחה' : 'שלח'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
