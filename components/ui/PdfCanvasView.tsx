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
}: {
  url: string
  name?: string | null
  className?: string
  /** מגבלת עמודים — 1 לתצוגה מקדימה (thumbnail), ללא ערך = כל העמודים */
  maxPages?: number
  /** תצוגה מקדימה: העמוד ממלא את המסגרת וגלישה נחתכת (כמו object-cover בתמונה) */
  cover?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<{ key: string; pages: number; error: string; loading: boolean }>(
    { key: '', pages: 0, error: '', loading: true },
  )

  useEffect(() => {
    let alive = true
    const host = hostRef.current
    if (!host) return
    host.replaceChildren()
    setState({ key: url, pages: 0, error: '', loading: true })

    ;(async () => {
      try {
        const [{ objectUrl }, pdfjs] = await Promise.all([loadDocBlob(url, name), getPdfjs()])
        if (!alive) return
        // ה-blob כבר בזיכרון הדפדפן — pdf.js קורא ממנו, בלי בקשת רשת נוספת
        const bytes = new Uint8Array(await (await fetch(objectUrl)).arrayBuffer())
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
          host.appendChild(canvas)
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

    return () => { alive = false }
  }, [url, name, maxPages, cover])

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
