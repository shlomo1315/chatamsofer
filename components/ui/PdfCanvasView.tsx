'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, AlertTriangle, FileText } from 'lucide-react'
import { loadDocBlob } from '@/lib/docBlob'

// ─────────────────────────────────────────────────────────────────────────────
// תצוגת PDF שמצוירת על גבי canvas.
//
// למה לא <iframe> / <embed>: החסימה של נטפרי אינה על העברת הקובץ אלא על
// **מציג ה-PDF המובנה של הדפדפן**. לכן גם אחרי שהעברנו את הבייטים כנתונים
// (JSON+base64) ולא כקובץ, והצגנו מ-blob: מקומי — ברגע שהדפדפן מפעיל את
// המציג שלו כדי לצייר את הקובץ, המציג נחסם ומוצג דף NETFREE. זה גם מסביר
// למה תמונות תמיד עבדו ו-PDF תמיד נחסם, בכל שיטה שניסינו.
//
// כאן אנחנו מפענחים את ה-PDF בעצמנו (pdf.js) ומציירים כל עמוד על canvas.
// מבחינת הדפדפן זו ציור על קנבס — בדיוק כמו תמונה. אין מציג PDF, אין תוסף,
// ואין בקשת רשת לקובץ. אין מה לחסום.
// ─────────────────────────────────────────────────────────────────────────────

// טעינה עצלה — pdf.js כבד (~1MB) ואין סיבה לשלם עליו עד שנפתח PDF בפועל.
async function getPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  // ה-worker נארז ומוגש מהדומיין שלנו (webpack asset module), לא מ-CDN חיצוני —
  // גם כדי שלא ייחסם וגם כי CSP מתיר רק מקור עצמי.
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url,
  ).toString()
  return pdfjs
}

export default function PdfCanvasView({
  url,
  name,
  className = '',
  maxPages,
  cover = false,
  direct = false,
}: {
  url: string
  name?: string | null
  className?: string
  /** מגבלת עמודים — 1 לתצוגה מקדימה (thumbnail), ללא ערך = כל העמודים */
  maxPages?: number
  /** תצוגה מקדימה: העמוד ממלא את המסגרת וגלישה נחתכת (כמו object-cover בתמונה) */
  cover?: boolean
  /** משיכה ישירה מהכתובת במקום דרך ערוץ הנתונים — לפורטלים שאין להם סשן צוות.
      🔴 אין להשתמש בזה על נתיב שדורש סשן: pdf.js יקבל HTML של דף שגיאה
      ויפול ב-"Invalid PDF structure".
      (פורטל בית ההחלמה), שבהם הקובץ ממילא נגיש בכתובת ציבורית. */
  direct?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<{ key: string; pages: number; error: string; loading: boolean }>(
    { key: '', pages: 0, error: '', loading: true },
  )

  useEffect(() => {
    let alive = true
    const host = hostRef.current
    if (!host) return
    // ⚠️ יוצרים שכבת-ביניים (mount) משלנו בתוך ה-host ומצרפים אליה את ה-canvases.
    // חובה: React מנהל את host דרך JSX (<div ref={hostRef} />). אם נצרף canvas
    // ישירות ל-host, React לא יודע עליו, וכשמגיע עדכון (סגירת המודל / router.refresh
    // / polling) הוא מנסה לתקן את ה-DOM שלו ונופל על "removeChild ... not a child".
    // ה-mount הוא צומת שלנו-בלבד ש-React לעולם לא נוגע בו — כל ה-canvases חיים בתוכו,
    // וב-cleanup אנחנו מסירים אותו בעצמנו. כך אין התנגשות בין React למניפולציה הידנית.
    const mount = document.createElement('div')
    if (cover) { mount.style.width = '100%'; mount.style.height = '100%'; mount.style.overflow = 'hidden' }
    host.appendChild(mount)
    setState({ key: url, pages: 0, error: '', loading: true })

    ;(async () => {
      try {
        const [src, pdfjs] = await Promise.all([
          direct ? Promise.resolve(url) : loadDocBlob(url, name).then(d => d.objectUrl),
          getPdfjs(),
        ])
        if (!alive) return
        // בערוץ הנתונים ה-blob כבר בזיכרון; ב-direct זו משיכה רגילה מהכתובת.
        //
        // 🔴 credentials חובה: בלעדיו הדפדפן אינו שולח את עוגיית הסשן,
        // ונתיב שדורש הרשאת צוות מחזיר HTML של דף שגיאה. pdf.js מנסה
        // לפענח אותו ונופל ב-"Invalid PDF structure" — שגיאה שנראית
        // כאילו הקובץ פגום, בזמן שהבעיה היא הרשאה.
        const res = await fetch(src, { credentials: 'same-origin' })
        if (!res.ok) {
          throw new Error(res.status === 401 || res.status === 403
            ? 'אין הרשאה להצגת המסמך'
            : `טעינת המסמך נכשלה (${res.status})`)
        }
        // ⚠️ בדיקת סוג התוכן לפני הפענוח: שגיאה שמוחזרת כ-HTML או JSON
        // הייתה נראית כ-PDF פגום, וההודעה למשתמש הייתה מטעה לחלוטין.
        const ct = res.headers.get('content-type') ?? ''
        if (direct && ct && !/pdf|octet-stream/i.test(ct)) {
          throw new Error('התקבלה תגובה שאינה מסמך')
        }
        const bytes = new Uint8Array(await res.arrayBuffer())
        if (!alive) return
        const doc = await pdfjs.getDocument({ data: bytes }).promise
        if (!alive) return

        // רוחב התצוגה — מצייר ברזולוציה כפולה כדי שיישאר חד גם במסכי Retina
        const cssWidth = Math.min(host.clientWidth || 800, 1000)
        const scaleFactor = Math.min(window.devicePixelRatio || 1, 2)

        const lastPage = maxPages ? Math.min(maxPages, doc.numPages) : doc.numPages
        for (let n = 1; n <= lastPage; n++) {
          if (!alive) return
          const page = await doc.getPage(n)
          const base = page.getViewport({ scale: 1 })
          const viewport = page.getViewport({ scale: (cssWidth / base.width) * scaleFactor })

          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.width = '100%'
          canvas.style.height = cover ? '100%' : 'auto'
          if (cover) canvas.style.objectFit = 'cover'
          canvas.style.display = 'block'
          if (!cover) { canvas.style.marginBottom = '12px'; canvas.style.borderRadius = '8px' }
          canvas.style.background = '#fff'
          const ctx = canvas.getContext('2d')
          if (!ctx) continue
          await page.render({ canvasContext: ctx, viewport }).promise
          if (!alive) return
          mount.appendChild(canvas)
        }
        if (alive) setState({ key: url, pages: doc.numPages, error: '', loading: false })
      } catch (e) {
        if (alive) {
          setState({
            key: url, pages: 0, loading: false,
            error: e instanceof Error ? e.message : 'לא ניתן להציג את הקובץ',
          })
        }
      }
    })()

    // cleanup: מסירים את ה-mount שיצרנו (עם כל ה-canvases שבתוכו) בעצמנו.
    // ה-host עצמו נשאר ריק מבחינת React — כפי ש-React מצפה.
    return () => {
      alive = false
      try { mount.remove() } catch { /* כבר הוסר */ }
    }
  }, [url, name, maxPages, cover, direct])

  const current = state.key === url ? state : { pages: 0, error: '', loading: true }

  return (
    <div className={className}>
      {current.loading && (
        cover
          ? <div className="w-full h-full flex items-center justify-center bg-slate-50"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
          : <div className="flex flex-col items-center justify-center gap-3 py-12 text-slate-500">
              <Loader2 size={28} className="animate-spin text-indigo-500" />
              <p className="text-sm">טוען את המסמך...</p>
            </div>
      )}
      {current.error && (
        cover
          ? <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-rose-50/50 text-rose-400">
              <FileText size={22} /><span className="text-[10px] font-medium">PDF</span>
            </div>
          : <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
              <AlertTriangle size={26} className="text-amber-500" />
              <p className="text-sm font-medium text-slate-700">לא ניתן להציג את המסמך כאן</p>
              <p className="text-xs text-slate-400">{current.error}</p>
            </div>
      )}
      <div ref={hostRef} className={cover ? 'w-full h-full overflow-hidden' : undefined} />
      {!cover && !current.loading && !current.error && current.pages > 1 && (
        <p className="text-center text-xs text-slate-400 pb-2">{current.pages} עמודים</p>
      )}
    </div>
  )
}
