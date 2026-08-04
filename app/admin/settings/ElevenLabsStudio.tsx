'use client'
import { useState, useEffect, useRef } from 'react'
import { Loader2, Play, Download, Wand2, Volume2, KeyRound, Check, Square } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

// ─────────────────────────────────────────────────────────────────────────────
// אולפן ElevenLabs — יצירת קול מטקסט חופשי, בלי שיוך להודעה מסוימת.
// אותן הגדרות כמו שלוחת יולדות (מפתח + בחירת קול), אבל הטקסט חופשי לגמרי:
// כותבים, מאזינים, ומורידים MP3. שימושי להכנת הקלטות לכל צורך.
// ─────────────────────────────────────────────────────────────────────────────

type Voice = { voiceId: string; name: string; labels?: Record<string, string> }

export default function ElevenLabsStudio() {
  const toast = useToast()
  const [text, setText] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [voiceId, setVoiceId] = useState('')
  const [voices, setVoices] = useState<Voice[]>([])
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingCfg, setSavingCfg] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    fetch('/api/admin/elevenlabs/settings')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        setHasKey(!!d.hasKey)
        setVoiceId(d.voiceId ?? '')
        setVoices(d.voices ?? [])
      })
      .catch(() => {})
    return () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null } }
  }, [])

  const saveCfg = async () => {
    setSavingCfg(true)
    try {
      const res = await fetch('/api/admin/elevenlabs/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput || undefined, voiceId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שגיאה בשמירה')
      setHasKey(!!d.hasKey); setVoiceId(d.voiceId ?? voiceId); setVoices(d.voices ?? []); setApiKeyInput('')
      if (d.voicesError) toast.error(`חיבור ל-ElevenLabs: ${d.voicesError}`)
      else toast.success('ההגדרות נשמרו')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שגיאה בשמירה') }
    finally { setSavingCfg(false) }
  }

  // מייצר אודיו מהטקסט ומחזיר base64 (או null בשגיאה)
  const genAudio = async (): Promise<{ audio: string; mime: string } | null> => {
    const res = await fetch('/api/admin/elevenlabs/preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voiceId: voiceId || undefined }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d?.error || `שגיאה (${res.status})`)
    if (!d?.audio) throw new Error('לא התקבל אודיו')
    return { audio: d.audio, mime: d.mime || 'audio/mpeg' }
  }

  const stop = () => { if (audioRef.current) { audioRef.current.pause(); audioRef.current = null } setPlaying(false) }

  const preview = async () => {
    if (playing) { stop(); return }
    if (!text.trim()) { toast.error('אין טקסט להשמעה'); return }
    stop()
    setPreviewing(true)
    try {
      const d = await genAudio()
      if (!d) return
      const audio = new Audio(`data:${d.mime};base64,${d.audio}`)
      audioRef.current = audio
      audio.onended = () => { if (audioRef.current === audio) { audioRef.current = null; setPlaying(false) } }
      audio.onerror = () => { toast.error('הדפדפן לא הצליח לנגן'); setPlaying(false) }
      await audio.play()
      setPlaying(true)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שגיאה בהשמעה') }
    finally { setPreviewing(false) }
  }

  const download = async () => {
    if (!text.trim()) { toast.error('אין טקסט להורדה'); return }
    setDownloading(true)
    try {
      const d = await genAudio()
      if (!d) return
      const bytes = Uint8Array.from(atob(d.audio), c => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: d.mime })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${text.trim().slice(0, 24).replace(/[^\p{L}\p{N} ]/gu, '') || 'קול'}.mp3`
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שגיאה בהורדה') }
    finally { setDownloading(false) }
  }

  const ready = hasKey && voiceId

  return (
    <div className="flex flex-col gap-4">
      {/* פאנל הגדרות ElevenLabs */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Volume2 size={15} className="text-indigo-600" />
          <span className="text-xs font-semibold text-slate-700">קול נוירוני (ElevenLabs)</span>
          {hasKey
            ? <span className="text-[11px] bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5">מחובר</span>
            : <span className="text-[11px] bg-amber-50 text-amber-700 rounded-full px-2 py-0.5">לא מוגדר</span>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11px] text-slate-500 mb-1 flex items-center gap-1"><KeyRound size={11} /> מפתח API {hasKey && '(הזן רק להחלפה)'}</label>
            <input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
              placeholder={hasKey ? '••••••••••••' : 'מפתח ElevenLabs'} dir="ltr"
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[11px] text-slate-500 mb-1">קול</label>
            <select value={voiceId} onChange={e => setVoiceId(e.target.value)} disabled={!voices.length}
              className="w-full text-sm rounded-lg border border-slate-200 px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-slate-50 disabled:text-slate-400">
              {!voiceId && <option value="">{voices.length ? 'בחר קול' : 'הזן מפתח כדי לטעון קולות'}</option>}
              {voices.map(v => <option key={v.voiceId} value={v.voiceId}>{v.name}</option>)}
            </select>
          </div>
          <Button onClick={saveCfg} disabled={savingCfg} size="sm">
            {savingCfg ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} שמור
          </Button>
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          <span className="inline-flex items-center bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 font-medium">🇮🇱 עברית</span>
          {' '}מנוע Eleven v3. אם המבטא נשמע אנגלי — בחר קול עברי.
        </p>
      </div>

      {/* טקסט חופשי */}
      <div className="rounded-xl border border-slate-200 p-3">
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">טקסט חופשי ליצירת קול</label>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={5} dir="rtl"
          placeholder="כתבו כאן כל טקסט, האזינו לו והורידו כקובץ MP3…"
          className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y" />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[11px] text-slate-400">{text.length} תווים · עד 600 להשמעה</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <Button type="button" variant="outline" size="sm" disabled={!ready || previewing} onClick={preview}>
            {previewing ? <Loader2 size={14} className="animate-spin" /> : playing ? <Square size={14} /> : <Play size={14} />}
            {playing ? 'עצור' : 'השמע'}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!ready || downloading} onClick={download}>
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            הורד MP3
          </Button>
          {!ready && <span className="text-[11px] text-amber-600 flex items-center gap-1"><Wand2 size={11} /> הגדר מפתח ובחר קול כדי ליצור</span>}
        </div>
      </div>
    </div>
  )
}
