'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, X, Loader2, Check, Mic, MicOff, Save, AlertTriangle } from 'lucide-react'

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
  { id: 'menu', label: 'תפריט ראשי', api: '/api/admin/yemot-menu/messages', tone: 'bg-sky-100 text-sky-800' },
  { id: 'holiday', label: 'חלוקת חגים', api: '/api/admin/yemot-holiday/messages', tone: 'bg-teal-100 text-teal-800' },
  { id: 'maternity', label: 'יולדות', api: '/api/admin/yemot-maternity/messages', tone: 'bg-pink-100 text-pink-800' },
] as const

type SourceId = typeof SOURCES[number]['id']
type Row = { source: SourceId; meta: Meta; saved: string; draft: string }

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
          all.push({ source: src.id, meta: m, saved: text, draft: text })
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
        messages[r.meta.key] = { text: r.meta.key === row.meta.key ? row.draft : r.saved }
      }
      const res = await fetch(src.api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'השמירה נכשלה'); return }
      setRows(prev => (prev ?? []).map(r =>
        r.source === row.source && r.meta.key === row.meta.key
          ? { ...r, saved: row.draft } : r))
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
                <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                  row.meta.allowAudio ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                  {row.meta.allowAudio ? <Mic size={9} /> : <MicOff size={9} />}
                  {row.meta.allowAudio ? 'ניתן להקליט' : 'טקסט בלבד'}
                </span>
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
