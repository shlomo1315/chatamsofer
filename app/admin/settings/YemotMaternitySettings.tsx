'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, Upload, Mic, Trash2, Type, Wand2, Volume2, KeyRound, Play } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

type Msg = { text: string; audio?: string | null }
type Meta = { key: string; label: string; defaultText: string; allowAudio: boolean; placeholders?: string[]; hint?: string }
type Voice = { voiceId: string; name: string; labels?: Record<string, string> }

// הודעה כשירה ליצירת קול נוירוני: ניתנת להקלטה ואינה דינמית (בלי {משתנים})
const isEligible = (m: Meta) => m.allowAudio && !(m.placeholders && m.placeholders.length)
// קול שנוצר אוטומטית מסומן בקידומת tts_ (לעומת rec_ של הקלטה אנושית)
const isGenerated = (audio?: string | null) => !!audio && audio.startsWith('tts_')

export default function YemotMaternitySettings() {
  const toast = useToast()
  const [meta, setMeta] = useState<Meta[]>([])
  const [messages, setMessages] = useState<Record<string, Msg>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [genKey, setGenKey] = useState<string | null>(null)
  const [genAll, setGenAll] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // הגדרות ElevenLabs
  const [hasKey, setHasKey] = useState(false)
  const [voiceId, setVoiceId] = useState('')
  const [voices, setVoices] = useState<Voice[]>([])
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingCfg, setSavingCfg] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/admin/yemot-maternity/messages').then((r) => r.json().then((data) => ({ ok: r.ok, data }))),
      fetch('/api/admin/elevenlabs/settings').then((r) => r.json().then((data) => ({ ok: r.ok, data }))).catch(() => ({ ok: false, data: {} })),
    ])
      .then(([msgs, cfg]) => {
        if (!alive) return
        if (!msgs.ok) { toast.error(msgs.data.error || 'שגיאה בטעינה'); return }
        setMeta(msgs.data.meta ?? [])
        setMessages(msgs.data.messages ?? {})
        if (cfg.ok) {
          setHasKey(!!cfg.data.hasKey)
          setVoiceId(cfg.data.voiceId ?? '')
          setVoices(cfg.data.voices ?? [])
        }
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

  async function saveCfg() {
    setSavingCfg(true)
    try {
      const res = await fetch('/api/admin/elevenlabs/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput || undefined, voiceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה בשמירה')
      setHasKey(!!data.hasKey)
      setVoiceId(data.voiceId ?? voiceId)
      setVoices(data.voices ?? [])
      setApiKeyInput('')
      if (data.voicesError) toast.error(`חיבור ל-ElevenLabs: ${data.voicesError}`)
      else toast.success('הגדרות הקול נשמרו')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה בשמירה')
    } finally {
      setSavingCfg(false)
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
      toast.success('הקול הוסר — חזרה לקול ממוחשב')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה בהסרה')
    } finally {
      setUploadingKey(null)
    }
  }

  async function generateVoice(key: string) {
    setGenKey(key)
    try {
      const res = await fetch('/api/admin/yemot-maternity/generate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, text: messages[key]?.text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה ביצירת הקול')
      if (data.messages) setMessages(data.messages)
      toast.success('קול טבעי נוצר ויושמע בשיחה')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה ביצירת הקול')
    } finally {
      setGenKey(null)
    }
  }

  async function generateAll() {
    setGenAll(true)
    try {
      // שומרים תחילה את הטקסטים כדי שהיצירה תשתמש בנוסח המעודכן
      await fetch('/api/admin/yemot-maternity/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }),
      })
      const res = await fetch('/api/admin/yemot-maternity/generate-voice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'שגיאה ביצירת הקול')
      if (data.messages) setMessages(data.messages)
      const errCount = data.errors ? Object.keys(data.errors).length : 0
      if (errCount > 0) toast.error(`נוצרו ${data.generated?.length ?? 0} הודעות, ${errCount} נכשלו`)
      else toast.success(`נוצר קול טבעי ל-${data.generated?.length ?? 0} הודעות`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה ביצירת הקול')
    } finally {
      setGenAll(false)
    }
  }

  // השמעה מקדימה — מייצר אודיו ומשמיע בדפדפן בלי להעלות לימות.
  // id: מפתח הודעה או 'sample' לאודישן הקול הנבחר.
  async function preview(id: string, text: string) {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setPreviewId(id)
    try {
      const res = await fetch('/api/admin/elevenlabs/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId: voiceId || undefined }),
      })
      if (!res.ok) {
        let msg = `שגיאה בהשמעה (${res.status})`
        try {
          const d = await res.clone().json()
          if (d?.error) msg = d.error
        } catch {
          const t = await res.text().catch(() => '')
          if (t) msg += `: ${t.slice(0, 150)}`
        }
        throw new Error(msg)
      }
      const data = await res.json()
      if (!data?.audio) throw new Error(data?.error || 'לא התקבל אודיו')
      const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: data.mime || 'audio/mpeg' })
      if (!blob.size) throw new Error('האודיו שהתקבל ריק')
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { URL.revokeObjectURL(url); if (audioRef.current === audio) audioRef.current = null }
      audio.onerror = () => { toast.error('הדפדפן לא הצליח לנגן את האודיו'); URL.revokeObjectURL(url) }
      await audio.play()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה בהשמעה')
    } finally {
      setPreviewId(null)
    }
  }

  const busyAny = saving || genAll || savingCfg
  const eligibleCount = meta.filter(isEligible).length

  return (
    <div>
      {/* פאנל קול נוירוני (ElevenLabs) */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3 mb-4">
        <div className="flex items-center gap-1.5 mb-2">
          <Volume2 size={15} className="text-indigo-600" />
          <span className="text-xs font-semibold text-slate-700">קול נוירוני טבעי (ElevenLabs)</span>
          {hasKey ? (
            <span className="text-[11px] bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5">מחובר</span>
          ) : (
            <span className="text-[11px] bg-amber-50 text-amber-700 rounded-full px-2 py-0.5">לא מוגדר</span>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11px] text-slate-500 mb-1 flex items-center gap-1"><KeyRound size={11} /> מפתח API {hasKey && '(הזן רק להחלפה)'}</label>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={hasKey ? '••••••••••••' : 'מפתח ElevenLabs'}
              className="w-full text-sm rounded-lg border border-slate-200 px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              dir="ltr"
            />
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="block text-[11px] text-slate-500 mb-1">קול</label>
            <select
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              disabled={!voices.length}
              className="w-full text-sm rounded-lg border border-slate-200 px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-slate-50 disabled:text-slate-400"
            >
              {!voiceId && <option value="">{voices.length ? 'בחר קול' : 'הזן מפתח כדי לטעון קולות'}</option>}
              {voices.map((v) => (
                <option key={v.voiceId} value={v.voiceId}>{v.name}</option>
              ))}
            </select>
          </div>
          <Button onClick={saveCfg} disabled={savingCfg} size="sm">
            {savingCfg ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            שמור
          </Button>
        </div>
        {hasKey && voiceId && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              onClick={() => preview('sample', 'שלום זו דוגמה לקול הטבעי שישמיע המערכת למתקשרות')}
              disabled={previewId === 'sample' || busyAny}
              variant="outline"
              size="sm"
            >
              {previewId === 'sample' ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              השמע דוגמה
            </Button>
            {eligibleCount > 0 && (
              <Button onClick={generateAll} disabled={busyAny} variant="outline" size="sm">
                {genAll ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                צור קול טבעי לכל ההודעות ({eligibleCount})
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2.5 mb-4">
        <p className="text-xs text-slate-500">
          עריכת כל הודעה בנפרד — טקסט שיוקרא קולית, יצירת קול טבעי, או העלאת הקלטה אנושית.
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
            const generating = genKey === m.key || genAll
            const generated = isGenerated(msg.audio)
            return (
              <div key={m.key} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-700">{m.label}</span>
                  {msg.audio ? (
                    generated ? (
                      <span className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5">
                        <Volume2 size={11} /> קול נוירוני טבעי
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] bg-emerald-50 text-emerald-700 rounded-full px-2 py-0.5">
                        <Mic size={11} /> הקלטה אנושית
                      </span>
                    )
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
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {isEligible(m) && hasKey && voiceId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || generating || busyAny}
                        onClick={() => generateVoice(m.key)}
                      >
                        {generating ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                        {generated ? 'צור קול מחדש' : 'צור קול טבעי'}
                      </Button>
                    )}
                    {isEligible(m) && hasKey && voiceId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={previewId === m.key || generating || busyAny}
                        onClick={() => preview(m.key, msg.text)}
                      >
                        {previewId === m.key ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                        השמע
                      </Button>
                    )}
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
                      disabled={busy || generating}
                      onClick={() => fileInputs.current[m.key]?.click()}
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                      {msg.audio ? 'העלה הקלטה' : 'העלה הקלטה'}
                    </Button>
                    {msg.audio && (
                      <Button type="button" variant="ghost" size="sm" disabled={busy || generating} onClick={() => removeRecording(m.key)}>
                        <Trash2 size={13} /> הסר קול
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
