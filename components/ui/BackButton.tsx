'use client'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'

// חץ חזרה — חוזר אחורה בהיסטוריה (למקום שממנו הגעת), עם נפילה לכתובת ברירת מחדל
export default function BackButton({ fallback, className }: { fallback: string; className?: string }) {
  const router = useRouter()
  const onClick = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push(fallback)
  }
  return (
    <button onClick={onClick} aria-label="חזרה"
      className={className ?? 'text-slate-400 hover:text-slate-600'}>
      <ArrowRight size={20} />
    </button>
  )
}
