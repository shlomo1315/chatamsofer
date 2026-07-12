'use client'

// טבלת המשוב על בתי ההחלמה + כרטיסי סיכום לכל בית החלמה.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Star, Globe, Mail, X, Home, MessageSquare, Trash2, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

export interface SurveyQuestion {
  id: string
  position: number
  text: string
  type: 'scale' | 'text'
}

export interface FeedbackRow {
  id: string
  maternity_aid_id: string | null
  recovery_home: string | null
  source: 'web' | 'email'
  answers: Record<string, number> | null
  free_text: string | null
  created_at: string
  aid: {
    beneficiary?: { family_name?: string | null; spouse_name?: string | null; full_name?: string | null } | null
  } | null
}

const SOURCE_META: Record<string, { label: string; icon: typeof Globe; color: string }> = {
  web: { label: 'טופס באתר', icon: Globe, color: 'text-sky-600 bg-sky-50' },
  email: { label: 'תשובה במייל', icon: Mail, color: 'text-violet-600 bg-violet-50' },
}

/** צבע לפי הסקאלה: 8+ ירוק · 6–8 ענבר · מתחת ל-6 אדום */
function scoreTone(score: number) {
  if (score >= 8) return { text: 'text-emerald-700', bg: 'bg-emerald-100', bar: 'bg-emerald-500', ring: 'border-emerald-200' }
  if (score >= 6) return { text: 'text-amber-700', bg: 'bg-amber-100', bar: 'bg-amber-500', ring: 'border-amber-200' }
  return { text: 'text-rose-700', bg: 'bg-rose-100', bar: 'bg-rose-500', ring: 'border-rose-200' }
}

function avgOf(nums: number[]): number | null {
  const vals = nums.filter(v => typeof v === 'number' && !isNaN(v))
  if (!vals.length) return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
}

function rowAvg(row: FeedbackRow): number | null {
  return avgOf(Object.values(row.answers ?? {}))
}

function motherName(row: FeedbackRow): string {
  const b = row.aid?.beneficiary
  if (!b) return '—'
  return [b.family_name, b.spouse_name || b.full_name].filter(Boolean).join(' ') || '—'
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('he-IL')
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function FeedbackTable({ rows, questions }: { rows: FeedbackRow[]; questions: SurveyQuestion[] }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState<FeedbackRow | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  /** מחיקת משוב. אחרי המחיקה הקישור חוזר להיות פעיל והיולדת תוכל למלא מחדש. */
  async function remove(id: string, name: string) {
    if (!confirm(`למחוק את המשוב של ${name}?\nהיולדת תוכל למלא מחדש.`)) return

    setDeleting(id)
    try {
      const res = await fetch(`/api/admin/maternity/feedback/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'המחיקה נכשלה')

      toast.success('המשוב נמחק')
      setOpen(null)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setDeleting(null)
    }
  }

  const scaleQuestions = useMemo(() => questions.filter(q => q.type === 'scale'), [questions])

  // סיכום לכל בית החלמה — ממוצע כללי + ממוצע לכל שאלה
  const summaries = useMemo(() => {
    const byHome = new Map<string, FeedbackRow[]>()
    for (const r of rows) {
      const home = r.recovery_home?.trim() || 'ללא בית החלמה'
      const list = byHome.get(home)
      if (list) list.push(r)
      else byHome.set(home, [r])
    }
    return [...byHome.entries()]
      .map(([home, list]) => ({
        home,
        count: list.length,
        avg: avgOf(list.flatMap(r => Object.values(r.answers ?? {}))),
        perQuestion: scaleQuestions.map(q => ({
          q,
          avg: avgOf(list.map(r => r.answers?.[q.id]).filter((v): v is number => typeof v === 'number')),
        })),
      }))
      .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
  }, [rows, scaleQuestions])

  if (!rows.length) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <Star size={28} className="text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 text-sm">עדיין לא התקבלו תשובות</p>
        <p className="text-slate-400 text-xs mt-1">
          המשוב נשלח 5 ימים אחרי שבית ההחלמה מסמן שהיולדת הגיעה.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* כרטיסי סיכום לכל בית החלמה */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        {summaries.map(s => {
          const tone = scoreTone(s.avg ?? 0)
          return (
            <div key={s.home} className={`rounded-2xl border bg-white p-5 ${s.avg != null ? tone.ring : 'border-slate-200'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-1.5 font-bold truncate" style={{ color: '#1B3256' }}>
                    <Home size={15} className="text-sky-600 flex-shrink-0" />
                    <span className="truncate">{s.home}</span>
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-400">{s.count} תשובות</p>
                </div>
                <span className={`flex-shrink-0 text-3xl font-black leading-none ltr-num ${s.avg != null ? tone.text : 'text-slate-300'}`}>
                  {s.avg != null ? s.avg.toFixed(1) : '—'}
                </span>
              </div>

              {s.perQuestion.length > 0 && (
                <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3">
                  {s.perQuestion.map(({ q, avg }) => {
                    const qTone = scoreTone(avg ?? 0)
                    return (
                      <div key={q.id} className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500 truncate">{q.text}</span>
                        <span className={`flex-shrink-0 text-[11px] font-bold ltr-num ${avg != null ? qTone.text : 'text-slate-300'}`}>
                          {avg != null ? avg.toFixed(1) : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* טבלת התשובות */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-right text-xs text-slate-500">
              <th className="px-4 py-3 font-semibold">תאריך</th>
              <th className="px-4 py-3 font-semibold">שם היולדת</th>
              <th className="px-4 py-3 font-semibold">בית החלמה</th>
              <th className="px-4 py-3 font-semibold">ציון ממוצע</th>
              <th className="px-4 py-3 font-semibold">מקור</th>
              <th className="px-4 py-3 font-semibold">הערות</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(row => {
              const avg = rowAvg(row)
              const tone = scoreTone(avg ?? 0)
              const meta = SOURCE_META[row.source] ?? SOURCE_META.web
              const Icon = meta.icon
              return (
                <tr key={row.id} onClick={() => setOpen(row)} className="hover:bg-slate-50 cursor-pointer transition">
                  <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDate(row.created_at)}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800 whitespace-nowrap">{motherName(row)}</td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{row.recovery_home || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ltr-num ${
                      avg != null ? `${tone.bg} ${tone.text}` : 'bg-slate-100 text-slate-400'
                    }`}>
                      {avg != null ? avg.toFixed(1) : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium ${meta.color}`}>
                      <Icon size={13} />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs">
                    <span className="line-clamp-1">{row.free_text || '—'}</span>
                  </td>

                  {/* מחיקה — עוצר את ה-propagation כדי שלא ייפתח המודל */}
                  <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                    {deleting === row.id ? (
                      <Loader2 size={15} className="animate-spin text-slate-400" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => remove(row.id, motherName(row))}
                        title="מחיקת המשוב"
                        className="rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* מודל — כל התשובות המפורטות */}
      {open && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4" onClick={() => setOpen(null)}>
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="min-w-0">
                <h2 className="font-bold truncate" style={{ color: '#1B3256' }}>{motherName(open)}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {fmtDateTime(open.created_at)} · {(SOURCE_META[open.source] ?? SOURCE_META.web).label}
                  {open.recovery_home ? ` · ${open.recovery_home}` : ''}
                </p>
              </div>
              <button onClick={() => setOpen(null)} aria-label="סגור" className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-4">
              {(() => {
                const avg = rowAvg(open)
                const tone = scoreTone(avg ?? 0)
                return (
                  <div className={`flex items-center gap-4 rounded-2xl border bg-white p-4 ${avg != null ? tone.ring : 'border-slate-200'}`}>
                    <div className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl ${avg != null ? tone.bg : 'bg-slate-100'}`}>
                      <span className={`text-2xl font-black ltr-num ${avg != null ? tone.text : 'text-slate-400'}`}>
                        {avg != null ? avg.toFixed(1) : '—'}
                      </span>
                    </div>
                    <div>
                      <p className="flex items-center gap-1.5 font-bold" style={{ color: '#1B3256' }}>
                        <Star size={15} className="text-amber-500" /> ציון כולל
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">ממוצע כל התשובות (מתוך 10)</p>
                    </div>
                  </div>
                )
              })()}

              {scaleQuestions.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-4 font-bold" style={{ color: '#1B3256' }}>פירוט התשובות</h3>
                  <div className="flex flex-col gap-4">
                    {scaleQuestions.map(q => {
                      const score = open.answers?.[q.id]
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

              {open.free_text && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <h3 className="mb-2 flex items-center gap-1.5 font-bold" style={{ color: '#1B3256' }}>
                    <MessageSquare size={15} className="text-slate-400" /> הערות היולדת
                  </h3>
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">{open.free_text}</p>
                </div>
              )}

              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                {open.maternity_aid_id ? (
                  <a href={`/admin/maternity/${open.maternity_aid_id}`}
                     className="text-xs font-semibold text-indigo-600 hover:underline">
                    לכרטסת הלידה ←
                  </a>
                ) : <span />}

                <button
                  type="button"
                  onClick={() => remove(open.id, motherName(open))}
                  disabled={deleting === open.id}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white
                             px-3.5 py-2 text-xs font-bold text-rose-600 transition
                             hover:bg-rose-50 disabled:opacity-40"
                >
                  {deleting === open.id
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Trash2 size={14} />}
                  מחיקת המשוב
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
