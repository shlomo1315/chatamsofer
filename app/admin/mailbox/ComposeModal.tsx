'use client'

import { useMemo, useRef, useState } from 'react'
import { Send, Paperclip, X, Loader2, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

export interface ComposeInit {
  to?: string
  cc?: string
  subject?: string
  body?: string
  in_reply_to?: string
  thread_id?: string
}

interface Attachment {
  file_url: string
  file_name: string
  content_type?: string
  size?: number
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseAddrs(s: string): string[] {
  return s.split(/[,;]+/).map((x) => x.trim()).filter(Boolean)
}

export default function ComposeModal({
  init,
  onClose,
  onSent,
}: {
  init: ComposeInit
  onClose: () => void
  onSent: () => void
}) {
  const supabase = useMemo(() => createClient(), [])
  const fileInput = useRef<HTMLInputElement>(null)

  const [to, setTo] = useState(init.to ?? '')
  const [cc, setCc] = useState(init.cc ?? '')
  const [showCc, setShowCc] = useState(!!init.cc)
  const [subject, setSubject] = useState(init.subject ?? '')
  const [body, setBody] = useState(init.body ?? '')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setError('')
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const path = `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`
        const { error: upErr } = await supabase.storage.from('mail-attachments').upload(path, file)
        if (upErr) throw new Error(`שגיאה בהעלאת ${file.name}: ${upErr.message}`)
        const { data } = supabase.storage.from('mail-attachments').getPublicUrl(path)
        setAttachments((prev) => [...prev, {
          file_url: data.publicUrl,
          file_name: file.name,
          content_type: file.type || undefined,
          size: file.size,
        }])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בהעלאת קובץ')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const removeAttachment = (url: string) =>
    setAttachments((prev) => prev.filter((a) => a.file_url !== url))

  const handleSend = async () => {
    const toList = parseAddrs(to)
    const ccList = parseAddrs(cc)

    if (toList.length === 0) { setError('יש להזין נמען'); return }
    if (!toList.every((e) => EMAIL_RE.test(e))) { setError('כתובת נמען לא תקינה'); return }
    if (ccList.some((e) => !EMAIL_RE.test(e))) { setError('כתובת עותק (CC) לא תקינה'); return }
    if (!subject.trim()) { setError('יש להזין נושא'); return }
    if (!body.trim()) { setError('ההודעה ריקה'); return }

    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/admin/mailbox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toList,
          cc: ccList,
          subject: subject.trim(),
          body_text: body,
          in_reply_to: init.in_reply_to,
          thread_id: init.thread_id,
          attachments,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'שגיאה בשליחת ההודעה')
      onSent()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בשליחת ההודעה')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="הודעה חדשה"
      size="lg"
      footer={
        <div className="flex items-center justify-between">
          <button
            onClick={() => fileInput.current?.click()}
            disabled={uploading || sending}
            className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-indigo-600 transition-colors disabled:opacity-50"
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />}
            צרף קובץ
          </button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={sending}>ביטול</Button>
            <Button onClick={handleSend} loading={sending} disabled={uploading}>
              {!sending && <Send size={15} />}
              שליחה
            </Button>
          </div>
        </div>
      }
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="space-y-3">
        {error && (
          <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-lg">
            <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="w-16 text-sm font-medium text-slate-600 flex-shrink-0">אל</label>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            dir="ltr"
            placeholder="name@example.com"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {!showCc && (
            <button onClick={() => setShowCc(true)} className="text-xs text-indigo-600 hover:underline flex-shrink-0">
              עותק
            </button>
          )}
        </div>

        {showCc && (
          <div className="flex items-center gap-2">
            <label className="w-16 text-sm font-medium text-slate-600 flex-shrink-0">עותק</label>
            <input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              dir="ltr"
              placeholder="cc@example.com"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <label className="w-16 text-sm font-medium text-slate-600 flex-shrink-0">נושא</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="נושא ההודעה"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="כתוב את ההודעה כאן…"
          rows={12}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
        />

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((a) => (
              <span
                key={a.file_url}
                className="inline-flex items-center gap-1.5 text-xs bg-slate-100 rounded-lg px-2.5 py-1.5 text-slate-700"
              >
                <Paperclip size={12} className="text-slate-400" />
                {a.file_name}
                <button onClick={() => removeAttachment(a.file_url)} className="text-slate-400 hover:text-red-600">
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
