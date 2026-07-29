'use client'
import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { docThumbUrl } from '@/lib/docUrl'

// ─────────────────────────────────────────────────────────────
// תצוגה מקדימה אחידה למסמך — תמיד <img>, לעולם לא <iframe>.
//
// עד כה PDF הוטמע ב-iframe, ונטפרי (שמיירט כל תגובת application/pdf ושולח
// אותה לבדיקה) החזיר במקומו את דף החסימה שלו — זה מה שנראה בכרטסות כ-NETFREE.
// כאן הכתובת מצביעה ל-/api/files/thumb, שמרנדר את העמוד לתמונה בשרת; מה
// שמגיע לדפדפן הוא PNG רגיל, ולכן אין חסימה והתצוגה מיידית.
// ─────────────────────────────────────────────────────────────
export default function DocPreview(props: DocPreviewProps) {
  // מפתח לפי הכתובת — מסמך אחר מקבל מופע חדש, כך שמצב הטעינה/השגיאה מתאפס
  // מעצמו בלי אפקט
  return <Preview key={`${props.url ?? ''}|${props.page ?? 1}`} {...props} />
}

interface DocPreviewProps {
  url: string | null | undefined
  alt?: string
  /** מחלקות למיכל התצוגה (גובה/רוחב/פינות) */
  className?: string
  /** רוחב הרינדור בפיקסלים — גדול יותר = חד יותר, כבד יותר */
  width?: number
  page?: number
  fit?: 'cover' | 'contain'
  /** מה להציג כשאין תצוגה מקדימה (קובץ חסר/פגום/סוג לא נתמך) */
  fallback?: React.ReactNode
}

function Preview({
  url,
  alt,
  className = '',
  width = 900,
  page = 1,
  fit = 'cover',
  fallback,
}: {
  url: string | null | undefined
  alt?: string
  /** מחלקות למיכל התצוגה (גובה/רוחב/פינות) */
  className?: string
  /** רוחב הרינדור בפיקסלים — גדול יותר = חד יותר, כבד יותר */
  width?: number
  page?: number
  fit?: 'cover' | 'contain'
  /** מה להציג כשאין תצוגה מקדימה (קובץ חסר/פגום/סוג לא נתמך) */
  fallback?: React.ReactNode
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')

  if (!url) return <>{fallback ?? <PreviewFallback />}</>

  return (
    <div className={`relative overflow-hidden bg-slate-100 ${className}`}>
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-300">
          <Loader2 size={18} className="animate-spin" />
        </div>
      )}
      {state === 'error'
        ? (fallback ?? <PreviewFallback />)
        : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={docThumbUrl(url, { page, width })}
            alt={alt || 'מסמך'}
            loading="lazy"
            onLoad={() => setState('ok')}
            onError={() => setState('error')}
            className={`w-full h-full ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${
              state === 'ok' ? 'opacity-100' : 'opacity-0'
            } transition-opacity duration-200`}
          />
        )}
    </div>
  )
}

// נפילה-לאחור אחידה: אין תצוגה מקדימה, אבל ברור שיש כאן קובץ
export function PreviewFallback({ label = 'אין תצוגה מקדימה' }: { label?: string }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-slate-50 text-slate-400">
      <FileText size={22} />
      <span className="text-[10px] font-medium text-center px-1">{label}</span>
    </div>
  )
}
