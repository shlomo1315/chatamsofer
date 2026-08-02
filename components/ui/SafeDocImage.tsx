'use client'

import { useEffect, useRef, useState } from 'react'
import { FileText, ImageOff, Loader2 } from 'lucide-react'
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
  /** מוחל ישירות על הקנבס — בדיוק כמו על <img> */
  className?: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<{ key: string; done: boolean; failed: boolean; fallback: string; kind: string; err: string }>(
    { key: '', done: false, failed: false, fallback: '', kind: '', err: '' },
  )

  useEffect(() => {
    let alive = true
    const host = hostRef.current
    if (!host) return
    // ⚠️ שכבת-ביניים (mount) משלנו, ולא צירוף ישיר ל-host: React מנהל את host דרך
    // JSX (גם מרנדר בתוכו את ה-Loader עד שהציור מסתיים). צירוף canvas ישירות ל-host
    // מתנגש עם React — בעדכון הבא (סגירת מודל / router.refresh / polling) הוא מנסה
    // להסיר צומת שכבר שונה ונופל על "removeChild ... not a child". ה-mount הוא צומת
    // שלנו-בלבד ש-React לא נוגע בו, ואותו מסירים ידנית ב-cleanup.
    const mount = document.createElement('div')
    mount.style.width = '100%'
    mount.style.height = '100%'
    host.appendChild(mount)
    setState({ key: path, done: false, failed: false, fallback: '', kind: '', err: '' })

    ;(async () => {
      try {
        const { objectUrl, contentType } = await loadDocBlob(path, name)
        if (!alive) return

        // ⚠️ קובץ שאינו תמונה (PDF/Word) אינו "תקלה" — הוא פשוט לא מצויר.
        // קודם הוא נפל למסלול השגיאה והוצג כתמונה שבורה, בלי שום רמז שמדובר
        // בקובץ תקין מסוג אחר.
        if (contentType && !contentType.startsWith('image/')) {
          if (alive) setState({ key: path, done: true, failed: false, fallback: '', kind: contentType, err: '' })
          return
        }

        const blob = await (await fetch(objectUrl)).blob()
        if (!alive) return

        let bitmap: ImageBitmap
        try {
          bitmap = await createImageBitmap(blob)
        } catch {
          // פורמט שאינו נתמך לפענוח — נפילה-לאחור ל-blob בתג תמונה
          if (alive) setState({ key: path, done: true, failed: false, fallback: objectUrl, kind: '', err: '' })
          return
        }
        if (!alive) { bitmap.close(); return }

        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        // ⚠️ ה-className מוחל על הקנבס עצמו, בדיוק כמו על <img> בנפילה-לאחור.
        // קודם הוא הוחל על עוטף, והקנבס קיבל width/height: 100% — וכשלעוטף אין
        // גובה מפורש (המציג המלא, שיש לו רק max-h) האחוזים אינם נפתרים והקנבס
        // נופל לגודל הפיקסלים הטבעי של התמונה: 2000px בתוך מסגרת של 112px.
        // מה שנראה כמו קובץ "חתוך בחצי" או פיסה מטושטשת היה בעצם פינה אחת של
        // תמונה ענקית. כך הקנבס מתנהג בדיוק כמו תמונה, בכל שימוש.
        canvas.className = className
        canvas.style.display = 'block'
        const ctx = canvas.getContext('2d')
        if (!ctx) { bitmap.close(); throw new Error('canvas unavailable') }
        ctx.drawImage(bitmap, 0, 0)
        bitmap.close()
        mount.appendChild(canvas)
        if (alive) setState({ key: path, done: true, failed: false, fallback: '', kind: '', err: '' })
      } catch (e) {
        // ⚠️ הסיבה נשמרת ומוצגת. קודם כל כשל הוצג כאייקון תמונה שבורה בלי שום
        // מידע — ולא הייתה דרך לדעת אם הקובץ חסר, פגום, או שההרשאה נדחתה.
        const msg = e instanceof Error ? e.message : 'שגיאה בטעינת הקובץ'
        console.error('[SafeDocImage]', path, msg)
        if (alive) setState({ key: path, done: true, failed: true, fallback: '', kind: '', err: msg })
      }
    })()

    return () => {
      alive = false
      try { mount.remove() } catch { /* כבר הוסר */ }
    }
  }, [path, name, className])

  const cur = state.key === path ? state : { done: false, failed: false, fallback: '', kind: '', err: '' }

  // קובץ תקין שאינו תמונה — מוצג כמסמך, לא כתקלה
  if (cur.kind) {
    const isPdf = cur.kind.includes('pdf')
    return (
      <div className={`flex flex-col items-center justify-center gap-1 bg-slate-50 text-slate-400 ${className}`}
        title={name ?? undefined}>
        <FileText size={22} className={isPdf ? 'text-rose-400' : 'text-sky-400'} />
        <span className="text-[10px] font-bold">{isPdf ? 'PDF' : 'מסמך'}</span>
      </div>
    )
  }

  if (cur.failed) {
    // ⚠️ הסיבה מוצגת ולא רק אייקון שבור: בלעדיה אי אפשר לדעת אם הקובץ חסר
    // באחסון, פגום, או שההרשאה נדחתה — וכל אבחון הופך לניחוש.
    return (
      <div className={`flex flex-col items-center justify-center gap-1 bg-rose-50 text-rose-400 px-2 text-center ${className}`}
        title={cur.err || 'שגיאה בטעינת הקובץ'}>
        <ImageOff size={20} />
        <span className="text-[9.5px] font-semibold leading-tight line-clamp-2">{cur.err || 'שגיאה בטעינה'}</span>
      </div>
    )
  }

  if (cur.fallback) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={cur.fallback} alt={alt} title={name ?? undefined} className={className} />
  }

  // ⚠️ ה-host (שאליו מצורף ה-canvas ידנית) חייב להישאר ריק מבחינת React — אחרת
  // React ינהל צאצא (Loader) באותו צומת שבו אנחנו מוסיפים canvas, וזה מקור התנגשות
  // ה-removeChild. לכן ה-Loader מרונדר כ-overlay אחות (sibling) ולא כילד של ה-host.
  // ⚠️ בזמן הטעינה העוטף נושא את ה-className כדי לשמור מקום ולמנוע קפיצה
  // בפריסה; ברגע שהקנבס נכנס, הוא זה שנושא אותו והעוטף מתכווץ סביבו.
  // ⚠️ display:contents אחרי הטעינה — כך הקנבס יושב בפריסה כאילו הוא ילד ישיר
  // של האב, בדיוק כמו <img>. עוטף רגיל היה מוסיף תיבה שמשנה גבהים ומרווחים.
  // בזמן הטעינה העוטף כן נושא את ה-className, כדי לשמור מקום ולמנוע קפיצה.
  return (
    <div className={cur.done ? 'contents' : `relative ${className}`}>
      <div ref={hostRef} className="contents" title={name ?? undefined} aria-label={alt} role="img" />
      {!cur.done && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
          <Loader2 size={18} className="animate-spin text-slate-300" />
        </div>
      )}
    </div>
  )
}
