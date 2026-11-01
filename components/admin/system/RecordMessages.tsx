'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// לשונית התכתבות לכרטסת הקופצת (RecordModal): אותו מראה בכל המחלקות.
// כל מחלקה מעבירה רק כתובת API (GET מחזיר {messages}, POST מקבל {message}) ותוויות.
// ⚠️ המראה נקבע כאן ב-RecordModal ובאסימוני ה-v4 בלבד, לא בקובצי המחלקות.

type Msg = {
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

/** שליחת הודעה לשרשור (משמש גם את כפתור "בקש" בבדיקת המוכנות). */
export async function postRecordMessage(url: string, message: string) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || 'השליחה נכשלה')
}

export default function RecordMessages({ url, canSend, hasEmail, staffLabel, peerLabel, refreshKey = 0 }: {
  url: string
  canSend: boolean
  hasEmail: boolean
  staffLabel: string
  peerLabel: string
  /** משתנה כשנשלחה הודעה מחוץ ללשונית, כדי לטעון מחדש */
  refreshKey?: number
}) {
  const toast = useToast()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

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
  useEffect(() => { load() }, [load, refreshKey])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [msgs])

  const send = async () => {
    const message = text.trim()
    if (!message || sending) return
    setSending(true)
    try {
      await postRecordMessage(url, message)
      setText('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'השליחה נכשלה')
    } finally { setSending(false) }
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex max-h-[320px] flex-col gap-3 overflow-auto rounded-[10px] border border-[#E6DFCF] bg-[#FBF8F1] p-3">
        {loading && <Loader2 size={18} className="mx-auto animate-spin text-[#958C78]" />}
        {!loading && msgs.length === 0 && <p className="m-auto py-4 text-center text-sm text-[#6B6352]">עוד אין הודעות. הודעה שתישלח כאן תגיע במייל, והתשובה תופיע כאן.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex max-w-[85%] flex-col ${m.direction === 'staff' ? 'items-end self-end' : 'self-start'}`}>
            <span className="px-1 text-[11px] font-semibold text-[#6B6352]">{m.direction === 'staff' ? (m.sender_name || staffLabel) : peerLabel}</span>
            <div className={`whitespace-pre-wrap rounded-[10px] px-3.5 py-2.5 text-sm ${m.direction === 'staff' ? 'bg-[#14213D] text-white' : 'border border-[#E6DFCF] bg-white text-[#1B2338]'}`}>{m.body}</div>
            {m.attachment_name && <div className="mt-1.5 rounded-lg border border-[#E0EFE4] bg-[#E0EFE4] px-2 py-1 text-xs text-[#22663A]">{m.attachment_name} · נשמר בכרטסת</div>}
            <span className="px-1 text-[10px] text-[#958C78]">{fmt(m.created_at)}{m.direction === 'staff' ? ' · נשלח במייל' : ''}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {canSend && (
        <div className="flex flex-col gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} disabled={!hasEmail}
            placeholder={hasEmail ? 'כתיבת הודעה. היא תישלח במייל, והתשובה תופיע כאן.' : 'אין כתובת מייל, אי אפשר לשלוח.'}
            className="min-h-[70px] resize-y rounded-[10px] border border-[#D9CFB9] bg-[#FFFDF8] p-2.5 text-sm text-[#1B2338]" />
          <button type="button" onClick={send} disabled={sending || !text.trim() || !hasEmail}
            className="inline-flex min-h-[40px] items-center justify-center gap-2 self-end rounded-[9px] bg-[#14213D] px-4 text-sm font-bold text-white hover:bg-[#22345E] disabled:opacity-50">
            {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} שליחה במייל
          </button>
        </div>
      )}
    </div>
  )
}
