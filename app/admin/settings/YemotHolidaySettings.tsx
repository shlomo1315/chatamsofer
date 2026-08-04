'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, Type, Mic, Volume2, Upload, Trash2, Wand2, Play } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

type Msg = { text: string; audio?: string | null }
type Meta = { key: string; label: string; defaultText: string; allowAudio: boolean; placeholders?: string[]; hint?: string }

// הודעה כשירה להשמעה מקדימה: אין בה placeholder כמו {name} שדורש נתון אמיתי מהשיחה
const hasPlaceholder = (t: string) => /\{[^}]+\}/.test(t)

// ─────────────────────────────────────────────────────────────────────────────
// הודעות שלוחת חלוקות החגים בימות.
//
// ⚠️ הטקסטים כאן הם *מה שהמשפחה שומעת בטלפון*, וזה הערוץ המרכזי לרישום —
// חלק גדול מהמשפחות אינן גולשות. לכן כל הודעה נפרדת וניתנת לעריכה, כולל
// ההודעה למי שהמספר שלו אינו מזוהה ולמי שכבר נרשם.
//
// הודעות עם {name} / {distribution} הן דינמיות: הן מקריאות את שם המשפחה ואת שם
// החלוקה הפעילה, ולכן חובה לשמור בהן את המשתנה (השרת חוסם שמירה בלעדיו).
// ─────────────────────────────────────────────────────────────────────────────
export default function YemotHolidaySettings() {
  const toast = useToast()
  const [meta, setMeta] = useState<Meta[]>([])
  const [messages, setMessages] = useState<Record<string, Msg>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  // ⚠️ אותו מנגנון קול בדיוק כמו בשלוחת היולדות: הקלטה אנושית או קול נוירוני,
  // לכל הודעה בנפרד. הודעה שיש לה קובץ — מושמעת ממנו (f-<file>) ולא כ-TTS.
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [hasKey, setHasKey] = useState(false)
  const [voiceId, setVoiceId] = useState('')
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({})
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // ⚠️ קובץ קול נוצר מהטקסט *השמור*, ולכן שינוי טקסט שלא נשמר עלול לייצר קול
  // שאינו תואם למה שמוצג. הכפתור מודיע על זה במקום להסתיר.
  const uploadRecording = async (key: string, file: File) => {
    setBusyKey(key)
    try {
      const fd = new FormData()
      fd.set('key', key); fd.set('file', file)
      const res = await fetch('/api/admin/yemot-holiday/recording', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'ההעלאה נכשלה'); setBusyKey(null); return }
      setMessages(d.messages ?? messages)
      toast.success('ההקלטה הועלתה')
    } catch { toast.error('שגיאת רשת') }
    setBusyKey(null)
  }

  const removeRecording = async (key: string) => {
    setBusyKey(key)
    try {
      const res = await fetch(`/api/admin/yemot-holiday/recording?key=${encodeURIComponent(key)}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'ההסרה נכשלה'); setBusyKey(null); return }
      setMessages(d.messages ?? messages)
      toast.success('הקול הוסר — ההודעה תוקרא כטקסט')
    } catch { toast.error('שגיאת רשת') }
    setBusyKey(null)
  }

  const generateVoice = async (key: string, text: string) => {
    setBusyKey(key)
    try {
      const res = await fetch('/api/admin/yemot-holiday/generate-voice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, text }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'יצירת הקול נכשלה'); setBusyKey(null); return }
      setMessages(d.messages ?? messages)
      toast.success('נוצר קול טבעי להודעה')
    } catch { toast.error('שגיאת רשת') }
    setBusyKey(null)
  }

  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/admin/yemot-holiday/messages').then(r => r.json().then(data => ({ ok: r.ok, data }))),
      fetch('/api/admin/elevenlabs/settings').then(r => r.json().then(data => ({ ok: r.ok, data }))).catch(() => ({ ok: false, data: {} })),
    ])
      .then(([msgs, cfg]) => {
        if (!alive) return
        if (!msgs.ok) { toast.error(msgs.data.error || 'שגיאה בטעינה'); return }
        setMeta(msgs.data.meta ?? [])
        setMessages(msgs.data.messages ?? {})
        if (cfg.ok) {
          setHasKey(!!cfg.data.hasKey)
          setVoiceId(cfg.data.voiceId ?? '')
        }
      })
      .catch(() => { if (alive) toast.error('שגיאה בטעינת ההודעות') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // השמעה מקדימה — מייצר אודיו ומשמיע בדפדפן בלי להעלות לימות
  const preview = async (id: string, text: string) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setPreviewId(id)
    try {
      const res = await fetch('/api/admin/elevenlabs/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voiceId: voiceId || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `שגיאה בהשמעה (${res.status})`)
      if (!data?.audio) throw new Error(data?.error || 'לא התקבל אודיו')
      const audio = new Audio(`data:${data.mime || 'audio/mpeg'};base64,${data.audio}`)
      audioRef.current = audio
      audio.onended = () => { if (audioRef.current === audio) audioRef.current = null }
      audio.onerror = () => toast.error('הדפדפן לא הצליח לנגן את האודיו')
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
      const res = await fetch('/api/admin/yemot-holiday/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    return <div className="flex items-center gap-2 py-6 text-sm text-slate-400"><Loader2 size={15} className="animate-spin" /> טוען הודעות…</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-[12.5px] leading-relaxed text-teal-900">
        {/* ⚠️ שלב א' — רישום בלבד. שיוך הכרטיס והטעינה בשלב הבא ואינם בשלוחה הזו. */}
        השלוחה מבקשת <strong>הקשת 9 ספרות תעודת הזהות של הנרשם</strong>, מקריאה את שם המשפחה שזוהתה
        ואת שם החלוקה הפתוחה, ומבקשת <strong>הקשה 1</strong> לרישום. זה הכל.
        <ul className="my-1.5 mr-4 list-disc space-y-0.5">
          <li>
            {/* ⚠️ הזיהוי אינו לפי הטלפון: על אותו מספר יכולים להיות כמה נרשמים. */}
            הזיהוי לפי <strong>ת״ז ולא לפי מספר הטלפון</strong> — על אותו מספר יכולים להיות רשומים
            כמה נרשמים (הורים וילדים נשואים באותו בית). ת״ז של הבעל או של האישה, שתיהן מזוהות.
          </li>
          <li>
            הרישום פתוח <strong>רק למי שיש לו כרטסת באיגוד הצאצאים</strong>. מי שמופיע כילד בכרטסת של
            הוריו אינו רשום באיגוד בעצמו, ולכן ת״ז שלו לא תימצא וישמע שעליו להירשם קודם לאיגוד.
          </li>
          <li>טעות בהקשה — עד שלושה נסיונות באותה שיחה, בלי לנתק ולחייג שוב.</li>
          <li>
            מי שכבר נרשם — בטלפון, באתר, במייל או בטופס נדרים — שומע שרישומו כבר נקלט,
            <strong>לפני</strong> שמוצע לו להקיש 1, ואינו נרשם פעמיים.
          </li>
          <li>כרטסת שאינה פעילה או שנדחתה נחסמת ושומעת הסבר, ולא הודעת תקלה.</li>
        </ul>
        בימות מגדירים <strong>שלוחה אחת מסוג API</strong>. אין צורך בתת-שלוחות.
        <br />
        כתובת השלוחה: <code className="rounded bg-white px-1.5 py-0.5 text-[11px]" dir="ltr">/api/webhooks/yemot-holiday</code>
      </div>

      {meta.map(m => {
        const value = messages[m.key]?.text ?? m.defaultText
        const missingVar = (m.placeholders ?? []).filter(p => !value.includes(`{${p}}`))
        return (
          <div key={m.key} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2">
              <Type size={14} className="text-slate-400" />
              <span className="text-[13px] font-bold text-slate-800">{m.label}</span>
              {(m.placeholders ?? []).map(p => (
                <code key={p} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10.5px] font-bold text-indigo-700" dir="ltr">{`{${p}}`}</code>
              ))}
            </div>
            <textarea
              value={value}
              onChange={e => setMessages(prev => ({ ...prev, [m.key]: { ...(prev[m.key] ?? {}), text: e.target.value } }))}
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
            {m.hint && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{m.hint}</p>}
            {missingVar.length > 0 && (
              <p className="mt-1.5 text-[11.5px] font-bold text-red-600">
                חסר בטקסט: {missingVar.map(p => `{${p}}`).join(' ')} — בלעדיו ההודעה לא תקריא את הנתון
              </p>
            )}
            {/* ── קול ההודעה ── */}
            {/* ⚠️ רק להודעה שאינה דינמית: קובץ קול אחד אינו יכול להקריא שם משפחה
                או שם חלוקה שמשתנים בכל שיחה, ולכן השרת חוסם זאת גם אם ננסה. */}
            {m.allowAudio ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {messages[m.key]?.audio ? (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    messages[m.key]?.audio?.startsWith('tts_')
                      ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {messages[m.key]?.audio?.startsWith('tts_')
                      ? <><Volume2 size={11} /> קול טבעי</>
                      : <><Mic size={11} /> הקלטה אנושית</>}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                    <Type size={11} /> קול ממוחשב
                  </span>
                )}

                <input
                  ref={el => { fileInputs.current[m.key] = el }}
                  type="file" accept="audio/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) void uploadRecording(m.key, f); e.target.value = '' }}
                />
                <button type="button" disabled={busyKey === m.key}
                  onClick={() => fileInputs.current[m.key]?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11.5px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
                  {busyKey === m.key ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  העלאת הקלטה
                </button>
                <button type="button" disabled={busyKey === m.key}
                  onClick={() => void generateVoice(m.key, value)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 px-2.5 py-1.5 text-[11.5px] font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60">
                  {busyKey === m.key ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
                  יצירת קול טבעי
                </button>
                {hasKey && voiceId && !hasPlaceholder(value) && (
                  <button type="button" disabled={previewId === m.key || busyKey === m.key}
                    onClick={() => void preview(m.key, value)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
                    {previewId === m.key ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                    השמע
                  </button>
                )}
                {messages[m.key]?.audio && (
                  <button type="button" disabled={busyKey === m.key}
                    onClick={() => void removeRecording(m.key)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-60">
                    <Trash2 size={12} /> הסרת הקול
                  </button>
                )}
                {messages[m.key]?.audio && (
                  <span className="text-[11px] text-slate-400">
                    ההודעה מושמעת מהקובץ. אחרי עריכת הטקסט יש ליצור קול מחדש כדי שהם יתאימו.
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-slate-400">
                הודעה דינמית — מוקראת תמיד כטקסט, כי קובץ קול אחד אינו יכול להקריא נתון שמשתנה בכל שיחה.
              </p>
            )}

            {/* ⚠️ להימנע מנקודות, מקפים וגרשיים — הם משבשים את ההקראה בימות */}
            {/[.\-"'&|]/.test(value) && (
              <p className="mt-1.5 text-[11.5px] font-bold text-amber-700">
                יש בטקסט תווים שמשבשים את ההקראה (נקודה, מקף, גרשיים) — הם יוסרו אוטומטית בשיחה
              </p>
            )}
          </div>
        )
      })}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          שמירת ההודעות
        </Button>
        {savedOk && <span className="text-[13px] font-bold text-green-600">✓ נשמר</span>}
      </div>
    </div>
  )
}
