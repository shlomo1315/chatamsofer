'use client'
import { FileText } from 'lucide-react'
import { useDocViewer } from './DocViewer'
import DocPreview from './DocPreview'

const isImageRef = (u?: string | null) => !!u && /\.(png|jpe?g|gif|webp|bmp|heic|heif|svg)(\?|#|$)/i.test(u)
const isPdfRef = (u?: string | null) => !!u && /\.pdf(\?|#|$)/i.test(u)

// תצוגה מקדימה קטנה של מסמך מצורף (תמונה או PDF) — קליק פותח בחלונית קופצת.
// href = כתובת צפייה (signed); rawUrl/mimeType לעזרה בזיהוי סוג הקובץ.
export default function DocThumb({
  href, rawUrl, name, mimeType, size = 72,
}: {
  href: string
  rawUrl?: string | null
  name?: string
  mimeType?: string | null
  size?: number
}) {
  const openDoc = useDocViewer()
  const ref = rawUrl ?? name ?? href
  const isImg = isImageRef(ref) || (mimeType?.startsWith('image/') ?? false)
  const isPdf = isPdfRef(ref) || mimeType === 'application/pdf'
  // מקור לתצוגה המקדימה — נתיב האחסון הגולמי כשקיים; אחרת כתובת הפרוקסי,
  // ש-storagePath יודע לחלץ ממנה את הנתיב.
  const previewSrc = rawUrl ?? href

  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); openDoc({ url: rawUrl ?? href, name }) }}
      title={name || 'פתח מסמך'}
      className="group relative block flex-shrink-0 rounded-lg border border-slate-200 overflow-hidden bg-slate-100 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer"
      style={{ width: size, height: size }}
    >
      {isImg || isPdf ? (
        // תצוגה כתמונה גם ל-PDF (מרונדר בשרת). ה-iframe הקודם הוחלף בדף
        // החסימה של נטפרי, שמיירט כל תגובת application/pdf.
        <DocPreview url={previewSrc} alt={name || 'מסמך'} width={Math.max(240, size * 3)} className="w-full h-full" />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-1">
          <FileText size={Math.round(size * 0.32)} />
          <span className="text-[8px]">קובץ</span>
        </div>
      )}
      <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/10 transition-colors" />
    </button>
  )
}
