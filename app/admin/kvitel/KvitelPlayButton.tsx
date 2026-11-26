'use client'
import { useEffect, useRef, useState } from 'react'
import { Loader2, Pause, Play } from 'lucide-react'
import { recordingPlayable, useRecordingSrc } from './useRecordingSrc'

// הקלטה אחת מתנגנת בכל פעם: לחיצה על משולש בשורה אחרת עוצרת את הקודמת
let current: HTMLAudioElement | null = null

// משולש השמעה בשורה ברשימה: מנגן את ההקלטה בלי לפתוח את השורה, כדי שאפשר לתקן את השמות בתאים תוך כדי שמיעה.
// ההקלטה נטענת רק בלחיצה הראשונה (מהדלי הפרטי דרך useRecordingSrc), לא לכל השורות מראש.
export default function KvitelPlayButton({ url, who, className = '' }: { url: string; who: string; className?: string }) {
  const [armed, setArmed] = useState(false)
  const [playing, setPlaying] = useState(false)
  const { src, failed } = useRecordingSrc(armed ? url : null)
  const audio = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const a = audio.current
    if (!armed || !src || !a) return
    if (current && current !== a) current.pause()
    current = a
    a.play().catch(() => setPlaying(false))
  }, [armed, src])
  useEffect(() => () => { if (current === audio.current) current = null }, [])

  if (!recordingPlayable(url)) return null
  const loading = armed && !src && !failed
  const toggle = () => {
    const a = audio.current
    if (!armed) { setArmed(true); return }
    if (!a || !src) return
    if (a.paused) { if (current && current !== a) current.pause(); current = a; void a.play().catch(() => setPlaying(false)) } else a.pause()
  }
  const Icon = loading ? Loader2 : playing ? Pause : Play
  return (
    <>
      <button type="button" onClick={toggle} data-play={url} aria-pressed={playing} disabled={failed}
        title={failed ? 'טעינת ההקלטה נכשלה' : undefined}
        aria-label={`${failed ? 'טעינת ההקלטה נכשלה' : playing ? 'עצירת ההקלטה' : 'השמעת ההקלטה'} של ${who}`}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${playing ? 'bg-navy text-white' : 'border border-line bg-white text-navy hover:border-[#cfc8bb]'} disabled:text-[#B42318] disabled:opacity-60 ${className}`}>
        <Icon className={`h-4 w-4 ${loading ? 'animate-spin' : ''} ${Icon === Play ? 'fill-current' : ''}`} aria-hidden />
      </button>
      {src && <audio ref={audio} src={src} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} hidden />}
    </>
  )
}
