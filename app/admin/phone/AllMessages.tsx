'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, X, Loader2, Check, Mic, MicOff, Save, AlertTriangle, Volume2, RefreshCw } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// מרכז הנוסחים — כל מה שנאמר בטלפון, במסך אחד.
//
// 🔴 למה זה קיים: 51 ההודעות של המערכת הטלפונית חיו בשלושה מסכים נפרדים
// (תפריט ראשי / חגים / יולדות), וכל אחד מהם נפתח מתוך שלוחה אחרת. מי
// ששמע משפט בטלפון ורצה לתקן אותו היה צריך לדעת מראש לאיזו שלוחה הוא
// שייך — ואם ניחש לא נכון, חיפש במסך הלא נכון ולא מצא.
//
// כאן מחפשים לפי מה ששומעים. החיפוש רץ על *תוכן* ההודעה ולא רק על
// הכותרת, כך שהדבקה של משפט מהשיחה מוצאת אותו ישירות.
//
// ⚠️ אין כאן מנגנון שמירה חדש: השמירה עוברת דרך אותם שלושה נתיבי API
// שהמסכים הייעודיים משתמשים בהם, כולל הוולידציה שלהם (למשל "חובה לכלול
// {distribution}"). מנגנון שני היה עוקף בדיקות ומאפשר לשמור שיחה עיוורת.
//
// ⚠️ allowAudio=false אינו חוסם עריכת טקסט — הוא חוסם *הקלטה אנושית*
// בלבד, כי ההודעה מכילה ערך שמשתנה בכל שיחה ({name}, {list}). זו הבחנה
// שאי אפשר היה לראות בשום מסך, ולכן היא מסומנת כאן במפורש.
// ─────────────────────────────────────────────────────────────────────────────

type Meta = {
  key: string
  label: string
  defaultText: string
  allowAudio: boolean
  placeholders?: string[]
  hint?: string
}
type Msg = { text?: string; audio?: string | null }

/** שלוש השלוחות — אותו חוזה API בדיוק לכל אחת. */
const SOURCES = [
  { id: 'menu', label: 'תפריט ראשי',
    api: '/api/admin/yemot-menu/messages',
    voice: '/api/admin/yemot-menu/generate-voice', tone: 'bg-sky-100 text-sky-800' },
  { id: 'holiday', label: 'חלוקת חגים',
    api: '/api/admin/yemot-holiday/messages',
    voice: '/api/admin/yemot-holiday/generate-voice', tone: 'bg-teal-100 text-teal-800' },
  { id: 'maternity', label: 'יולדות',
    api: '/api/admin/yemot-maternity/messages',
    voice: '/api/admin/yemot-maternity/generate-voice', tone: 'bg-pink-100 text-pink-800' },
] as const

type SourceId = typeof SOURCES[number]['id']
type Row = {
  source: SourceId; meta: Meta; saved: string; draft: string
  /** שם קובץ הקול המשויך. tts_ = נוצר ב-ElevenLabs; אחרת הקלטה אנושית. */
  audio: string | null
}

/** נרמול לחיפוש עברי — גרשיים ומקפים לא אמורים למנוע התאמה. */
const norm = (s: string) =>
  s.replace(/["'׳״]/g, '').replace(/[-–—_]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()

export default function AllMessages() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [okKey, setOkKey] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const all: Row[] = []
    for (const src of SOURCES) {
      try {
        const res = await fetch(src.api, { cache: 'no-store' })
        if (!res.ok) continue
        const d = await res.json() as { messages?: Record<string, Msg>; meta?: Meta[] }
        for (const m of d.meta ?? []) {
          const text = d.messages?.[m.key]?.text ?? m.defaultText
          all.push({
            source: src.id, meta: m, saved: text, draft: text,
            audio: d.messages?.[m.key]?.audio ?? null,
          })
        }
      } catch { /* שלוחה שלא נטענה אינה מונעת את הצגת השאר */ }
    }
    setRows(all)
  }, [])

  useEffect(() => { void load() }, [load])

  const shown = useMemo(() => {
    if (!rows) return []
    const needle = norm(q)
    if (!needle) return rows
    // 🔴 החיפוש כולל את גוף ההודעה: המנהל מדביק משפט ששמע בטלפון.
    return rows.filter(r =>
      norm(r.meta.label).includes(needle) ||
      norm(r.draft).includes(needle) ||
      norm(r.meta.key).includes(needle))
  }, [rows, q])

  /** מושך את רשימת הערים האמיתית לתוך הטקסט, במקום {list}. */
  async function refreshCities(row: Row) {
    const id = `${row.source}:${row.meta.key}`
    setBusy(id); setErr('')
    try {
      const res = await fetch('/api/admin/holiday-centers/city-list', { cache: 'no-store' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'שליפת הערים נכשלה'); return }
      setRows(prev => (prev ?? []).map(r =>
        r.source === row.source && r.meta.key === row.meta.key
          ? { ...r, draft: String(d.text ?? '') } : r))
      setOkKey(id)
      setTimeout(() => setOkKey(k => (k === id ? null : k)), 2000)
    } catch { setErr('שגיאת רשת') } finally { setBusy(null) }
  }

  /**
   * יצירת קול מחדש — גם כשהטקסט לא השתנה.
   *
   * ⚠️ שומר קודם: היצירה בשרת קוראת את הטקסט השמור, ובלי שמירה היא
   * הייתה מייצרת קול לנוסח הישן בעוד שעל המסך מופיע החדש.
   */
  async function regenerate(row: Row) {
    const id = `${row.source}:${row.meta.key}`
    setBusy(id); setErr(''); setOkKey(null)
    const src = SOURCES.find(s => s.id === row.source)!
    try {
      const messages: Record<string, Msg> = {}
      for (const r of rows ?? []) {
        if (r.source !== row.source) continue
        messages[r.meta.key] = {
          text: r.meta.key === row.meta.key ? row.draft : r.saved,
          audio: r.audio,
        }
      }
      const sr = await fetch(src.api, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })
      if (!sr.ok) {
        const sd = await sr.json().catch(() => ({}))
        setErr(sd.error ?? 'השמירה נכשלה'); return
      }

      const vr = await fetch(src.voice, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: row.meta.key, text: row.draft }),
      })
      const vd = await vr.json().catch(() => ({}))
      if (!vr.ok) { setErr(vd.error ?? 'יצירת הקול נכשלה'); return }

      setRows(prev => (prev ?? []).map(r =>
        r.source === row.source && r.meta.key === row.meta.key
          ? { ...r, saved: row.draft, audio: vd.audio ?? r.audio } : r))
      setOkKey(id)
      setTimeout(() => setOkKey(k => (k === id ? null : k)), 2500)
    } catch { setErr('שגיאת רשת') } finally { setBusy(null) }
  }

  async function save(row: Row) {
    const id = `${row.source}:${row.meta.key}`
    setBusy(id); setErr(''); setOkKey(null)
    const src = SOURCES.find(s => s.id === row.source)!
    try {
      // ⚠️ נשלחות *כל* ההודעות של אותה שלוחה ולא רק זו שנערכה: נתיבי
      // ה-API מחליפים את האובייקט כולו, ושליחת מפתח בודד הייתה מוחקת
      // את השאר.
      const messages: Record<string, Msg> = {}
      for (const r of rows ?? []) {
        if (r.source !== row.source) continue
        // 🔴 audio נשלח יחד עם הטקסט: הנתיב מחליף את האובייקט כולו,
        // ושליחת { text } בלבד הייתה מוחקת את שיוך קובץ הקול של *כל*
        // הודעות השלוחה — כלומר כל ההקלטות היו מפסיקות להתנגן בשמירה
        // של הודעה אחת, בלי שום סימן.
        messages[r.meta.key] = {
          text: r.meta.key === row.meta.key ? row.draft : r.saved,
          audio: r.audio,
        }
      }
      const res = await fetch(src.api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'השמירה נכשלה'); return }

      // ── יצירת קול טבעי ──
      // 🔴 שמירה = הקלטה חדשה, כמו בשאר המסכים. הקלטה גוברת על הטקסט,
      // ולכן בלי זה "נשמר" מופיע בעוד שבטלפון נשמעת הגרסה הקודמת.
      // ⚠️ מדולג על הודעה דינמית (השרת חוסם אותה ממילא) ועל הקלטה
      // אנושית, שנעשתה בכוונה ואין דרך לשחזר אותה.
      let newAudio = row.audio
      const human = !!row.audio && !row.audio.startsWith('tts_')
      const dynamic = /\{[^}]+\}/.test(row.draft)
      if (row.meta.allowAudio && row.draft.trim() && !dynamic && !human) {
        try {
          const vr = await fetch(src.voice, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: row.meta.key, text: row.draft }),
          })
          const vd = await vr.json().catch(() => ({}))
          if (vr.ok && vd.audio) newAudio = vd.audio
          else if (!vr.ok) setErr(vd.error ?? 'הטקסט נשמר, אך יצירת הקול נכשלה')
        } catch { setErr('הטקסט נשמר, אך יצירת הקול נכשלה') }
      }

      setRows(prev => (prev ?? []).map(r =>
        r.source === row.source && r.meta.key === row.meta.key
          ? { ...r, saved: row.draft, audio: newAudio } : r))
      setOkKey(id)
      setTimeout(() => setOkKey(k => (k === id ? null : k)), 2000)
    } catch { setErr('שגיאת רשת') } finally { setBusy(null) }
  }

  if (rows === null) {
    return <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
      <Loader2 size={16} className="animate-spin" /> טוען את כל הנוסחים…
    </div>
  }

  const dirty = rows.filter(r => r.draft !== r.saved).length

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900">כל מה שנאמר בטלפון</h3>
        <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">
          {rows.length} נוסחים משלוש השלוחות. חפשו לפי מילה ששמעתם בשיחה — החיפוש
          רץ גם על גוף ההודעה, לא רק על הכותרת.
        </p>
      </div>

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="search" value={q} onChange={e => setQ(e.target.value)}
          placeholder="למשל: הכרטסת, מוקד, תעודת זהות…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-10 pl-9 text-sm text-slate-800 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
        {q && (
          <button type="button" onClick={() => setQ('')} aria-label="ניקוי החיפוש"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X size={14} />
          </button>
        )}
      </div>

      {q && (
        <p className="text-[12px] font-medium text-slate-500">
          {shown.length === 0 ? 'לא נמצא נוסח מתאים' : `${shown.length} נוסחים מתאימים`}
        </p>
      )}
      {dirty > 0 && (
        <p className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-[11.5px] font-bold text-amber-800">
          <AlertTriangle size={12} /> {dirty} נוסחים נערכו ולא נשמרו
        </p>
      )}
      {err && (
        <p className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-[12px] font-semibold text-rose-700">{err}</p>
      )}

      <div className="flex flex-col gap-2.5">
        {shown.map(row => {
          const src = SOURCES.find(s => s.id === row.source)!
          const id = `${row.source}:${row.meta.key}`
          const changed = row.draft !== row.saved
          return (
            <div key={id} className={`rounded-xl border p-3.5 ${
              changed ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'}`}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-md px-2 py-0.5 text-[10.5px] font-extrabold ${src.tone}`}>
                  {src.label}
                </span>
                <span className="text-[13px] font-extrabold text-slate-800">{row.meta.label}</span>
                {/* ⚠️ ההבחנה שלא הייתה גלויה בשום מסך. */}
                {/* 🔴 מה נשמע *עכשיו* — לא מה מותר. הקלטה גוברת על
                    הטקסט, וזו ההבחנה שלא הופיעה בשום מסך. */}
                {row.audio ? (
                  <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                    row.audio.startsWith('tts_')
                      ? 'bg-violet-50 text-violet-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {row.audio.startsWith('tts_') ? <Volume2 size={9} /> : <Mic size={9} />}
                    {row.audio.startsWith('tts_') ? 'קול טבעי' : 'הקלטה אנושית'}
                  </span>
                ) : (
                  <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                    row.meta.allowAudio ? 'bg-slate-100 text-slate-500' : 'bg-slate-100 text-slate-400'}`}>
                    {row.meta.allowAudio ? <Mic size={9} /> : <MicOff size={9} />}
                    {row.meta.allowAudio ? 'קול ממוחשב' : 'טקסט בלבד'}
                  </span>
                )}
                {(row.meta.placeholders ?? []).map(p => (
                  <span key={p} dir="ltr"
                    className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-indigo-700">
                    {`{${p}}`}
                  </span>
                ))}
              </div>

              {row.meta.hint && (
                <p className="mb-2 text-[11px] leading-relaxed text-slate-500">{row.meta.hint}</p>
              )}
              {(row.meta.placeholders ?? []).length > 0 && (
                <p className="mb-2 text-[11px] leading-relaxed text-amber-700">
                  ⚠️ הערכים בסוגריים מוחלפים אוטומטית בזמן השיחה — אין למחוק אותם.
                </p>
              )}

              <textarea
                value={row.draft} rows={2}
                onChange={e => setRows(prev => (prev ?? []).map(r =>
                  r.source === row.source && r.meta.key === row.meta.key
                    ? { ...r, draft: e.target.value } : r))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] leading-relaxed text-slate-800 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
              />

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {/* ── רשימת הערים ──
                    🔴 ההודעה דינמית ({list}), ולכן לא ניתן ליצור לה קול
                    כל עוד המשתנה בתוכה. "רענון הרשימה" מושך את הערים
                    האמיתיות לתוך הטקסט — ומאותו רגע אפשר לערוך ולהקליט.
                    ⚠️ אחרי כל פתיחה או סגירה של מוקד יש לרענן שוב:
                    הקלטה ישנה תשלח משפחות לעיר הלא נכונה. */}
                {row.meta.key === 'ask_city' && (
                  <button type="button" disabled={busy === id}
                    onClick={() => void refreshCities(row)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-teal-300 px-3 py-1.5 text-[11.5px] font-bold text-teal-700 hover:bg-teal-50 disabled:opacity-50">
                    {busy === id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    רענון הרשימה
                  </button>
                )}
                {/* ── יצירת קול מחדש ──
                    🔴 השמירה מייצרת קול רק כשהטקסט השתנה, כדי לא לבזבז
                    מכסת ElevenLabs על 51 הודעות בכל לחיצה. אבל אז אין
                    שום דרך לרענן הקלטה שהטקסט שלה נשאר כשהיה — למשל
                    אחרי שינוי בקול עצמו, או כשההקלטה הקודמת יצאה פגומה.
                    ⚠️ מוצג רק להודעה שאפשר להקליט ושאין בה משתנה. */}
                {row.meta.allowAudio && row.draft.trim() && !/\{[^}]+\}/.test(row.draft) && (
                  <button type="button" disabled={busy === id}
                    onClick={() => void regenerate(row)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 px-3 py-1.5 text-[11.5px] font-bold text-violet-700 hover:bg-violet-50 disabled:opacity-50">
                    {busy === id ? <Loader2 size={12} className="animate-spin" /> : <Volume2 size={12} />}
                    יצירת קול מחדש
                  </button>
                )}
                <button type="button" disabled={!changed || busy === id} onClick={() => void save(row)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-[11.5px] font-bold text-white hover:bg-teal-700 disabled:opacity-40">
                  {busy === id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} שמירה
                </button>
                {changed && (
                  <button type="button"
                    onClick={() => setRows(prev => (prev ?? []).map(r =>
                      r.source === row.source && r.meta.key === row.meta.key
                        ? { ...r, draft: r.saved } : r))}
                    className="text-[11px] font-semibold text-slate-500 underline hover:text-slate-700">
                    ביטול השינוי
                  </button>
                )}
                {row.draft !== row.meta.defaultText && (
                  <button type="button"
                    onClick={() => setRows(prev => (prev ?? []).map(r =>
                      r.source === row.source && r.meta.key === row.meta.key
                        ? { ...r, draft: r.meta.defaultText } : r))}
                    className="text-[11px] font-semibold text-slate-400 underline hover:text-slate-600">
                    שחזור לנוסח המקורי
                  </button>
                )}
                {okKey === id && (
                  <span className="inline-flex items-center gap-1 text-[11.5px] font-bold text-emerald-700">
                    <Check size={12} /> נשמר
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
