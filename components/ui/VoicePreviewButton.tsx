'use client'
import { useState, useRef, useEffect } from 'react'
import { Play, Square, Loader2, AlertTriangle } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// האזנה לנוסח לפני שהוא נשמע לאלפי מתקשרים.
//
// 🔴 מנגן את *הטקסט הנוכחי* דרך ElevenLabs, ולא את הקובץ שיושב בימות:
// לקבצים שם אין כתובת ציבורית לנגן ממנה. המשמעות המעשית טובה יותר —
// שומעים מה ייצא אם יקליטו עכשיו, וכך תופסים שגיאת ניסוח לפני ההקלטה.
//
// ⚠️ base64 ב-JSON ולא audio/mpeg גולמי: נטפרי חוסמת הזרמת אודיו לפי סוג
// התוכן, בדיוק כפי שהיא חוסמת PDF. הדפדפן מפענח ומנגן מ-blob מקומי.
//
// ⚠️ הניגון נעצר ב-cleanup: מעבר לשלוחה אחרת בזמן השמעה השאיר את הקול
// מתנגן ברקע בלי שום כפתור לעצור אותו.
// ─────────────────────────────────────────────────────────────────────────────

export default function VoicePreviewButton({
  text, disabled, className = '',
}: {
  text: string
  disabled?: boolean
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [err, setErr] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const urlRef = useRef<string | null>(null)

  const stop = () => {
    audioRef.current?.pause()
    audioRef.current = null
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    setPlaying(false)
  }

  useEffect(() => stop, [])

  const play = async () => {
    if (playing) { stop(); return }
    const body = String(text ?? '').trim()
    if (!body) return
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/admin/elevenlabs/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: body }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.audio) { setErr(d.error ?? 'ההשמעה נכשלה'); return }

      const bin = atob(d.audio as string)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const url = URL.createObjectURL(new Blob([bytes], { type: d.mime ?? 'audio/mpeg' }))
      urlRef.current = url

      const el = new Audio(url)
      audioRef.current = el
      el.onended = stop
      el.onerror = () => { setErr('הקובץ לא נוגן'); stop() }
      await el.play()
      setPlaying(true)
    } catch {
      setErr('שגיאת רשת')
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <button type="button" onClick={() => void play()} disabled={disabled || busy || !text?.trim()}
        title={playing ? 'עצירה' : 'האזנה לנוסח'}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
        {busy ? <Loader2 size={12} className="animate-spin" />
          : playing ? <Square size={12} className="text-rose-600" />
          : <Play size={12} className="text-teal-600" />}
        {playing ? 'עצור' : 'האזן'}
      </button>
      {err && (
        <span className="inline-flex items-center gap-1 text-[11px] text-rose-600" title={err}>
          <AlertTriangle size={11} /> {err}
        </span>
      )}
    </span>
  )
}
