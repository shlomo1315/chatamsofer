'use client'

import { useEffect, useState } from 'react'

const NAVY = '#1B3256'
const GOLD = '#C69D2D'
const MAX_CHARS = 1500

export default function GratitudeForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(true)
  const [submitted, setSubmitted] = useState(false)
  const [done, setDone] = useState(false)

  const [body, setBody] = useState('')
  const [signature, setSignature] = useState('')
  // ברירת מחדל: השם מופיע. הסרת הסימון הופכת את המכתב לאנונימי —
  // גם בתצוגה המקדימה וגם בשליחה.
  const [showName, setShowName] = useState(true)

  const [previewPdf, setPreviewPdf] = useState<string | null>(null)
  const [busy, setBusy] = useState<'preview' | 'send' | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/public/gratitude?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => setSubmitted(Boolean(d.submitted)))
      .catch(() => { /* דף חדש — נטפל בשליחה */ })
      .finally(() => setLoading(false))
  }, [token])

  async function send(preview: boolean) {
    if (!body.trim()) { setError('נא לכתוב את דברי הברכה'); return }
    setError('')
    setBusy(preview ? 'preview' : 'send')
    try {
      const res = await fetch('/api/public/gratitude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          body: body.trim(),
          signature: signature.trim(),
          isAnonymous: !showName,
          preview,
        }),
      })
      const data = await res.json()

      // כבר התקבל מכתב ללידה הזו (מכל מסלול) — הקישור אינו פעיל עוד
      if (data.alreadySubmitted) { setSubmitted(true); return }

      if (!res.ok) { setError(data.error ?? 'אירעה שגיאה'); return }

      if (preview) setPreviewPdf(data.pdf)
      else setDone(true)
    } catch {
      setError('אירעה שגיאה, נסו שוב')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <main dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse text-slate-400 text-sm">טוען…</div>
      </main>
    )
  }

  if (done || submitted) {
    return (
      <main dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 max-w-md w-full text-center">
          <div
            className="w-16 h-16 mx-auto mb-5 rounded-full flex items-center justify-center text-3xl"
            style={{ background: `${GOLD}18` }}
          >
            💌
          </div>
          <h1 className="text-2xl font-bold mb-3" style={{ color: NAVY }}>
            {done ? 'תודה רבה!' : 'כבר קיבלנו את מכתבכם'}
          </h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            דברי הברכה התקבלו אצלנו, ואנו נדאג להעבירם לנדיב.
            <br />
            תבורכו מן השמים.
          </p>
        </div>
      </main>
    )
  }

  const remaining = MAX_CHARS - body.length

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* כותרת */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold mb-2" style={{ color: NAVY }}>דברי ברכה</h1>
          <div className="w-16 h-0.5 mx-auto mb-3" style={{ background: GOLD }} />
          <p className="text-slate-500 text-sm">הכרת הטוב לנדיב שסייע</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          <p className="text-slate-600 text-sm leading-relaxed mb-6">
            הסיוע שקיבלתם התאפשר בזכות נדיב לב שבחר לתמוך ביולדות הקהילה — בעילום שם.
            כאן אפשר לכתוב לו כמה מילות ברכה והכרת הטוב.
          </p>

          {/* הברכה */}
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            דברי הברכה
          </label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value.slice(0, MAX_CHARS))}
            rows={9}
            placeholder="לכבוד הנדיב היקר…"
            className="w-full rounded-xl border border-slate-300 p-4 text-[15px] leading-relaxed
                       focus:outline-none focus:ring-2 focus:border-transparent resize-y"
            style={{ '--tw-ring-color': GOLD } as React.CSSProperties}
          />
          <div className="flex justify-end mt-1 mb-5">
            <span className={`text-xs ${remaining < 100 ? 'text-amber-600' : 'text-slate-400'}`}>
              נותרו {remaining} תווים
            </span>
          </div>

          {/* חתימה */}
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            חתימה <span className="font-normal text-slate-400">(איך לחתום על המכתב)</span>
          </label>
          <input
            type="text"
            value={signature}
            onChange={e => setSignature(e.target.value.slice(0, 60))}
            placeholder="למשל: משפחת כהן מבני ברק"
            className="w-full rounded-xl border border-slate-300 p-3 text-[15px]
                       focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ '--tw-ring-color': GOLD } as React.CSSProperties}
          />

          {/* אנונימיות */}
          <label className="flex items-start gap-3 mt-4 mb-6 cursor-pointer group">
            <input
              type="checkbox"
              checked={showName}
              onChange={e => setShowName(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 cursor-pointer"
              style={{ accentColor: NAVY }}
            />
            <span className="text-sm text-slate-600 leading-relaxed">
              אני מאשרת שיופיע שם המשפחה שלי במכתב.
              <span className="block text-xs text-slate-400 mt-0.5">
                {showName
                  ? 'להסרת הסימון — המכתב יישלח ללא שם, באופן אנונימי לחלוטין.'
                  : 'המכתב יישלח ללא שם, באופן אנונימי לחלוטין.'}
              </span>
            </span>
          </label>

          {error && (
            <div className="mb-4 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {/* כפתורים */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => send(false)}
              disabled={busy !== null || !body.trim()}
              className="flex-1 rounded-xl py-3.5 text-[15px] font-bold text-white transition
                         disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
              style={{ background: GOLD }}
            >
              {busy === 'send' ? 'שולח…' : 'שליחת דברי הברכה'}
            </button>
            <button
              type="button"
              onClick={() => send(true)}
              disabled={busy !== null || !body.trim()}
              className="sm:w-44 rounded-xl py-3.5 text-[15px] font-semibold border transition
                         disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              style={{ borderColor: NAVY, color: NAVY }}
            >
              {busy === 'preview' ? 'מכין…' : 'תצוגה מקדימה'}
            </button>
          </div>
        </div>

        {/* תצוגה מקדימה של השובר */}
        {previewPdf && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mt-5">
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-sm font-bold" style={{ color: NAVY }}>תצוגה מקדימה של המכתב</h2>
              <button
                onClick={() => setPreviewPdf(null)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                סגירה
              </button>
            </div>
            <iframe
              src={`data:application/pdf;base64,${previewPdf}`}
              className="w-full rounded-lg border border-slate-200"
              style={{ height: '70vh' }}
              title="תצוגה מקדימה"
            />
          </div>
        )}

        <p className="text-center text-xs text-slate-400 mt-6 leading-relaxed">
          אין חובה למלא טופס זה — רק מי שרוצה ומרגישה בכך.
        </p>
      </div>
    </main>
  )
}
