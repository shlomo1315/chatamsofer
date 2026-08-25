'use client'
import { useState, useEffect, useMemo } from 'react'
import { staffDisplayName } from '@/lib/staffInitials'
import {
  ClipboardList, MessageSquare, Send, Loader2, User, ChevronDown, ChevronUp,
  FileText, GitBranch,
} from 'lucide-react'
import type { DocsFixRequestItem } from './DocsFixHistoryBanner'

// ─────────────────────────────────────────────────────────────────────────────
// קוביית "תיעוד" — ציר זמן אחד לכל מה שנכתב על המשפחה.
//
// עד כה המידע היה מפוזר: בקשות השלמת המסמכים בבאנר נפרד, והערות הצוות
// בלשונית אחרת. כדי לדעת מה קרה עם משפחה היה צריך לחפש בשני מקומות ולשחזר
// את הסדר לבד. כאן הכל ממוזג לרשימה אחת לפי תאריך, עם **שם הכותב** ליד כל
// פריט, ותיבת כתיבה בתחתית — אותו רעיון כמו שרשור הבירור בהלוואות.
// ─────────────────────────────────────────────────────────────────────────────

interface Note {
  id: string
  body: string
  author_id: string | null
  author_name: string | null
  created_at: string
}

type Entry =
  | { kind: 'note'; id: string; at: string; author: string; body: string }
  | { kind: 'docs'; id: string; at: string; author: string; req: DocsFixRequestItem }

function fmtWhen(iso: string): string {
  try {
    const d = new Date(iso)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
  } catch { return iso }
}

export default function BeneficiaryTimeline({
  beneficiaryId,
  history,
  docLabelMap,
  active = false,
}: {
  beneficiaryId: string
  /** בקשות השלמת המסמכים (נשלפות בשרת) */
  history: DocsFixRequestItem[]
  docLabelMap: Record<string, string>
  /** המשפחה בהשלמת מסמכים — הקוביה נפתחת אוטומטית */
  active?: boolean
}) {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(active)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  // ⚠️ ה-setState נעשה בתוך ה-callback של ה-fetch ולא בגוף ה-effect, כדי
  // שלא ייווצר רינדור מדורג (react-hooks/set-state-in-effect).
  useEffect(() => {
    let alive = true
    fetch(`/api/admin/beneficiary-notes?beneficiaryId=${beneficiaryId}`)
      .then(r => r.json())
      .then(d => { if (alive) { setNotes(Array.isArray(d.notes) ? d.notes : []); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [beneficiaryId])

  // מיזוג שני המקורות לציר זמן אחד — החדש ראשון
  const entries: Entry[] = useMemo(() => {
    const all: Entry[] = [
      ...notes.map(n => ({
        kind: 'note' as const, id: `n-${n.id}`, at: n.created_at,
        // ⚠️ ראשי תיבות — אותו כלל כמו ביומן ההערות שמציג את אותן רשומות.
        author: staffDisplayName(n.author_name, 'משתמש'), body: n.body,
      })),
      ...history.map(h => ({
        kind: 'docs' as const, id: `d-${h.id}`, at: h.created_at,
        author: staffDisplayName(h.requested_by_name, 'המזכירות'), req: h,
      })),
    ]
    return all.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  }, [notes, history])

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

  const docsBody = (req: DocsFixRequestItem) => {
    const keys = (req.required_docs ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const labels = keys.map(k => docLabelMap[k] ?? k)
    return (
      <div className="flex flex-col gap-2">
        {labels.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-1">
              <FileText size={12} /> מסמכים שהתבקשו
            </p>
            <ul className="flex flex-col gap-0.5">
              {labels.map((l, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" /> {l}
                </li>
              ))}
            </ul>
          </div>
        )}
        {req.docs_notes && (
          <div>
            <p className="text-xs font-semibold text-amber-800 mb-0.5">הערת המזכירות</p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{req.docs_notes}</p>
          </div>
        )}
        {req.lineage_fix_required && (
          <div>
            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-0.5">
              <GitBranch size={12} /> התבקש תיקון עץ הדורות
            </p>
            {req.lineage_fix_note && (
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{req.lineage_fix_note}</p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`rounded-2xl border bg-white overflow-hidden ${active ? 'border-amber-300 shadow-sm' : 'border-slate-200'}`}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/60 hover:bg-slate-100/60 transition-colors text-right">
        <ClipboardList size={16} className={active ? 'text-amber-600' : 'text-indigo-500'} />
        <h2 className="text-sm font-bold text-slate-900">תיעוד</h2>
        <span className="text-xs text-slate-400">({entries.length})</span>
        {active && (
          <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
            ממתין להשלמת מסמכים
          </span>
        )}
        <span className="flex-1" />
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>

      {open && (
        <>
          <div className="flex flex-col gap-3 p-4 max-h-[460px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-6">
                <Loader2 size={16} className="animate-spin" /> טוען…
              </div>
            ) : entries.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">אין עדיין תיעוד. כתבו את ההערה הראשונה למטה.</p>
            ) : (
              entries.map(e => (
                <div key={e.id} className="flex flex-col">
                  <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed border ${
                    e.kind === 'docs'
                      ? 'bg-amber-50/70 border-amber-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}>
                    {e.kind === 'docs' ? (
                      <>
                        <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5 mb-1.5">
                          <ClipboardList size={12} /> בקשת השלמת מסמכים
                        </p>
                        {docsBody(e.req)}
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5 mb-1.5">
                          <MessageSquare size={12} /> הערת צוות
                        </p>
                        <p className="text-slate-800 whitespace-pre-wrap">{e.body}</p>
                      </>
                    )}
                  </div>
                  {/* ← שם הכותב ליד כל פריט, כדי שתמיד יהיה ברור מי כתב מה ומתי */}
                  <div className="flex items-center gap-1.5 mt-1 px-1 text-[11px] text-slate-400">
                    <User size={11} />
                    <span className="font-medium text-slate-500">{e.author}</span>
                    <span>·</span>
                    <span>{fmtWhen(e.at)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-100 p-3">
            {error && <p className="text-xs text-red-600 mb-1.5">{error}</p>}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={ev => setInput(ev.target.value)}
                onKeyDown={ev => { if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); send() } }}
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
        </>
      )}
    </div>
  )
}
