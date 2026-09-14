'use client'
import { useEffect, useRef, useState } from 'react'
import { Play, Pause, X, Download } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// נגן הקלטה — עם מחוון, עצירה וקפיצה לזמן.
//
// 🔴 עד כה ההשמעה הייתה `new Audio(...).play()` בלי שום שליטה: אי אפשר היה
// לעצור באמצע, לחזור אחורה על מילה שלא נשמעה ברור, או לדעת כמה נשאר.
// מי שבדק הודעה בת 20 שניות נאלץ להאזין לכולה, ולהתחיל מחדש בכל פעם.
//
// ⚠️ הרכיב מקבל את המקור מוכן (data URI או URL) ואינו מייצר אותו: היצירה
// עולה כסף בכל שלוחה ומסך, ושכפולה כאן היה מייצר אותה פעמיים לכל השמעה.
// ─────────────────────────────────────────────────────────────────────────────

/** שנייה → "m:ss". ⚠️ NaN לפני שהמטא-דאטה נטענת — מוצג כ-0:00 ולא כ"NaN:aN". */
function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function AudioPlayer({ src, tone = 'slate', fileName, onClose }: {
  /** data URI או URL. שינוי המקור מאפס את הנגן ומתחיל השמעה. */
  src: string
  /** שם הקובץ בהורדה, בלי סיומת. */
  fileName?: string
  /** גוון — תואם למצב שההקלטה שייכת לו. */
  tone?: 'slate' | 'rose' | 'violet'
  /** סגירת הנגן. */
  onClose?: () => void
}) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)

  // ⚠️ מנגן אוטומטית על מקור חדש: המשתמש לחץ "השמע" — לחיצה נוספת על
  // play הייתה מיותרת.
  useEffect(() => {
    const a = ref.current
    if (!a) return
    a.currentTime = 0
    void a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }, [src])

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = ref.current
    if (!a) return
    // ⚠️ dur עשוי להיות 0 עד שהמטא-דאטה נטענת — קפיצה אז תיזרק.
    const t = Number(e.target.value)
    if (Number.isFinite(t)) { a.currentTime = t; setCur(t) }
  }

  const toggle = () => {
    const a = ref.current
    if (!a) return
    if (a.paused) { void a.play().then(() => setPlaying(true)).catch(() => {}) }
    else { a.pause(); setPlaying(false) }
  }

  const ring = tone === 'rose' ? 'border-rose-300 bg-rose-50'
    : tone === 'violet' ? 'border-violet-300 bg-violet-50'
    : 'border-slate-300 bg-white'
  const accent = tone === 'rose' ? 'text-rose-700' : tone === 'violet' ? 'text-violet-700' : 'text-slate-700'

  return (
    <span className={`inline-flex min-w-[13rem] flex-1 items-center gap-2 rounded-lg border px-2 py-1 ${ring}`}>
      <audio ref={ref} src={src} preload="metadata"
        onLoadedMetadata={e => setDur(e.currentTarget.duration)}
        onTimeUpdate={e => setCur(e.currentTarget.currentTime)}
        onEnded={() => { setPlaying(false); setCur(0) }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
      />

      <button type="button" onClick={toggle}
        title={playing ? 'עצור' : 'נגן'}
        className={`shrink-0 rounded-md p-1 transition hover:bg-black/5 ${accent}`}>
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </button>

      {/* 🔴 המחוון — גם מציג התקדמות וגם מאפשר קפיצה.
          ⚠️ dir=ltr במפורש: בתוך עמוד RTL הסרגל מתהפך, והגרירה ימינה
          מריצה את ההקלטה אחורה. */}
      <input type="range" dir="ltr" min={0} max={dur || 0} step={0.05} value={cur}
        onChange={seek}
        aria-label="מיקום בהקלטה"
        className="h-1 min-w-0 flex-1 cursor-pointer accent-current"
        style={{ accentColor: tone === 'rose' ? '#e11d48' : tone === 'violet' ? '#7c3aed' : '#475569' }} />

      <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
        {fmt(cur)} / {fmt(dur)}
      </span>

      {/* 🔴 הורדה — הקובץ עצמו, לא הקלטה מחדש.
          ⚠️ download על data URI עובד ישירות בלי סבב שרת: הקובץ כבר
          נמצא בדפדפן, ובקשה נוספת הייתה מייצרת אותו שוב בתשלום. */}
      <a href={src} download={`${fileName || 'recording'}.mp3`}
        title="הורדת הקובץ"
        className="shrink-0 rounded-md p-0.5 text-slate-400 transition hover:bg-black/5 hover:text-slate-700">
        <Download size={12} />
      </a>

      {onClose && (
        <button type="button" onClick={() => { ref.current?.pause(); onClose() }}
          title="סגור" className="shrink-0 rounded-md p-0.5 text-slate-400 transition hover:bg-black/5 hover:text-slate-600">
          <X size={12} />
        </button>
      )}
    </span>
  )
}
