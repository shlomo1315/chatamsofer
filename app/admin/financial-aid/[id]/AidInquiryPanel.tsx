'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useCan } from '@/components/StaffPermissions'

// התכתבות במייל עם המבקש בתוך הכרטסת, כמו בבירור ההלוואות.
interface Msg {
  id: string
  direction: 'staff' | 'applicant'
  body: string
  sender_name?: string | null
  created_at: string
  attachment_name?: string | null
}

const fmt = (d: string) => {
  const t = new Date(d)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(t.getDate())}.${p(t.getMonth() + 1)} · ${p(t.getHours())}:${p(t.getMinutes())}`
}

export default function AidInquiryPanel({ source, requestId, hasEmail }: {
  source: 'financial_aid_requests' | 'widow_requests'
  requestId: string
  hasEmail: boolean

}) {
  const router = useRouter()
  const toast = useToast()
  const canSend = useCan(source === 'widow_requests' ? 'widows' : 'financial_aid', 'edit')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const url = `/api/admin/aid/${source}/${requestId}/messages`

  const load = useCallback(async () => {
    try {
      const res = await fetch(url)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'טעינת ההתכתבות נכשלה')
      setMsgs(d.messages ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת ההתכתבות נכשלה')
    } finally { setLoading(false) }
  }, [url, toast])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [msgs])

  const send = async () => {
    const message = text.trim()
    if (!message || sending) return
    setSending(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'השליחה נכשלה')
      setText('')
      await load()
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'השליחה נכשלה')
    } finally { setSending(false) }
  }

  return (
    <div className="flex h-[620px] max-h-[80vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <b className="text-sm text-slate-900">התכתבות עם המבקש</b>
        <small className="mr-auto text-slate-500">{msgs.length} הודעות</small>
      </div>
      <div className="flex flex-1 flex-col gap-3 overflow-auto bg-slate-50/60 p-4">
        {loading && <Loader2 size={18} className="mx-auto animate-spin text-slate-400" />}
        {!loading && msgs.length === 0 && <p className="m-auto text-center text-sm text-slate-400">עוד אין הודעות. הודעה שתישלח כאן תגיע למבקש במייל, והתשובה תופיע כאן.</p>}
        {msgs.map(m => (
          <div key={m.id} className={`flex max-w-[85%] flex-col ${m.direction === 'staff' ? 'self-end items-end' : 'self-start'}`}>
            <span className={`px-1 text-[11px] font-semibold ${m.direction === 'staff' ? 'text-sky-700' : 'text-slate-600'}`}>
              {m.direction === 'staff' ? (m.sender_name || 'מחלקת סיוע') : 'המבקש · השיב במייל'}
            </span>
            <div className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${m.direction === 'staff' ? 'rounded-br-sm bg-sky-500 text-white' : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800'}`}>{m.body}</div>
            {m.attachment_name && <div className="mt-1.5 rounded-lg border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-800">{m.attachment_name} · נשמר בכרטסת</div>}
            <span className="px-1 text-[10px] text-slate-400">{fmt(m.created_at)}{m.direction === 'staff' ? ' · נשלח במייל' : ''}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {canSend && (
        <div className="flex flex-col gap-2 border-t border-slate-200 bg-white p-3">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} disabled={!hasEmail}
            placeholder={hasEmail ? 'כתוב הודעה למבקש. היא תישלח אליו אוטומטית במייל, והתשובה שלו תופיע כאן.' : 'אין כתובת מייל למבקש, אי אפשר לשלוח.'}
            className="min-h-[70px] resize-y rounded-lg border border-slate-200 p-2.5 text-sm" />
          <button onClick={send} disabled={sending || !text.trim() || !hasEmail}
            className="inline-flex items-center justify-center gap-2 self-end rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} שליחה במייל
          </button>
        </div>
      )}
    </div>
  )
}
