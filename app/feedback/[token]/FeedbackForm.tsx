'use client'

import { useCallback, useEffect, useState } from 'react'
import Button from '@/components/ui/Button'

// ─────────────────────────────────────────────────────────────────────────────
// טופס משוב ציבורי — היולדת מדרגת את השהות בבית ההחלמה.
// ⚠️ אין להשתמש במילה "סקר" בשום טקסט שמוצג למשתמשת.
// ─────────────────────────────────────────────────────────────────────────────

const NAVY = '#1B3256'
const GOLD = '#C69D2D'

type QuestionType = 'scale' | 'text'

type Question = {
  id: string
  position: number
  text: string
  type: QuestionType
}

type LoadResponse = {
  questions?: Question[]
  submitted?: boolean
  recoveryHome?: string | null
  error?: string
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">{children}</div>
        <p className="mt-4 text-center text-xs text-slate-400">התשובות נשמרות באופן חסוי ומשמשות לשיפור השירות בלבד.</p>
      </div>
    </main>
  )
}

function Skeleton() {
  return (
    <Shell>
      <div className="animate-pulse space-y-6">
        <div className="h-7 w-2/3 rounded-lg bg-slate-200" />
        <div className="h-4 w-full rounded bg-slate-100" />
        <div className="h-4 w-4/5 rounded bg-slate-100" />
        <div className="space-y-4 pt-4">
          {[0, 1, 2].map(i => (
            <div key={i} className="space-y-3">
              <div className="h-4 w-1/2 rounded bg-slate-100" />
              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: 10 }, (_, n) => (
                  <div key={n} className="aspect-square rounded-full bg-slate-100" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="h-11 w-full rounded-xl bg-slate-200" />
      </div>
    </Shell>
  )
}

function ThankYou({ title }: { title: string }) {
  return (
    <Shell>
      <div className="py-6 text-center">
        <div
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: `${GOLD}1A` }}
        >
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke={GOLD} strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold" style={{ color: NAVY }}>{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          הדברים שלך עוזרים לנו לשפר את השירות עבור יולדות נוספות.
        </p>
      </div>
    </Shell>
  )
}

export default function FeedbackForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [recoveryHome, setRecoveryHome] = useState<string | null>(null)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)

  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [freeText, setFreeText] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(`/api/public/feedback?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
        const data: LoadResponse = await res.json().catch(() => ({}))
        if (cancelled) return

        if (!res.ok) {
          setLoadError(data.error || 'לא הצלחנו לטעון את הפרטים. נסי לרענן את העמוד.')
          return
        }

        const list = (data.questions ?? []).slice().sort((a, b) => a.position - b.position)
        setQuestions(list)
        setRecoveryHome(data.recoveryHome ?? null)
        setAlreadySubmitted(Boolean(data.submitted))
      } catch {
        if (!cancelled) setLoadError('אירעה תקלה בטעינה. נסי לרענן את העמוד.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [token])

  const submit = useCallback(async () => {
    setSubmitError(null)

    if (Object.keys(answers).length === 0 && !freeText.trim()) {
      setSubmitError('נשמח אם תסמני לפחות דירוג אחד או תכתבי לנו מילה.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/public/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, answers, freeText: freeText.trim() }),
      })
      const data: { ok?: boolean; error?: string } = await res.json().catch(() => ({}))

      if (!res.ok) {
        setSubmitError(data.error || 'השליחה נכשלה. נסי שוב בעוד רגע.')
        return
      }
      setDone(true)
    } catch {
      setSubmitError('אין חיבור לרשת. בדקי את החיבור ונסי שוב.')
    } finally {
      setSubmitting(false)
    }
  }, [token, answers, freeText])

  if (loading) return <Skeleton />

  if (loadError) {
    return (
      <Shell>
        <div className="py-6 text-center">
          <h1 className="text-xl font-bold" style={{ color: NAVY }}>אירעה תקלה</h1>
          <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{loadError}</p>
        </div>
      </Shell>
    )
  }

  if (alreadySubmitted) return <ThankYou title="כבר קיבלנו את דעתך, תודה רבה!" />
  if (done) return <ThankYou title="תודה רבה!" />

  const scaleQuestions = questions.filter(q => q.type === 'scale')
  const textQuestions = questions.filter(q => q.type === 'text')

  return (
    <Shell>
      <header className="border-b border-slate-100 pb-5">
        <h1 className="text-2xl font-bold leading-snug sm:text-3xl" style={{ color: NAVY }}>
          איך היה בבית ההחלמה?
        </h1>
        {recoveryHome && (
          <p className="mt-1.5 text-sm font-semibold" style={{ color: GOLD }}>{recoveryHome}</p>
        )}
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          לצורך ייעול ושיפור השירות, נשמח לשמוע ממך על טיב השירות שקיבלת. זה ייקח פחות מדקה.
        </p>
      </header>

      <div className="space-y-7 pt-6">
        {scaleQuestions.map(q => (
          <fieldset key={q.id}>
            <legend className="mb-3 text-sm font-semibold text-slate-800 sm:text-base">{q.text}</legend>

            <div className="grid grid-cols-10 gap-1">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
                const selected = answers[q.id] === n
                return (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} מתוך 10`}
                    aria-pressed={selected}
                    onClick={() => setAnswers(prev => ({ ...prev, [q.id]: n }))}
                    className={`flex aspect-square min-h-[2rem] w-full items-center justify-center rounded-full border text-xs font-bold transition-colors sm:text-sm ${
                      selected
                        ? 'border-transparent text-white'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100'
                    }`}
                    style={selected ? { backgroundColor: NAVY } : undefined}
                  >
                    {n}
                  </button>
                )
              })}
            </div>

            <div className="mt-1.5 flex justify-between text-[11px] text-slate-400">
              <span>בכלל לא</span>
              <span>מצוין</span>
            </div>
          </fieldset>
        ))}

        {textQuestions.map(q => (
          <div key={q.id}>
            <label htmlFor={`q-${q.id}`} className="mb-2 block text-sm font-semibold text-slate-800 sm:text-base">
              {q.text}
            </label>
            <textarea
              id={`q-${q.id}`}
              rows={4}
              maxLength={1000}
              value={freeText}
              onChange={e => setFreeText(e.target.value)}
              placeholder="אפשר לכתוב כאן בחופשיות…"
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
        ))}

        {textQuestions.length === 0 && (
          <div>
            <label htmlFor="free-text" className="mb-2 block text-sm font-semibold text-slate-800 sm:text-base">
              יש עוד משהו שתרצי לספר לנו?
            </label>
            <textarea
              id="free-text"
              rows={4}
              maxLength={1000}
              value={freeText}
              onChange={e => setFreeText(e.target.value)}
              placeholder="אפשר לכתוב כאן בחופשיות…"
              className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
        )}

        {submitError && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {submitError}
          </p>
        )}

        <Button
          type="button"
          size="lg"
          loading={submitting}
          onClick={submit}
          className="w-full !bg-none !text-white !shadow-sm hover:!-translate-y-0"
          style={{ backgroundColor: NAVY }}
        >
          {submitting ? 'שולח…' : 'שליחה'}
        </Button>
      </div>
    </Shell>
  )
}
