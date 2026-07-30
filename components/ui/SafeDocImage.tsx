'use client'

import { useEffect, useState } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { loadDocBlob } from '@/lib/docBlob'

// תמונת מסמך שנטענת דרך ערוץ הנתונים (/api/files/data) ולא כקובץ.
//
// <img src="/api/files?..."> מייצר בקשת רשת שהתגובה שלה היא תמונה, ומסנן
// תוכן עשוי לעכב אותה. כאן הבייטים מגיעים כ-JSON, מורכבים ל-Blob מקומי,
// וה-src הוא כתובת blob: שאינה עוברת ברשת כלל.
export default function SafeDocImage({
  path,
  alt = 'מסמך',
  name,
  className = '',
}: {
  /** נתיב האחסון או ה-URL המקורי של המסמך */
  path: string
  alt?: string
  name?: string | null
  className?: string
}) {
  // מצב אחד עם מפתח הנתיב — כך החלפת path מאפסת את התצוגה בזמן ה-render
  // (בלי setState בגוף ה-effect, שמייצר רינדור מדורג).
  const [state, setState] = useState({ key: '', src: '', failed: false })

  useEffect(() => {
    let alive = true
    loadDocBlob(path, name)
      .then(d => { if (alive) setState({ key: path, src: d.objectUrl, failed: false }) })
      .catch(() => { if (alive) setState({ key: path, src: '', failed: true }) })
    return () => { alive = false }
    // ה-objectUrl מנוהל במטמון של docBlob ואינו משוחרר כאן בכוונה —
    // אותה תמונה מוצגת בכמה מקומות, ושחרור מוקדם היה שובר את השאר.
  }, [path, name])

  const { src, failed } = state.key === path ? state : { src: '', failed: false }

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-slate-50 text-slate-300 ${className}`}>
        <ImageOff size={22} />
      </div>
    )
  }
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-slate-50 text-slate-300 ${className}`}>
        <Loader2 size={18} className="animate-spin" />
      </div>
    )
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} />
}
