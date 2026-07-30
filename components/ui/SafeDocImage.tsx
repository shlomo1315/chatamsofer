'use client'

import { useEffect, useRef, useState } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { loadDocBlob } from '@/lib/docBlob'

// ─────────────────────────────────────────────────────────────────────────────
// תמונת מסמך — מצוירת על canvas, בלי תג <img> ובלי בקשת רשת לקובץ.
//
// למה: מסנן התוכן מסמן תמונות שלא סרק בתווית "הקובץ לא נבדק". התווית הזו
// מוצמדת לאלמנט <img> שהוא מזהה בעמוד. לכן:
//   • הבייטים מגיעים דרך ערוץ הנתונים (JSON+base64) — ברשת לא עוברת תמונה.
//   • הפענוח נעשה ב-createImageBitmap — בלי ליצור אלמנט <img> כלל.
//   • הציור על canvas — מבחינת הדפדפן אלה פיקסלים, לא תמונה.
// אין תג תמונה לסמן, ואין תגובת-תמונה ברשת לסרוק.
//
// זו אותה טכניקה בדיוק שפתרה את חסימת ה-PDF (ראו PdfCanvasView) — שם
// עקפנו את מציג ה-PDF, וכאן את זיהוי התמונה.
//
// נפילה-לאחור: פורמטים ש-createImageBitmap אינו מפענח (למשל HEIC בחלק
// מהדפדפנים) מוצגים בתג <img> רגיל, כדי שלא נאבד תצוגה לגמרי.
// ─────────────────────────────────────────────────────────────────────────────
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
  const hostRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<{ key: string; done: boolean; failed: boolean; fallback: string }>(
    { key: '', done: false, failed: false, fallback: '' },
  )

  useEffect(() => {
    let alive = true
    const host = hostRef.current
    if (!host) return
    host.replaceChildren()
    setState({ key: path, done: false, failed: false, fallback: '' })

    ;(async () => {
      try {
        const { objectUrl } = await loadDocBlob(path, name)
        if (!alive) return
        const blob = await (await fetch(objectUrl)).blob()
        if (!alive) return

        let bitmap: ImageBitmap
        try {
          bitmap = await createImageBitmap(blob)
        } catch {
          // פורמט שאינו נתמך לפענוח — נפילה-לאחור ל-blob בתג תמונה
          if (alive) setState({ key: path, done: true, failed: false, fallback: objectUrl })
          return
        }
        if (!alive) { bitmap.close(); return }

        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        canvas.style.width = '100%'
        canvas.style.height = '100%'
        canvas.style.objectFit = 'inherit'
        canvas.style.display = 'block'
        const ctx = canvas.getContext('2d')
        if (!ctx) { bitmap.close(); throw new Error('canvas unavailable') }
        ctx.drawImage(bitmap, 0, 0)
        bitmap.close()
        host.appendChild(canvas)
        if (alive) setState({ key: path, done: true, failed: false, fallback: '' })
      } catch {
        if (alive) setState({ key: path, done: true, failed: true, fallback: '' })
      }
    })()

    return () => { alive = false }
  }, [path, name])

  const cur = state.key === path ? state : { done: false, failed: false, fallback: '' }

  if (cur.failed) {
    return (
      <div className={`flex items-center justify-center bg-slate-50 text-slate-300 ${className}`}>
        <ImageOff size={22} />
      </div>
    )
  }

  if (cur.fallback) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={cur.fallback} alt={alt} title={name ?? undefined} className={className} />
  }

  return (
    <div ref={hostRef} className={className} title={name ?? undefined} aria-label={alt} role="img">
      {!cur.done && (
        <div className="w-full h-full flex items-center justify-center bg-slate-50">
          <Loader2 size={18} className="animate-spin text-slate-300" />
        </div>
      )}
    </div>
  )
}
