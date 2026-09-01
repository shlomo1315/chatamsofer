'use client'
import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, Type, Play, Save, Upload, Wand2, Trash2, Mic, Volume2, FolderTree } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

type Msg = { text: string; audio?: string | null }
type Meta = { key: string; label: string; defaultText: string; allowAudio: boolean; hint?: string }

// הודעה דינמית ({משתנה}) אינה יכולה להיות קובץ קול אחד קבוע.
const hasPlaceholder = (t: string) => /\{[^}]+\}/.test(t)
// קול שנוצר אוטומטית מסומן בקידומת tts_ (לעומת rec_ של הקלטה אנושית).
const isGenerated = (audio?: string | null) => !!audio && audio.startsWith('tts_')

// ─────────────────────────────────────────────────────────────────────────────
// הודעות התפריט הראשי.
//
// ⚠️ אותו דפוס בדיוק כמו YemotHolidaySettings / YemotMaternitySettings:
// עריכת טקסט, השמעה מקדימה, העלאת הקלטה אנושית ויצירת קול ב-ElevenLabs.
// המספרים בתפריט חייבים להתאים למה שהשלוחה באמת מקבלת (1, 2, 9), והשרת
// חוסם שמירה בלעדיהם: תפריט שמקריא מקש שאינו מנותב שולח את המתקשר
// להקשה שתישמע לו כשגויה.
// ─────────────────────────────────────────────────────────────────────────────
export default function YemotMainMenuSettings() {
  const toast = useToast()
  const [meta, setMeta] = useState<Meta[]>([])
  const [messages, setMessages] = useState<Record<string, Msg>>({})
  // ⚠️ עותק המצב השמור — ההשוואה מולו היא מה שמזהה שטקסט באמת השתנה.
  // בלעדיו כל שמירה הייתה מייצרת מחדש את כל ההודעות ומבזבזת מכסת
  // ElevenLabs על טקסט שאיש לא נגע בו.
  const [savedMsgs, setSavedMsgs] = useState<Record<string, Msg>>({})
  const [ext, setExt] = useState('1')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [genAll, setGenAll] = useState(false)
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/admin/yemot-menu/messages')
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!alive || !ok) return
        setMeta(d.meta ?? [])
        setMessages(d.messages ?? {}); setSavedMsgs(d.messages ?? {})
        if (d.ext) setExt(String(d.ext))
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

  const uploadRecording = async (key: string, file: File) => {
    setBusyKey(key)
    try {
      const fd = new FormData()
      fd.set('key', key)
      fd.set('file', file)
      const res = await fetch('/api/admin/yemot-menu/recording', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'שגיאה בהעלאה')
      if (d.messages) setMessages(d.messages)
      toast.success('ההקלטה הועלתה ותושמע בשיחה')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה בהעלאה')
    } finally { setBusyKey(null) }
  }

  const removeAudio = async (key: string) => {
    setBusyKey(key)
    try {
      const res = await fetch(`/api/admin/yemot-menu/recording?key=${encodeURIComponent(key)}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'שגיאה בהסרה')
      if (d.messages) setMessages(d.messages)
      toast.success('הקול הוסר — ההודעה תוקרא כטקסט')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה בהסרה')
    } finally { setBusyKey(null) }
  }

  const generateVoice = async (key: string) => {
    setBusyKey(key)
    try {
      const res = await fetch('/api/admin/yemot-menu/generate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, text: messages[key]?.text }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'שגיאה ביצירת הקול')
      if (d.messages) setMessages(d.messages)
      toast.success('קול טבעי נוצר ויושמע בשיחה')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה ביצירת הקול')
    } finally { setBusyKey(null) }
  }

  const generateAll = async () => {
    setGenAll(true)
    try {
      // ⚠️ שומרים תחילה, כדי שהיצירה תשתמש בנוסח שעל המסך ולא בשמור הישן.
      await fetch('/api/admin/yemot-menu/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }),
      })
      const res = await fetch('/api/admin/yemot-menu/generate-voice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'שגיאה ביצירת הקול')
      if (d.messages) setMessages(d.messages)
      const errCount = d.errors ? Object.keys(d.errors).length : 0
      if (errCount > 0) toast.error(`נוצרו ${d.generated?.length ?? 0} הודעות, ${errCount} נכשלו`)
      else toast.success(`נוצר קול טבעי ל-${d.generated?.length ?? 0} הודעות`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה ביצירת הקול')
    } finally { setGenAll(false) }
  }

  const save = async () => {
    // ⚠️ נלכד לפני השמירה — ראו savedMsgs.
    const before = savedMsgs
    setSaving(true); setSavedOk(false)
    try {
      const res = await fetch('/api/admin/yemot-menu/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'שגיאה בשמירה'); setSaving(false); return }
      const next = d.messages ?? messages
      setMessages(next)

      // ─────────────────────────────────────────────────────────────────────
      // 🔴 שמירה = יצירת קול טבעי. זו ההתנהגות בכל שלוש השלוחות.
      //
      // ⚠️ הקלטה גוברת על הטקסט: הודעה שיש לה קובץ קול משמיעה אותו
      // ומתעלמת מהטקסט לגמרי. בלי חידוש אוטומטי, "שמרתי" הראה ✓ בעוד
      // שבטלפון נשמעה הגרסה הקודמת — בלי שום סימן לכך בשום מסך.
      //
      // ⚠️ מדלגים על הודעה דינמית ({name}, {list}): קובץ קול יחיד אינו
      // יכול להקריא ערך שמשתנה בכל שיחה, והשרת חוסם זאת ממילא.
      // ─────────────────────────────────────────────────────────────────────
      const keys = (meta ?? [])
        .filter(m => m.allowAudio)
        .map(m => m.key)
        .filter(k => {
          const t = String(next[k]?.text ?? '').trim()
          // 🔴 הקלטה אנושית (שאינה tts_) אינה נדרסת: היא הוקלטה בכוונה,
          // ויצירה אוטומטית עליה הייתה מוחקת אותה בלי דרך לשחזר.
          const human = !isGenerated(next[k]?.audio) && !!next[k]?.audio
          // ⚠️ רק מה שהשתנה — ראו ההערה ליד savedMsgs.
          return t && !hasPlaceholder(t) && !human
            && t !== String(before[k]?.text ?? '').trim()
        })
      if (keys.length) {
        toast.info(`יוצר קול ל-${keys.length} הודעות…`)
        let failed = 0
        let latest = next
        for (const key of keys) {
          try {
            const vr = await fetch('/api/admin/yemot-menu/generate-voice', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key, text: next[key]?.text ?? '' }),
            })
            const vd = await vr.json().catch(() => ({}))
            if (!vr.ok) { failed++; continue }
            if (vd.messages) latest = vd.messages
          } catch { failed++ }
        }
        setMessages(latest); setSavedMsgs(latest)
        if (failed) toast.error(`הטקסט נשמר, אך יצירת הקול נכשלה ב-${failed} הודעות`)
        else toast.success('נשמר — והקול נוצר בהתאם')
      }

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
      {/* 🔴 שיוך ברור: לאיזו תיקייה בימות שייכות ההקלטות של השלוחה הזו.
          בלי זה אי אפשר לדעת איפה הקבצים יושבים ולמה הם אינם דורסים שלוחה אחרת. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2">
        <FolderTree size={14} className="text-teal-700" />
        <span className="text-[12px] font-bold text-teal-900">
          ההקלטות של התפריט הראשי נשמרות בתיקייה <code className="rounded bg-white px-1.5 py-0.5 font-mono">ivr2:/{ext}/</code>
        </span>
        <button
          onClick={generateAll}
          disabled={genAll}
          className="mr-auto inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {genAll ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
          יצירת קול לכל ההודעות
        </button>
      </div>

      {meta.map(m => {
        const value = messages[m.key]?.text ?? m.defaultText
        const audio = messages[m.key]?.audio ?? null
        const busy = busyKey === m.key
        const canGenerate = m.allowAudio && !!value.trim() && !hasPlaceholder(value)
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

            {/* ── מה יושמע בפועל: קובץ קול, או הקראת הטקסט ── */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2.5">
              {audio ? (
                <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold ${
                  isGenerated(audio) ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {isGenerated(audio) ? <Volume2 size={11} /> : <Mic size={11} />}
                  {isGenerated(audio) ? 'קול שנוצר' : 'הקלטה אנושית'}
                  <code className="font-mono opacity-70">{audio}</code>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-500">
                  <Type size={11} /> מוקרא כטקסט
                </span>
              )}

              <input
                ref={el => { fileInputs.current[m.key] = el }}
                type="file" accept="audio/*" className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) void uploadRecording(m.key, f)
                  e.target.value = ''
                }}
              />
              <button
                onClick={() => fileInputs.current[m.key]?.click()}
                disabled={busy || !m.allowAudio}
                className="mr-auto inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:border-teal-300 disabled:opacity-50"
              >
                {busy ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                העלאת קובץ
              </button>
              <button
                onClick={() => void generateVoice(m.key)}
                disabled={busy || !canGenerate}
                title={!canGenerate && hasPlaceholder(value) ? 'הודעה עם {משתנה} אינה יכולה להיות קובץ קול קבוע' : undefined}
                className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-700 hover:bg-violet-100 disabled:opacity-50"
              >
                {busy ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                יצירת קול
              </button>
              {audio && (
                <button
                  onClick={() => void removeAudio(m.key)}
                  disabled={busy}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 size={11} /> הסרה
                </button>
              )}
            </div>
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
