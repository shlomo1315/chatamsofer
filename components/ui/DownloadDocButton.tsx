'use client'
import { Download } from 'lucide-react'
import { docDownloadUrl, docDownloadName } from '@/lib/docUrl'
import { downloadDocDirect } from './DocViewer'

// כפתור הורדה ישירה של מסמך למחשב — נלווה לכל תצוגת מסמך במערכת.
// מוריד דרך fetch+blob כדי שהקובץ יירד ישירות למחשב, בלי פתיחת לשונית/ניווט,
// ובפורמט המקורי. אם ההורדה נכשלת (למשל CORS) — נפילה-לאחור לקישור הורדה ישיר.
// url = URL/נתיב אחסון של המסמך · name = שם הקובץ שיישמר (לא חובה).
// docType/person (לא חובה) — כשמסופקים, שם ההורדה נבנה כ"סוג המסמך + שם המוטב"
// עם הסיומת המקורית (למשל "תעודת זהות משה כהן.pdf") במקום שם הקובץ הגולמי.
export default function DownloadDocButton({
  url,
  name,
  docType,
  person,
  label = 'הורדה',
  variant = 'button',
  className = '',
}: {
  url: string | null | undefined
  name?: string | null
  docType?: string | null
  person?: string | null
  label?: string
  variant?: 'button' | 'icon'
  className?: string
}) {
  if (!url) return null
  // שם ההורדה בפועל: אם סופק סוג/שם מוטב — שם משמעותי; אחרת השם המקורי.
  const saveName = (docType || person) ? docDownloadName(docType, person, name ?? url) : name
  const href = docDownloadUrl(url, saveName)

  const handle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await downloadDocDirect(url, saveName)
    } catch {
      // נפילה-לאחור: ניווט ישיר לקישור ההורדה (Content-Disposition: attachment) — עדיין ללא לשונית חדשה
      window.location.href = href
    }
  }

  if (variant === 'icon') {
    return (
      <a href={href} download={saveName || true} title="הורדה למחשב" onClick={handle}
        className={`inline-flex items-center justify-center p-1.5 rounded-lg text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 transition-colors ${className}`}>
        <Download size={14} />
      </a>
    )
  }

  return (
    <a href={href} download={saveName || true} onClick={handle}
      className={`inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-white hover:bg-emerald-600 px-2.5 py-1.5 rounded-lg border border-emerald-200 hover:border-emerald-600 transition-colors ${className}`}>
      <Download size={14} /> {label}
    </a>
  )
}
