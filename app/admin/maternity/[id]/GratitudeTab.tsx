'use client'

// טאב "מכתבי ברכה" בכרטסת היולדת — מציג את המכתב שהתקבל (אם התקבל),
// ומאפשר לשלוח ידנית את בקשת המכתב או את בקשת המשוב, בלי להמתין לתזמון.
import { useEffect, useState, useCallback } from 'react'
import { Heart, Send, Loader2, Globe, Mail, FileImage, Clock, CheckCircle2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface Letter {
  id: string
  source: 'web' | 'email' | 'scan'
  body: string | null
  signature: string | null
  is_anonymous: boolean
  scan_url: string | null
  status: 'received' | 'approved' | 'rejected'
  created_at: string
}

interface Scheduled {
  kind: string
  status: string
  send_after: string
  sent_at: string | null
}

const SOURCE_LABEL = { web: 'טופס באתר', email: 'תשובה במייל', scan: 'שובר סרוק' } as const
const SOURCE_ICON = { web: Globe, email: Mail, scan: FileImage } as const

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('he-IL')
}

/** תאריך + שעה — לתצוגת מועד השליחה בפועל */
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function GratitudeTab({ aidId }: { aidId: string }) {
  const toast = useToast()
  const [letter, setLetter] = useState<Letter | null>(null)
  const [scheduled, setScheduled] = useState<Scheduled[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/maternity/gratitude-status?aidId=${aidId}`)
      if (res.ok) {
        const d = await res.json()
        setLetter(d.letter ?? null)
        setScheduled(d.scheduled ?? [])
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [aidId])

  useEffect(() => { load() }, [load])

  async function send(kind: 'gratitude_letter' | 'recovery_survey') {
    setSending(kind)
    try {
      const res = await fetch('/api/admin/maternity/send-gratitude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aidId, kind }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שליחה נכשלה')
      toast.success(`המייל נשלח אל ${d.email}`)
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setSending(null)
    }
  }

  if (loading) {
    return <div className="py-10 text-center text-slate-400"><Loader2 className="animate-spin inline" size={18} /></div>
  }

  const gratitudeJob = scheduled.find(s => s.kind === 'gratitude_letter')
  const surveyJob = scheduled.find(s => s.kind === 'recovery_survey')
  const SourceIcon = letter ? SOURCE_ICON[letter.source] : Heart

  return (
    // פריסה רחבה — המכתב והשליחה הידנית זה לצד זה במסכים רחבים
    <div className="grid gap-4 lg:grid-cols-2 items-start">
      {/* המכתב שהתקבל */}
      {letter ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
          <div className="flex items-center gap-2 mb-3">
            <SourceIcon size={16} className="text-amber-700" />
            <span className="font-bold text-slate-800">התקבל מכתב ברכה</span>
            <span className="text-xs text-slate-400">
              {SOURCE_LABEL[letter.source]} · {fmt(letter.created_at)}
              {letter.is_anonymous && ' · אנונימי'}
            </span>
          </div>

          {letter.body && (
            <div className="rounded-xl bg-white border border-amber-100 p-4">
              <p className="text-slate-700 text-[15px] leading-relaxed whitespace-pre-wrap">{letter.body}</p>
              {letter.signature && (
                <p className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-500">
                  בכבוד רב, <strong className="text-slate-700">{letter.signature}</strong>
                </p>
              )}
            </div>
          )}

          {letter.scan_url && (
            <a href={letter.scan_url} target="_blank" rel="noreferrer"
               className="block rounded-xl overflow-hidden border border-amber-100 mt-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={letter.scan_url} alt="שובר סרוק" className="w-full" />
            </a>
          )}

          <a href="/admin/maternity/gratitude"
             className="inline-block mt-3 text-xs font-semibold text-amber-700 hover:underline">
            לניהול מכתבי הברכה ←
          </a>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <Heart size={22} className="text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">טרם התקבל מכתב ברכה</p>
        </div>
      )}

      {/* שליחה ידנית */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-bold text-slate-800 mb-1">שליחה ידנית</h3>
        <p className="text-xs text-slate-500 mb-4">
          המיילים נשלחים אוטומטית (מכתב ברכה — 10 ימים מאישור הלידה; משוב — 5 ימים מסימון ההגעה).
          כאן אפשר לשלוח מיד, או לשלוח שוב.
        </p>

        <div className="flex flex-col gap-3">
          <JobRow
            title="בקשת מכתב ברכה לנדיב"
            job={gratitudeJob}
            busy={sending === 'gratitude_letter'}
            disabled={sending !== null}
            onSend={() => send('gratitude_letter')}
          />
          <JobRow
            title="בקשת משוב על בית ההחלמה"
            job={surveyJob}
            busy={sending === 'recovery_survey'}
            disabled={sending !== null}
            onSend={() => send('recovery_survey')}
          />
        </div>
      </div>
    </div>
  )
}

function JobRow({ title, job, busy, disabled, onSend }: {
  title: string
  job?: Scheduled
  busy: boolean
  disabled: boolean
  onSend: () => void
}) {
  const sent = job?.status === 'sent'
  const pending = job?.status === 'pending'

  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
      sent ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200'
    }`}>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-700">{title}</div>
        <div className="mt-1 flex items-center gap-1 text-xs">
          {sent ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5
                             font-semibold text-emerald-700">
              <CheckCircle2 size={12} />
              נשלח ב-{fmtDateTime(job!.sent_at)}
            </span>
          ) : pending ? (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <Clock size={12} />
              מתוזמן ל-{fmt(job!.send_after)}
            </span>
          ) : (
            <span className="text-slate-400">לא מתוזמן</span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onSend}
        disabled={disabled}
        className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white
                   px-3.5 py-2 text-xs font-bold text-indigo-700 transition
                   hover:bg-indigo-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        {busy ? 'שולח…' : sent ? 'שליחה חוזרת' : 'שלח עכשיו'}
      </button>
    </div>
  )
}
