'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, Upload, Mic, Trash2, Type } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

type Msg = { text: string; audio?: string | null }
type Meta = { key: string; label: string; defaultText: string; allowAudio: boolean; placeholders?: string[]; hint?: string }

export default function YemotMaternitySettings() {
  const toast = useToast()
  const [meta, setMeta] = useState<Meta[]>([])
  const [messages, setMessages] = useState<Record<string, Msg>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    let alive = true
    fetch('/api/admin/yemot-maternity/messages')
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!alive) return
        if (!ok) { toast.error(data.error || 'שגיאה בטעינה'); return }
        setMeta(data.meta ?? [])
        setMessages(data.messages ?? {})
      })
      .catch(() => { if (alive) toast.error('שגיאה בטעינת ההגדרות') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [toast])

  function setText(key: string, text: string) {
    setMessages((m) => ({ ...m, [key]: { ...m[key], text } }))
  }

  async function save() {
    setSaving(true)
    setSavedOk(false)
    try {
      const res = await fetch('/api/admin/yemot-maternity/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה בשמירה')
      if (data.messages) setMessages(data.messages)
      setSavedOk(true)
      toast.success('ההודעות נשמרו')
      setTimeout(() => setSavedOk(false), 2500)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  async function uploadRecording(key: string, file: File) {
    setUploadingKey(key)
    try {
      const fd = new FormData()
      fd.set('key', key)
      fd.set('file', file)
      const res = await fetch('/api/admin/yemot-maternity/recording', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה בהעלאה')
      if (data.messages) setMessages(data.messages)
      toast.success('ההקלטה הועלתה ותושמע בשיחה')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה בהעלאה')
    } finally {
      setUploadingKey(null)
    }
  }

  async function removeRecording(key: string) {
    setUploadingKey(key)
    try {
      const res = await fetch(`/api/admin/yemot-maternity/recording?key=${encodeURIComponent(key)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה בהסרה')
      if (data.messages) setMessages(data.messages)
      toast.success('ההקלטה הוסרה — חזרה לקול ממוחשב')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה בהסרה')
    } finally {
      setUploadingKey(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2.5 mb-4">
        <p className="text-xs text-slate-500">
          עריכת כל הודעה בנפרד — טקסט שיוקרא קולית, או העלאת הקלטה אנושית שתחליף אותו.
        </p>
        <Button onClick={save} disabled={saving || loading} size="sm">
          {saving ? <Loader2 size={14} className="animate-spin" /> : savedOk ? <Check size={14} /> : null}
          {savedOk ? 'נשמר' : 'שמירת טקסטים'}
        </Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" /> טוען…
        </div>
      ) : (
        <div className="space-y-3">
          {meta.map((m) => {
            const msg = messages[m.key] ?? { text: m.defaultText, audio: null }
            const busy = uploadingKey === m.key
            return (
              <div key={m.key} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-700">{m.label}</span>
                  {msg.audio ? (
                    <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5">
                      <Mic size={11} /> מושמעת הקלטה אנושית
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
                      <Type size={11} /> קול ממוחשב
                    </span>
                  )}
                </div>

                <textarea
                  value={msg.text}
                  onChange={(e) => setText(m.key, e.target.value)}
                  rows={2}
                  dir="rtl"
                  className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y disabled:bg-slate-50"
                  disabled={!!msg.audio}
                  placeholder={m.defaultText}
                />
                {m.hint && <p className="text-[11px] text-amber-600 mt-1">{m.hint}</p>}

                {m.allowAudio && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      ref={(el) => { fileInputs.current[m.key] = el }}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) uploadRecording(m.key, f)
                        e.target.value = ''
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => fileInputs.current[m.key]?.click()}
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                      {msg.audio ? 'החלף הקלטה' : 'העלה הקלטה'}
                    </Button>
                    {msg.audio && (
                      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => removeRecording(m.key)}>
                        <Trash2 size={13} /> הסר הקלטה
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
