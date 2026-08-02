'use client'
import { useState } from 'react'
import { Loader2, CheckCircle2, Baby } from 'lucide-react'

const NON_HEBREW_NAME_CHARS = /[^א-ת ׳״'"-]/g

// טופס ציבורי — היולדת מזינה / מתקנת את שם התינוק דרך הקישור האישי שקיבלה במייל.
export default function FixNameForm({ token, currentName }: { token: string; currentName: string }) {
  const [name, setName] = useState(currentName)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    const clean = name.replace(NON_HEBREW_NAME_CHARS, '').trim()
    if (!clean) { setErr('יש להזין שם תקין (אותיות עבריות בלבד)'); return }
    setErr(''); setSaving(true)
    try {
      const res = await fetch('/api/public/fix-name', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name: clean }),
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
          <h1 className="text-xl font-bold" style={{ color: '#1B3256' }}>השם נקלט בהצלחה!</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            תודה רבה. שם התינוק עודכן במערכת. אין צורך בפעולה נוספת.
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
          <h1 className="text-xl font-bold" style={{ color: '#1B3256' }}>השלמת שם התינוק</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            נא להזין את שם התינוק המדויק. השם ייקלט מיד במערכת האיגוד.
          </p>
        </div>

        <label className="block text-sm font-medium text-slate-600 mb-1.5">שם התינוק</label>
        <input
          value={name}
          onChange={e => {
            // סינון תוך כדי הקלדה — אותיות עבריות בלבד. מספרים/לועזית לא נכנסים כלל,
            // כדי שהמשתמש לא יזין שם פסול ורק בשליחה יגלה שנחסם.
            const clean = e.target.value.replace(NON_HEBREW_NAME_CHARS, '')
            setName(clean)
            if (err) setErr('')
          }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="שם התינוק"
          inputMode="text"
          autoFocus
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}

        <button
          onClick={submit}
          disabled={saving || !name.trim()}
          className="mt-5 w-full flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-3 transition-all"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
          שמירת השם
        </button>

        <p className="mt-4 text-center text-xs text-slate-400">אותיות עבריות בלבד.</p>
      </div>
    </main>
  )
}
