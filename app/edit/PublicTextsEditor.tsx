'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ArrowRight, Loader2, Check, AlertTriangle, RotateCcw, Pencil } from 'lucide-react'
import { PUBLIC_TEXT_GROUPS, textOf, type PublicTexts } from '@/lib/publicTexts'

// ─────────────────────────────────────────────────────────────────────────────
// עורך הנוסחים של הממשק הציבורי.
//
// פיילוט: מודל בקשת ההלוואה. כל שדה מציג את הנוסח האפקטיבי (ערוך או
// ברירת מחדל), וניתן לשחזר לברירת המחדל בלחיצה.
// ─────────────────────────────────────────────────────────────────────────────

export default function PublicTextsEditor({ initialTexts }: { initialTexts: PublicTexts }) {
  const [texts, setTexts] = useState<PublicTexts>(initialTexts ?? {})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // ההשוואה היא מול הנוסח שנטען מהשרת — כך "שמור" נדלק רק על שינוי אמיתי.
  const dirty = useMemo(
    () => JSON.stringify(texts) !== JSON.stringify(initialTexts ?? {}),
    [texts, initialTexts],
  )

  const setKey = (key: string, val: string) =>
    setTexts(prev => ({ ...prev, [key]: val }))

  const resetKey = (key: string) =>
    setTexts(prev => { const n = { ...prev }; delete n[key]; return n })

  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/public-texts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) {
        setMsg({ type: 'err', text: data.error || 'השמירה נכשלה' })
      } else {
        // השרת מחזיר את הנוסח אחרי הסינון — מסתנכרנים אליו, כדי שמה
        // שמוצג יהיה בדיוק מה שנשמר (ולא מה שהוקלד).
        setTexts(data.texts ?? {})
        setMsg({ type: 'ok', text: 'נשמר. הנוסח מעודכן באתר.' })
      }
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'שגיאת רשת' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-5 py-3 flex items-center gap-3">
          <Link href="/admin/dashboard" className="text-slate-400 hover:text-slate-600">
            <ArrowRight size={20} />
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <Pencil size={18} className="text-indigo-600" />
            <h1 className="font-bold text-slate-900">עריכת נוסחים — ממשק ציבורי</h1>
          </div>
          <button onClick={save} disabled={saving || !dirty}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {saving ? 'שומר...' : 'שמירה'}
          </button>
        </div>
        {msg && (
          <div className={`max-w-3xl mx-auto px-5 pb-3 text-sm flex items-center gap-2 ${msg.type === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
            {msg.type === 'ok' ? <Check size={15} /> : <AlertTriangle size={15} />}
            {msg.text}
          </div>
        )}
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6 flex flex-col gap-6">
        <p className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
          שלב ראשון: מודל בקשת ההלוואה. שדה שנשאר ריק מציג את נוסח ברירת המחדל —
          כך שמחיקה בטעות לא מעלימה טקסט מהאתר.
        </p>

        {PUBLIC_TEXT_GROUPS.map(group => (
          <section key={group.title} className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-slate-700">{group.title}</h2>

            {group.entries.map(entry => {
              const edited = texts[entry.key]
              const isEdited = typeof edited === 'string' && edited.trim() !== ''
              const value = isEdited ? edited : ''
              return (
                <div key={entry.key} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-600">{entry.hint ?? entry.key}</label>
                    {isEdited && (
                      <>
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 rounded px-1.5 py-0.5 font-medium">נערך</span>
                        <button type="button" onClick={() => resetKey(entry.key)}
                          title="שחזור לנוסח המקורי"
                          className="text-slate-400 hover:text-slate-600">
                          <RotateCcw size={13} />
                        </button>
                      </>
                    )}
                  </div>

                  {entry.multiline ? (
                    <textarea value={value} onChange={e => setKey(entry.key, e.target.value)}
                      placeholder={entry.fallback} rows={2}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                  ) : (
                    <input type="text" value={value} onChange={e => setKey(entry.key, e.target.value)}
                      placeholder={entry.fallback}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  )}

                  <p className="text-[11px] text-slate-400">
                    נוסח מקורי: {textOf(null, entry.key)}
                  </p>
                </div>
              )
            })}
          </section>
        ))}
      </main>
    </div>
  )
}
