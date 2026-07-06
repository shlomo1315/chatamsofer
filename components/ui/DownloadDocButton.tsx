'use client'
import { Download } from 'lucide-react'
import { docDownloadUrl } from '@/lib/docUrl'

// כפתור הורדה ישירה של מסמך למחשב — נלווה לכל תצוגת מסמך במערכת.
// url = URL/נתיב אחסון של המסמך · name = שם הקובץ שיישמר (לא חובה).
export default function DownloadDocButton({
  url,
  name,
  label = 'הורדה',
  variant = 'button',
  className = '',
}: {
  url: string | null | undefined
  name?: string | null
  label?: string
  variant?: 'button' | 'icon'
  className?: string
}) {
  if (!url) return null
  const href = docDownloadUrl(url, name)

  if (variant === 'icon') {
    return (
      <a href={href} download={name || true} title="הורדה למחשב"
        onClick={e => e.stopPropagation()}
        className={`inline-flex items-center justify-center p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 transition-colors ${className}`}>
        <Download size={14} />
      </a>
    )
  }

  return (
    <a href={href} download={name || true}
      onClick={e => e.stopPropagation()}
      className={`inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-white hover:bg-emerald-600 px-2.5 py-1.5 rounded-lg border border-emerald-200 hover:border-emerald-600 transition-colors ${className}`}>
      <Download size={14} /> {label}
    </a>
  )
}
