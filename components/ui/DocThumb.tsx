'use client'
import { FileText } from 'lucide-react'
import { useDocViewer } from './DocViewer'
import PdfCanvasView from './PdfCanvasView'
import SafeDocImage from './SafeDocImage'

const isImageRef = (u?: string | null) => !!u && /\.(png|jpe?g|gif|webp|bmp|heic|heif|svg)(\?|#|$)/i.test(u)
const isPdfRef = (u?: string | null) => !!u && /\.pdf(\?|#|$)/i.test(u)

// תצוגה מקדימה קטנה של מסמך מצורף (תמונה או PDF) — קליק פותח בחלונית קופצת.
// href = כתובת צפייה (signed); rawUrl/mimeType לעזרה בזיהוי סוג הקובץ.
export default function DocThumb({
  href, rawUrl, name, mimeType, size = 72, gallery, index,
}: {
  href: string
  rawUrl?: string | null
  name?: string
  mimeType?: string | null
  size?: number
  /** רשימת המסמכים לניווט בחצים בתוך המציג. */
  gallery?: { url: string; name?: string | null }[]
  index?: number
}) {
  const openDoc = useDocViewer()
  const ref = rawUrl ?? name ?? href
  const isImg = isImageRef(ref) || (mimeType?.startsWith('image/') ?? false)
  const isPdf = isPdfRef(ref) || mimeType === 'application/pdf'

  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); openDoc({ url: rawUrl ?? href, name, gallery, index }) }}
      title={name || 'פתח מסמך'}
      className="group relative block flex-shrink-0 rounded-lg border border-slate-200 overflow-hidden bg-slate-100 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer"
      style={{ width: size, height: size }}
    >
      {isImg ? (
        // דרך ערוץ הנתונים — לא בקשת רשת לקובץ
        <SafeDocImage path={rawUrl ?? href} name={name} alt={name || 'מסמך'} className="w-full h-full object-cover" />
      ) : isPdf ? (
        // תצוגה מקדימה אמיתית — העמוד הראשון מצויר על canvas (ולא מציג PDF של הדפדפן)
        <PdfCanvasView url={rawUrl ?? href} name={name} maxPages={1} cover className="w-full h-full" />
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
