'use client'

// עריכת הודעת השיחה הטלפונית לאחר רישום + השמעה/הורדה של גרסת ElevenLabs.
// השיחה היוצאת מקריאה את הטקסט הזה (TTS) למספר של הנרשם בסיום הרישום.
import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, Play, Download, RotateCcw, Volume2, Wand2, Trash2, Mic } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

export default function RegistrationCallSettings() {
  const toast = useToast()
  const [text, setText] = useState('')
  const [saved, setSaved] = useState('')
  const [defaultText, setDefaultText] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [hasKey, setHasKey] = useState(false)
  const [voiceId, setVoiceId] = useState('')
  const [audio, setAudio] = useState<string | null>(null)
  const [audioConfigured, setAudioConfigured] = useState(false)
  const [generating, setGenerating] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/admin/registration-call').then(r => r.json().then(d => ({ ok: r.ok, d }))),
      fetch('/api/admin/elevenlabs/settings').then(r => r.json().then(d => ({ ok: r.ok, d }))).catch(() => ({ ok: false, d: {} })),
    ]).then(([msg, cfg]) => {
      if (!alive) return
      if (msg.ok) {
        setText(msg.d.text ?? ''); setSaved(msg.d.text ?? ''); setDefaultText(msg.d.defaultText ?? '')
        setAudio(msg.d.audio ?? null); setAudioConfigured(!!msg.d.audioPlaybackConfigured)
      }
      if (cfg.ok) { setHasKey(!!cfg.d.hasKey); setVoiceId(cfg.d.voiceId ?? '') }
    }).catch(() => { if (alive) toast.error('שגיאה בטעינה') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [toast])

  async function save() {
    setSaving(true); setSavedOk(false)
    try {
      const res = await fetch('/api/admin/registration-call', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שגיאה בשמירה')
      setText(d.text); setSaved(d.text); setSavedOk(true)
      toast.success('הטקסט נשמר — ייקרא בשיחה הבאה')
      setTimeout(() => setSavedOk(false), 2500)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שגיאה בשמירה') }
    finally { setSaving(false) }
  }

  async function preview() {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setPreviewing(true)
    try {
      const res = await fetch('/api/admin/elevenlabs/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId: voiceId || undefined }),
      })
      const d = await res.json()
      if (!res.ok || !d?.audio) throw new Error(d?.error || 'שגיאה בהשמעה')
      const audio = new Audio(`data:${d.mime || 'audio/mpeg'};base64,${d.audio}`)
      audioRef.current = audio
      audio.onended = () => { if (audioRef.current === audio) audioRef.current = null }
      await audio.play()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שגיאה בהשמעה') }
    finally { setPreviewing(false) }
  }

  async function generateVoice() {
    setGenerating(true)
    try {
      // שומרים קודם את הטקסט כדי שהקול ייווצר מהנוסח המעודכן
      if (text.trim() !== saved.trim()) await save()
      const res = await fetch('/api/admin/registration-call/generate-voice', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שגיאה ביצירת הקול')
      setAudio(d.audio ?? 'reg_announce')
      toast.success('נוצר קול טבעי ויונגן בשיחה (אם הוגדרה תבנית ניגון בימות)')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שגיאה ביצירת הקול') }
    finally { setGenerating(false) }
  }

  async function removeVoice() {
    setGenerating(true)
    try {
      const res = await fetch('/api/admin/registration-call/generate-voice', { method: 'DELETE' })
      if (!res.ok) throw new Error('שגיאה בהסרה')
      setAudio(null)
      toast.success('הקול הוסר — השיחה תקריא את הטקסט (TTS)')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שגיאה בהסרה') }
    finally { setGenerating(false) }
  }

  async function download() {
    setDownloading(true)
    try {
      const res = await fetch('/api/admin/elevenlabs/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId: voiceId || undefined }),
      })
      const d = await res.json()
      if (!res.ok || !d?.audio) throw new Error(d?.error || 'שגיאה בהורדה')
      const bytes = Uint8Array.from(atob(d.audio), c => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: d.mime || 'audio/mpeg' }))
      const a = document.createElement('a')
      a.href = url; a.download = 'הודעת-רישום.mp3'
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שגיאה בהורדה') }
    finally { setDownloading(false) }
  }

  if (loading) return <div className="py-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> טוען…</div>

  const dirty = text.trim() !== saved.trim()

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500 leading-relaxed">
        הטקסט שיוקרא בשיחה הטלפונית האוטומטית הנשלחת למספר של הנרשם בסיום הרישום.
        כתובת מייל יש לכתוב בעברית מדוברת (למשל &quot;שטרודל&quot; ל-@ ו&quot;נקודה&quot; ל-.) או אות-אות באנגלית, כדי שתוקרא ברור.
      </p>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={5}
        dir="rtl"
        className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y"
      />

      {/* חיווי מצב הקול הנוכחי של השיחה */}
      <div>
        {audio ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] bg-indigo-50 text-indigo-700 rounded-full px-2.5 py-1">
            <Volume2 size={13} /> קול טבעי פעיל (ElevenLabs)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[12px] bg-slate-100 text-slate-600 rounded-full px-2.5 py-1">
            <Mic size={13} /> קול ממוחשב (TTS)
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={saving || !dirty} size="sm">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {savedOk ? 'נשמר' : 'שמירת טקסט'}
        </Button>
        {hasKey && voiceId && (
          <>
            <Button onClick={generateVoice} disabled={generating} variant="outline" size="sm">
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              {audio ? 'צור קול טבעי מחדש' : 'צור קול טבעי'}
            </Button>
            <Button onClick={preview} disabled={previewing} variant="ghost" size="sm">
              {previewing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} השמעה
            </Button>
            <Button onClick={download} disabled={downloading} variant="ghost" size="sm">
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} הורדת MP3
            </Button>
            {audio && (
              <Button onClick={removeVoice} disabled={generating} variant="ghost" size="sm">
                <Trash2 size={14} /> הסר קול טבעי
              </Button>
            )}
          </>
        )}
        {defaultText && (
          <Button onClick={() => setText(defaultText)} variant="ghost" size="sm">
            <RotateCcw size={14} /> שחזור לברירת מחדל
          </Button>
        )}
      </div>

      {!hasKey && (
        <p className="text-[11px] text-amber-600 flex items-center gap-1.5">
          <Volume2 size={12} /> כדי ליצור/לשמוע קול טבעי — הגדירו מפתח ElevenLabs בקטע &quot;הקלטות שלוחת יולדות&quot;.
        </p>
      )}
      {audio && !audioConfigured && (
        <p className="text-[11px] text-amber-600 leading-relaxed">
          ⚠️ נוצר קול טבעי, אך כדי שהשיחה היוצאת תנגן אותו (ולא תקריא TTS) נדרש להגדיר בימות תבנית קמפיין שמנגנת את הקובץ, ואת מזהה התבנית במשתנה הסביבה <span className="ltr-num">YEMOT_ANNOUNCE_TEMPLATE_ID</span>. עד אז השיחה תקריא את הטקסט.
        </p>
      )}
      <p className="text-[11px] text-slate-400">השיחה תומכת במאות שיחות במקביל.</p>
    </div>
  )
}
