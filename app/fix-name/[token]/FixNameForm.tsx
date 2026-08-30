'use client'
import { useState } from 'react'
import { Loader2, CheckCircle2, Baby } from 'lucide-react'

const NON_HEBREW_NAME_CHARS = /[^א-ת ׳״'"-]/g

// טופס ציבורי — היולדת מזינה / מתקנת את שם התינוק דרך הקישור האישי שקיבלה במייל.
interface BabySlot { name: string | null; label: string }

// טופס ציבורי — היולדת מזינה / מתקנת את שם התינוק דרך הקישור האישי שקיבלה במייל.
//
// ⚠️ שדה לכל תינוק: ליולדת תאומים הוצג שדה אחד בלבד, והתאום השני נשאר בלי
// שם. כל שדה מסומן בת"ז של אותו תינוק — בלעדיה אי אפשר לדעת איזה שם למי.
export default function FixNameForm({ token, currentName, babies }: { token: string; currentName: string; babies?: BabySlot[] }) {
  const slots: BabySlot[] = babies?.length ? babies : [{ name: currentName || null, label: '' }]
  const isTwins = slots.length > 1
  const [names, setNames] = useState<string[]>(slots.map(b => b.name ?? ''))
  const setNameAt = (i: number, v: string) => setNames(prev => prev.map((n, j) => (j === i ? v : n)))
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  // חלון אישור לפני שמירה — "האם אתם בטוחים בשם" (כמו בטופס הבקשה)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // לחיצה על "שמירה" פותחת קודם חלון אישור; האישור עצמו קורא ל-doSubmit
  const cleaned = () => names.map(n => n.replace(NON_HEBREW_NAME_CHARS, '').trim())

  const askConfirm = () => {
    // ⚠️ די בשם אחד: יולדת תאומים רשאית להשלים תאום אחד עכשיו ואת השני בהמשך.
    if (!cleaned().some(Boolean)) { setErr('יש להזין שם תקין (אותיות עבריות בלבד)'); return }
    setErr(''); setConfirmOpen(true)
  }

  const submit = async () => {
    setConfirmOpen(false)
    const list = cleaned()
    if (!list.some(Boolean)) { setErr('יש להזין שם תקין (אותיות עבריות בלבד)'); return }
    setErr(''); setSaving(true)
    try {
      const res = await fetch('/api/public/fix-name', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // name נשלח לצד names לתאימות לאחור עם גרסת שרת ישנה.
        body: JSON.stringify({ token, names: list, name: list[0] }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) { setErr(data.error || 'השמירה נכשלה'); setSaving(false); return }
      setDone(true)
    } catch {
      setErr('שגיאת רשת — נסו שוב')
      setSaving(false)
    }
  }

  if (done) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
            <CheckCircle2 size={36} className="text-green-600" />
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#1B3256' }}>
            {isTwins ? 'השמות נקלטו בהצלחה!' : 'השם נקלט בהצלחה!'}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            תודה רבה. {isTwins ? 'שמות התינוקות עודכנו במערכת' : 'שם התינוק עודכן במערכת'}. אין צורך בפעולה נוספת.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-slate-100 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100">
            <Baby size={28} className="text-indigo-600" />
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#1B3256' }}>
            {isTwins ? 'השלמת שמות התינוקות' : 'השלמת שם התינוק'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {isTwins
              ? 'נא להזין את שם כל תינוק בנפרד, לפי מספר הזהות המופיע ליד כל שדה. ניתן להשלים שם אחד כעת ואת השני בהמשך.'
              : 'נא להזין את שם התינוק המדויק. השם ייקלט מיד במערכת האיגוד.'}
          </p>
        </div>

        {/* שדה לכל תינוק. בתאומים כל שדה נושא את ת"ז התינוק — בלעדיה
            אי אפשר לדעת איזה שם שייך למי. */}
        <div className="flex flex-col gap-4">
          {slots.map((slot, i) => (
            <div key={i}>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">
                {isTwins ? slot.label : 'שם התינוק'}
              </label>
              <input
                value={names[i] ?? ''}
                onChange={e => {
                  // סינון תוך כדי הקלדה — אותיות עבריות בלבד. מספרים/לועזית לא נכנסים כלל,
                  // כדי שהמשתמש לא יזין שם פסול ורק בשליחה יגלה שנחסם.
                  setNameAt(i, e.target.value.replace(NON_HEBREW_NAME_CHARS, ''))
                  if (err) setErr('')
                }}
                onKeyDown={e => e.key === 'Enter' && askConfirm()}
                placeholder={isTwins ? 'שם התינוק' : 'שם התינוק'}
                inputMode="text"
                autoFocus={i === 0}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ))}
        </div>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

        <button
          onClick={askConfirm}
          disabled={saving || !names.some(n => n.trim())}
          className="mt-5 w-full flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-3 transition-all"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          {isTwins ? 'שמירת השמות' : 'שמירת השם'}
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">אותיות עבריות בלבד.</p>
      </div>

      {/* חלון אישור — "האם אתם בטוחים בשם", למניעת שמירת שם שגוי */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-l from-indigo-500 to-indigo-700 px-6 py-4">
              <h2 className="text-white font-bold text-lg">אישור שם התינוק</h2>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                {isTwins
                  ? 'האם אלו השמות המדויקים? השמות ייקלטו במערכת כפי שהוזנו.'
                  : 'האם אתם בטוחים שזהו השם המדויק של התינוק? השם ייקלט במערכת כפי שהוזן.'}
              </p>
              {/* בתאומים מוצג כל שם לצד ת"ז התינוק שלו — האישור האחרון
                  לפני שמירה הוא המקום שבו מתגלה החלפה בין השניים. */}
              <div className="flex flex-col gap-2">
                {slots.map((slot, i) => {
                  const v = (names[i] ?? '').replace(NON_HEBREW_NAME_CHARS, '').trim()
                  if (!v) return null
                  return (
                    <div key={i} className="rounded-xl border-2 border-indigo-200 bg-indigo-50 px-4 py-3 text-center">
                      {isTwins && <p className="text-xs font-semibold text-indigo-500 mb-1">{slot.label}</p>}
                      <p className="text-xl font-black text-indigo-900">{v}</p>
                    </div>
                  )
                })}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => setConfirmOpen(false)}
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                  חזרה לתיקון
                </button>
                <button onClick={submit} disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-white">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} כן, זהו השם
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
