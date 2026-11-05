'use client'

// עריכת הודעת השיחה הטלפונית לאחר רישום + השמעה/הורדה של גרסת ElevenLabs.
// השיחה היוצאת מקריאה את הטקסט הזה (TTS) למספר של הנרשם בסיום הרישום.
import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, Play, Download, RotateCcw, Volume2, Mic, PhoneCall } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import StickySaveBar from '@/components/ui/StickySaveBar'

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
  const [testPhone, setTestPhone] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
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

  async function testCall() {
    const p = testPhone.trim()
    if (p.replace(/\D/g, '').length < 9) { setTestResult('מספר טלפון לא תקין'); return }
    setTesting(true); setTestResult(null)
    try {
      const res = await fetch('/api/admin/registration-call/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: p }),
      })
      const d = await res.json()
      if (!res.ok) { setTestResult(`❌ ${d.error || 'שגיאה'}`); return }
      if (d.ok) {
        setTestResult(`✅ השיחה יצאה דרך טכנוליין.${d.error ? ` (${d.error})` : ''}`)
      } else {
        setTestResult(`❌ השיחה לא יצאה: ${d.error || 'שגיאה לא ידועה'}`)
      }
    } catch { setTestResult('❌ שגיאת רשת') }
    finally { setTesting(false) }
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
        className="w-full text-sm rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-line-strong resize-y"
      />

      {/* השיחה יוצאת דרך טכנוליין ומקריאה את הטקסט */}
      <div>
        <span className="inline-flex items-center gap-1.5 text-[12px] bg-slate-100 text-slate-600 rounded-full px-2.5 py-1">
          <Mic size={13} /> קול ממוחשב (TTS) דרך טכנוליין
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={saving || !dirty} size="sm">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {savedOk ? 'נשמר' : 'שמירת טקסט'}
        </Button>
        {hasKey && voiceId && (
          <>
            <Button onClick={preview} disabled={previewing} variant="ghost" size="sm">
              {previewing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />} השמעה
            </Button>
            <Button onClick={download} disabled={downloading} variant="ghost" size="sm">
              {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} הורדת MP3
            </Button>
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
      {/* בדיקת שיחה למספר שלך — שיחה אחת בלבד למספר שתזין */}
      <div className="rounded-lg border border-gold-soft bg-sand/40 px-3 py-2.5 flex flex-col gap-2">
        <p className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5"><PhoneCall size={12} /> בדיקת שיחה (למספר שלך בלבד)</p>
        <div className="flex items-stretch gap-2">
          <input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="0500000000" dir="ltr"
            className="flex-1 min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm text-left focus:outline-none focus:ring-2 focus:ring-line-strong" />
          <button type="button" onClick={testCall} disabled={testing}
            className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 bg-navy hover:bg-navy-dark disabled:bg-line-strong text-white font-semibold px-4 rounded-lg text-sm">
            {testing ? <Loader2 size={14} className="animate-spin" /> : <PhoneCall size={14} />} התקשר אליי לבדיקה
          </button>
        </div>
        {testResult && <p className="text-[12px] leading-relaxed text-slate-700">{testResult}</p>}
      </div>

      <p className="text-[11px] text-slate-400">השיחה תומכת במאות שיחות במקביל.</p>

      {/* 🔴 כלל ברזל: כל עריכה מציפה כפתור שמירה מהבהב. */}
      <StickySaveBar dirty={dirty} saving={saving} onSave={() => void save()} />
    </div>
  )
}
