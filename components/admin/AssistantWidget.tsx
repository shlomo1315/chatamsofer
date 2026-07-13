'use client'
import { useState, useRef, useEffect } from 'react'
import { BrainCircuit, X, Send, Loader2, AlertCircle } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// עוזר AI — כפתור צף בכל מסכי הניהול.
// עונה רק על שאלות הנוגעות למערכת, וקורא נתונים בלבד (אינו משנה דבר).
// ─────────────────────────────────────────────────────────────────────────────

interface Msg { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS = [
  'מה ממתין לי לטיפול?',
  'כמה משפחות נרשמו השבוע?',
  'כמה בקשות הלוואה ממתינות לאישור?',
]

export default function AssistantWidget() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, busy])

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || busy) return

    const next: Msg[] = [...msgs, { role: 'user', content: q }]
    setMsgs(next)
    setInput('')
    setBusy(true)
    setErr('')

    try {
      const res = await fetch('/api/admin/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      })
      const d = await res.json()

      if (!res.ok) {
        setErr(d.error ?? 'שגיאה')
        return
      }
      setMsgs(m => [...m, { role: 'assistant', content: d.reply }])
    } catch {
      setErr('שגיאת תקשורת — נסה שוב')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {/* הכפתור הצף — שמאל למטה, עם הילה פועמת עדינה ותיאור במעבר עכבר */}
      {!open && (
        <div className="fixed bottom-6 left-6 z-40 group">
          {/* התיאור — מופיע במעבר עכבר */}
          <div className="absolute bottom-1/2 translate-y-1/2 left-full ml-3 whitespace-nowrap opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 pointer-events-none">
            <div className="bg-slate-900 text-white text-[13px] font-medium rounded-xl px-3.5 py-2.5 shadow-xl">
              לחצו כאן לפתיחת <span className="font-bold text-indigo-300">עוזר</span> — העוזר החכם שלי
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="פתיחת עוזר — העוזר החכם"
            className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 text-white shadow-xl shadow-indigo-500/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
          >
            {/* הילה פועמת — עדינה, לא מסיחה */}
            <span className="absolute inset-0 rounded-2xl bg-indigo-500 opacity-40 animate-ping-slow" />
            <BrainCircuit size={26} className="relative z-10" strokeWidth={1.75} />
          </button>
        </div>
      )}

      {/* חלון הצ'אט */}
      {open && (
        <div className="fixed bottom-6 left-6 z-40 w-[min(400px,calc(100vw-3rem))] h-[min(560px,calc(100vh-6rem))] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          {/* כותרת */}
          <div className="bg-gradient-to-l from-indigo-600 to-violet-600 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-white">
              <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                <BrainCircuit size={17} strokeWidth={1.75} />
              </div>
              <div>
                <p className="font-bold text-sm leading-tight">עוזר</p>
                <p className="text-indigo-200 text-[11px]">העוזר החכם · שאל אותי על המערכת</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X size={17} />
            </button>
          </div>

          {/* השיחה */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3 bg-slate-50/60">
            {msgs.length === 0 && (
              <div className="flex flex-col gap-2.5">
                {/* ברכת פתיחה — מוצגת מיד, כמו הודעה ראשונה בשיחה */}
                <div className="self-end max-w-[90%] bg-white border border-slate-200 rounded-2xl rounded-bl-md px-3.5 py-3 text-sm leading-relaxed text-slate-800">
                  שלום, שמי <span className="font-bold text-indigo-700">עוזר</span> ואני אשמח לעזור לך.
                  <br />
                  במה היית רוצה להתמקד כרגע?
                </div>

                <p className="text-xs text-slate-400 font-semibold mt-2">אפשר להתחיל מכאן:</p>
                {SUGGESTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-right text-sm text-indigo-700 bg-white border border-indigo-100 rounded-xl px-3 py-2.5 hover:border-indigo-300 hover:bg-indigo-50/50 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {msgs.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'self-start bg-indigo-600 text-white rounded-br-md'
                    : 'self-end bg-white border border-slate-200 text-slate-800 rounded-bl-md'
                }`}
              >
                {m.content}
              </div>
            ))}

            {busy && (
              <div className="self-end bg-white border border-slate-200 rounded-2xl rounded-bl-md px-3.5 py-2.5">
                <Loader2 size={15} className="animate-spin text-indigo-500" />
              </div>
            )}

            {err && (
              <div className="self-end flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 max-w-[85%]">
                <AlertCircle size={13} className="shrink-0 mt-0.5" /> {err}
              </div>
            )}

            <div ref={endRef} />
          </div>

          {/* שורת הקלט */}
          <form
            onSubmit={e => { e.preventDefault(); send(input) }}
            className="border-t border-slate-200 p-3 flex items-center gap-2 bg-white"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="שאל שאלה על המערכת..."
              disabled={busy}
              className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 focus:bg-white transition-all disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="w-10 h-10 shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  )
}
