'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { staffDisplayName } from '@/lib/staffInitials'
import { useRouter } from 'next/navigation'
import { Send, Loader2, MessageSquare, Mail, GitBranch } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// ─────────────────────────────────────────────────────────────────────────────
// שרשור הבירור עם היולדת.
//
// 🔴 עד כה לא הייתה דרך לברר מול יולדת שהתיק שלה ממתין לאישור מנהל:
// המזכיר שלח מייל מהתיבה הרגילה, והתשובה נעלמה מהתיק. עכשיו ההתכתבות
// יושבת בתיק — אותו רעיון בדיוק כמו בבירור ההלוואות.
//
// ⚠️ אפשר לצרף קישור אישי לתיקון סדר הדורות — הסיבה הנפוצה ביותר
// לבירור בתיק שממתין לאישור.
// ─────────────────────────────────────────────────────────────────────────────

interface Msg {
  id: string
  direction: 'staff' | 'applicant'
  body: string
  sender_name?: string | null
  created_at: string
}

// "14.07.26 23:49"
const fmt = (d: string) => {
  const t = new Date(d)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(t.getDate())}.${p(t.getMonth() + 1)}.${String(t.getFullYear()).slice(2)} ${p(t.getHours())}:${p(t.getMinutes())}`
}

export default function MaternityInquiryPanel({ aidId, motherName, hasEmail }: {
  aidId: string
  motherName?: string
  hasEmail: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [withLineage, setWithLineage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(`/api/admin/maternity/${aidId}/messages`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'טעינת ההתכתבות נכשלה')
      setMsgs(d.messages ?? [])
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    } finally {
      setLoading(false)
    }
  }, [aidId])

  // ⚠️ תלוי ב-aidId בלבד: load יציב (useCallback על aidId), ו-toast
  // נצרך רק בכישלון. תלות בהם הייתה מריצה את ה-effect בכל רינדור.
  useEffect(() => {
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().then(err => { if (alive && err) toast.error(err) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aidId])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs.length])

  const send = async () => {
    const body = text.trim()
    if (!body) return
    setSending(true)
    try {
      const res = await fetch(`/api/admin/maternity/${aidId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, extra: withLineage ? 'lineage' : 'none' }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'השליחה נכשלה')
      setText('')
      setWithLineage(false)
      toast.success('הבירור נשלח ליולדת')
      const err = await load()
      if (err) toast.error(err)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  // ⚠️ פאנל מוטבע ולא מודאל — כמו בבירור ההלוואות. השרשור צריך להיות
  // גלוי כל הזמן לצד פרטי התיק, לא מאחורי לחיצה: מזכיר שלא רואה שיש
  // תשובה ממתינה, לא עונה עליה.
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white" style={{ height: '70vh' }}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
            <MessageSquare size={16} className="text-pink-600" />
            בירור מול {motherName || 'היולדת'}
          </h2>
          {msgs.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {msgs.length} הודעות
            </span>
          )}
        </div>

        {/* השרשור */}
        <div className="flex flex-1 flex-col gap-3 overflow-y-auto bg-slate-50/50 px-4 py-4">
          {loading ? (
            <div className="flex h-full items-center justify-center text-slate-400">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : msgs.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <Mail size={26} className="text-slate-300" />
              <p className="text-sm leading-relaxed text-slate-500">
                טרם נשלחה הודעת בירור.
                <br />
                מה שתכתבו כאן יישלח ליולדת במייל, ותשובתה תחזור לשרשור הזה.
              </p>
            </div>
          ) : (
            msgs.map(m => {
              const isStaff = m.direction === 'staff'
              // ⚠️ ראשי תיבות ולא שם מלא: השרשור נחשף גם ליולדת, ואין
              // סיבה שתדע מי בדיוק מהמזכירות כתב לה.
              const who = isStaff ? staffDisplayName(m.sender_name, 'המזכירות') : (motherName || 'היולדת')
              return (
                <div key={m.id}
                  className={`flex max-w-[85%] flex-col ${isStaff ? 'items-end self-end' : 'items-start self-start'}`}>
                  <span className={`mb-1 px-1 text-[11px] font-semibold ${isStaff ? 'text-pink-700' : 'text-slate-600'}`}>
                    {who}
                  </span>
                  <div className={`rounded-2xl px-3.5 py-2.5 ${
                    isStaff
                      ? 'rounded-bl-md bg-pink-500 text-white'
                      : 'rounded-br-md border border-slate-200 bg-white text-slate-800'
                  }`}>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
                  </div>
                  <span className="mt-1 px-1 text-[10px] text-slate-400">{fmt(m.created_at)}</span>
                </div>
              )
            })
          )}
          <div ref={endRef} />
        </div>

        {/* הכתיבה */}
        <div className="border-t border-slate-200 p-3">
          {!hasEmail ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              למשפחה אין כתובת מייל רשומה — לא ניתן לשלוח בירור.
            </p>
          ) : (
            <>
              {/* ⚠️ תיקון סדר הדורות הוא הסיבה הנפוצה ביותר לבירור בתיק
                  שממתין לאישור, ולכן הקישור זמין בלחיצה ולא דורש ניסוח. */}
              <label className="mb-2 flex cursor-pointer items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5">
                <input type="checkbox" checked={withLineage}
                  onChange={e => setWithLineage(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600" />
                <GitBranch size={13} className="text-indigo-600" />
                <span className="text-xs font-medium text-indigo-800">צרף קישור לתיקון סדר הדורות</span>
              </label>

              <div className="flex items-end gap-2">
                <textarea
                  value={text} onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send() }}
                  placeholder="כתבו כאן את ההודעה ליולדת… (Ctrl+Enter לשליחה)"
                  rows={3}
                  className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500"
                />
                <button onClick={send} disabled={sending || !text.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-pink-600 px-3 py-2 text-sm font-semibold text-white hover:bg-pink-700 disabled:opacity-50 transition-colors">
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  שלח
                </button>
              </div>
            </>
          )}
        </div>
    </div>
  )
}
