'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { MessageSquare, Send, Loader2, User } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// "צ'אט" תיעוד המשפחה — שרשור הערות פנימיות של הצוות, כרונולוגי, עם שם הכותב
// ותאריך ליד כל הודעה. כל חבר צוות יכול להוסיף הערה; ההערות נשמרות לצמיתות.
// ─────────────────────────────────────────────────────────────────────────────

// אירוע גלובלי לרענון התיעוד — נורה אחרי פעולה שכותבת תיעוד בשרת
export const NOTES_CHANGED_EVENT = 'beneficiary-notes-changed'

interface Note {
  id: string
  body: string
  author_id: string | null
  author_name: string | null
  created_at: string
}

function fmtWhen(iso: string): string {
  try {
    const d = new Date(iso)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
  } catch { return iso }
}

export default function BeneficiaryNotesChat({ beneficiaryId }: { beneficiaryId: string }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/beneficiary-notes?beneficiaryId=${beneficiaryId}`)
      const d = await r.json()
      setNotes(Array.isArray(d.notes) ? d.notes : [])
      if (d.currentUserId) setCurrentUserId(d.currentUserId)
    } catch { /* נשאר ריק */ }
    setLoading(false)
  }, [beneficiaryId])

  useEffect(() => { load() }, [load])

  // ⚠️ תיעוד שנכתב ע"י המערכת (השלמת מסמכים, דחייה) נוצר בשרת, ו-router.refresh
  // אינו מריץ מחדש אפקטים של רכיבי לקוח — כלומר ההערה נשמרה אך לא הופיעה עד
  // רענון ידני, וזה נראה בדיוק כמו "התיעוד לא נכנס". מאזינים לאירוע ומרעננים.
  useEffect(() => {
    const onChanged = () => { void load() }
    window.addEventListener(NOTES_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(NOTES_CHANGED_EVENT, onChanged)
  }, [load])

  // גלילה לתחתית (ההודעה החדשה) כשמתווספת הודעה
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [notes])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true); setError('')
    try {
      const r = await fetch('/api/admin/beneficiary-notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiaryId, body: text }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'שמירת ההערה נכשלה'); setSending(false); return }
      if (d.note) setNotes(prev => [...prev, d.note])
      setInput('')
    } catch { setError('שגיאת רשת') }
    setSending(false)
  }

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
        <MessageSquare size={16} className="text-indigo-500" />
        <h2 className="text-sm font-bold text-slate-900">יומן הערות המשפחה</h2>
        <span className="text-xs text-slate-400">({notes.length})</span>
      </div>

      {/* שרשור ההודעות */}
      <div ref={scrollRef} className="flex flex-col gap-3 p-4 max-h-[420px] overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-6">
            <Loader2 size={16} className="animate-spin" /> טוען…
          </div>
        ) : notes.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">אין עדיין הערות. כתבו את הראשונה למטה.</p>
        ) : (
          notes.map(n => {
            const mine = !!currentUserId && n.author_id === currentUserId
            return (
              <div key={n.id} className={`flex flex-col max-w-[85%] ${mine ? 'self-start items-start' : 'self-start items-start'}`}>
                <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  mine ? 'bg-indigo-50 border border-indigo-100 text-slate-800' : 'bg-slate-50 border border-slate-200 text-slate-800'
                }`}>
                  {n.body}
                </div>
                <div className="flex items-center gap-1.5 mt-1 px-1 text-[11px] text-slate-400">
                  <User size={11} />
                  <span className="font-medium text-slate-500">{n.author_name || 'משתמש'}</span>
                  <span>·</span>
                  <span>{fmtWhen(n.created_at)}</span>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* תיבת הוספה */}
      <div className="border-t border-slate-100 p-3">
        {error && <p className="text-xs text-red-600 mb-1.5">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send() } }}
            placeholder="הוסיפו הערה על המשפחה… (Ctrl+Enter לשליחה)"
            rows={2}
            className="flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button type="button" onClick={send} disabled={sending || !input.trim()}
            className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-semibold text-sm rounded-xl px-4 py-2.5 transition-colors">
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            שלח
          </button>
        </div>
      </div>
    </div>
  )
}
