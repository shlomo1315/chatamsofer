'use client'

// טאב "משוב" בכרטסת היולדת — מציג את תשובות שאלון בית ההחלמה (אם התקבלו).
// המשוב נשלח אוטומטית 5 ימים אחרי שבית ההחלמה מסמן שהיולדת הגיעה.
import { useEffect, useState, useCallback } from 'react'
import { Star, Loader2, Globe, Mail, Home, MessageSquare } from 'lucide-react'

interface Feedback {
  id: string
  source: 'web' | 'email'
  answers: Record<string, number>
  free_text: string | null
  recovery_home: string | null
  created_at: string
}

interface Question {
  id: string
  position: number
  text: string
  type: 'scale' | 'text'
}

const SOURCE_LABEL: Record<string, string> = { web: 'טופס באתר', email: 'תשובה במייל' }
const SOURCE_ICON: Record<string, typeof Globe> = { web: Globe, email: Mail }

/** צבע לפי הסקאלה: 8+ ירוק · 6–8 ענבר · מתחת ל-6 אדום */
export function scoreTone(score: number) {
  if (score >= 8) return { text: 'text-emerald-700', bg: 'bg-emerald-100', bar: 'bg-emerald-500', ring: 'border-emerald-200' }
  if (score >= 6) return { text: 'text-amber-700', bg: 'bg-amber-100', bar: 'bg-amber-500', ring: 'border-amber-200' }
  return { text: 'text-rose-700', bg: 'bg-rose-100', bar: 'bg-rose-500', ring: 'border-rose-200' }
}

/** ממוצע התשובות המספריות, מעוגל לעשירית. null אם אין תשובות */
export function avgScore(answers: Record<string, number> | null | undefined): number | null {
  const vals = Object.values(answers ?? {}).filter(v => typeof v === 'number' && !isNaN(v))
  if (!vals.length) return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function FeedbackTab({ aidId }: { aidId: string }) {
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/maternity/gratitude-status?aidId=${aidId}`)
      if (res.ok) {
        const d = await res.json()
        setFeedback(d.feedback ?? null)
        setQuestions(d.questions ?? [])
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [aidId])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="py-10 text-center text-slate-400"><Loader2 className="animate-spin inline" size={18} /></div>
  }

  if (!feedback) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
        <Star size={24} className="text-slate-300 mx-auto mb-2" />
        <p className="text-sm font-semibold text-slate-600">טרם התקבל משוב</p>
        <p className="mt-1 text-xs text-slate-400">
          המשוב נשלח 5 ימים אחרי שבית ההחלמה מסמן שהיולדת הגיעה
        </p>
      </div>
    )
  }

  const avg = avgScore(feedback.answers)
  const tone = scoreTone(avg ?? 0)
  const SourceIcon = SOURCE_ICON[feedback.source] ?? Globe
  const scaleQuestions = questions.filter(q => q.type === 'scale')

  return (
    <div className="flex flex-col gap-4">
      {/* כרטיס ציון כולל */}
      <div className={`rounded-2xl border bg-white p-5 ${avg != null ? tone.ring : 'border-slate-200'}`}>
        <div className="flex items-center gap-4">
          <div className={`flex h-20 w-20 flex-shrink-0 flex-col items-center justify-center rounded-2xl ${avg != null ? tone.bg : 'bg-slate-100'}`}>
            <span className={`text-3xl font-black leading-none ltr-num ${avg != null ? tone.text : 'text-slate-400'}`}>
              {avg != null ? avg.toFixed(1) : '—'}
            </span>
            <span className={`mt-1 text-[10px] font-semibold ${avg != null ? tone.text : 'text-slate-400'}`}>מתוך 10</span>
          </div>
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 font-bold" style={{ color: '#1B3256' }}>
              <Star size={16} className="text-amber-500" />
              ציון כולל
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              התקבל ב-{fmtDateTime(feedback.created_at)}
            </p>
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
              <SourceIcon size={12} />
              {SOURCE_LABEL[feedback.source] ?? feedback.source}
            </p>
            {feedback.recovery_home && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
                <Home size={12} className="text-sky-600" />
                {feedback.recovery_home}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* פירוט השאלות */}
      {scaleQuestions.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="mb-4 font-bold" style={{ color: '#1B3256' }}>פירוט התשובות</h3>
          <div className="flex flex-col gap-4">
            {scaleQuestions.map(q => {
              const score = feedback.answers?.[q.id]
              const has = typeof score === 'number' && !isNaN(score)
              const qTone = scoreTone(has ? score : 0)
              return (
                <div key={q.id}>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="text-sm text-slate-700">{q.text}</span>
                    <span className={`flex-shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold ltr-num ${
                      has ? `${qTone.bg} ${qTone.text}` : 'bg-slate-100 text-slate-400'
                    }`}>
                      {has ? score : '—'}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    {has && (
                      <div
                        className={`h-1.5 rounded-full ${qTone.bar}`}
                        style={{ width: `${Math.min(100, Math.max(0, score * 10))}%` }}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* טקסט חופשי */}
      {feedback.free_text && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h3 className="mb-2 flex items-center gap-1.5 font-bold" style={{ color: '#1B3256' }}>
            <MessageSquare size={15} className="text-slate-400" />
            הערות היולדת
          </h3>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">{feedback.free_text}</p>
        </div>
      )}
    </div>
  )
}
