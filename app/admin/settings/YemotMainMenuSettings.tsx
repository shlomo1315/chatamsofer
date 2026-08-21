'use client'
import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, Type, Play, Save } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

type Msg = { text: string; audio?: string | null }
type Meta = { key: string; label: string; defaultText: string; allowAudio: boolean; hint?: string }

// ─────────────────────────────────────────────────────────────────────────────
// הודעות התפריט הראשי.
//
// ⚠️ אותו דפוס בדיוק כמו YemotHolidaySettings — עריכת טקסט והשמעה מקדימה.
// המספרים בתפריט חייבים להתאים למה שהשלוחה באמת מקבלת (1, 2, 9), והשרת
// חוסם שמירה בלעדיהם: תפריט שמקריא מקש שאינו מנותב שולח את המתקשר
// להקשה שתישמע לו כשגויה.
// ─────────────────────────────────────────────────────────────────────────────
export default function YemotMainMenuSettings() {
  const toast = useToast()
  const [meta, setMeta] = useState<Meta[]>([])
  const [messages, setMessages] = useState<Record<string, Msg>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/admin/yemot-menu/messages')
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!alive || !ok) return
        setMeta(d.meta ?? [])
        setMessages(d.messages ?? {})
      })
      .catch(() => { if (alive) toast.error('שגיאה בטעינת ההודעות') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const preview = async (key: string, text: string) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setPreviewId(key)
    try {
      const res = await fetch('/api/admin/elevenlabs/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.audio) throw new Error(data?.error || 'שגיאה בהשמעה')
      const audio = new Audio(`data:${data.mime || 'audio/mpeg'};base64,${data.audio}`)
      audioRef.current = audio
      audio.onended = () => { if (audioRef.current === audio) audioRef.current = null }
      await audio.play()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה בהשמעה')
    } finally {
      setPreviewId(null)
    }
  }

  const save = async () => {
    setSaving(true); setSavedOk(false)
    try {
      const res = await fetch('/api/admin/yemot-menu/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'שגיאה בשמירה'); setSaving(false); return }
      setMessages(d.messages ?? messages)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
    } catch { toast.error('שגיאת רשת') }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
        <Loader2 size={15} className="animate-spin" /> טוען הודעות…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {meta.map(m => {
        const value = messages[m.key]?.text ?? m.defaultText
        return (
          <div key={m.key} className="rounded-xl border border-slate-200 bg-white p-3.5">
            <div className="mb-2 flex items-center gap-2">
              <Type size={13} className="text-slate-400" />
              <span className="text-[13px] font-bold text-slate-800">{m.label}</span>
              <button
                onClick={() => preview(m.key, value)}
                disabled={previewId === m.key || !value.trim()}
                className="mr-auto inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50"
              >
                {previewId === m.key
                  ? <Loader2 size={11} className="animate-spin" />
                  : <Play size={11} />}
                השמעה
              </button>
            </div>
            <textarea
              value={value}
              onChange={e => setMessages(prev => ({ ...prev, [m.key]: { ...(prev[m.key] ?? {}), text: e.target.value } }))}
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
            {m.hint && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{m.hint}</p>}
          </div>
        )
      })}

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} שמירה
        </button>
        {savedOk && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
            <Check size={13} /> נשמר
          </span>
        )}
      </div>
    </div>
  )
}
