'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { X, Download, FileText, Loader2, ExternalLink } from 'lucide-react'
import { loadDocBlob, openDocInNewTab, downloadDocViaData } from '@/lib/docBlob'
import SafeDocImage from './SafeDocImage'
import PdfCanvasView from './PdfCanvasView'

// צפייה במסמך מצורף בחלונית קופצת (מודל) במקום פתיחה בלשונית חדשה.
// לחיצה מחוץ לקובץ סוגרת · X בפינה השמאלית העליונה סוגר · Esc סוגר.
type DocInfo = { url: string; name?: string | null }

const DocViewerContext = createContext<(doc: DocInfo) => void>(() => {})

const isImageRef = (u?: string | null) => !!u && /\.(png|jpe?g|gif|webp|bmp|heic|heif|svg)(\?|#|$)/i.test(u)
const isPdfRef = (u?: string | null) => !!u && /\.pdf(\?|#|$)/i.test(u)

// ─────────────────────────────────────────────────────────────────────────────
// תצוגת PDF ישירות בחלונית.
//
// הקובץ נטען דרך ערוץ הנתונים (JSON+base64) ומורכב ל-blob: מקומי, וה-iframe
// מצביע על ה-blob. זו הנקודה: נטפרי חוסם PDF ב-iframe כי הוא מיירט את בקשת
// הרשת לקובץ — אבל blob: הוא כתובת מקומית בדפדפן ואין עליה בקשת רשת כלל,
// ולכן ה-PDF viewer של הדפדפן פשוט מציג אותו. לכן אפשר להחזיר כאן תצוגה
// ישירה במקום כרטיס "פתח בכרטיסייה חדשה".
// ─────────────────────────────────────────────────────────────────────────────
function PdfInlineView({ url, name }: { url: string; name?: string | null }) {
  const [state, setState] = useState({ key: '', src: '', failed: false })

  useEffect(() => {
    let alive = true
    loadDocBlob(url, name)
      .then(d => { if (alive) setState({ key: url, src: d.objectUrl, failed: false }) })
      .catch(() => { if (alive) setState({ key: url, src: '', failed: true }) })
    return () => { alive = false }
  }, [url, name])

  const { src, failed } = state.key === url ? state : { src: '', failed: false }

  // נפילה-לאחור: אם הטעינה נכשלה, הכרטיס הישן עם פתיחה בכרטיסייה והורדה
  if (failed) {
    return (
      <div className="bg-white rounded-2xl p-10 text-center shadow-2xl max-w-sm">
        <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <FileText size={30} className="text-rose-400" />
        </div>
        <p className="text-slate-700 font-semibold mb-1">מסמך PDF</p>
        <p className="text-slate-400 text-sm mb-5">{name || 'קובץ PDF'}</p>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => { openDocInNewTab(url, name).catch(() => {}) }}
            className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors">
            <FileText size={17} /> פתח בכרטיסייה חדשה
          </button>
          <button type="button" onClick={() => { downloadDocViaData(url, name).catch(() => {}) }}
            className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors">
            <Download size={17} /> הורדת הקובץ
          </button>
        </div>
      </div>
    )
  }

  if (!src) {
    return (
      <div className="bg-white rounded-2xl px-10 py-12 text-center shadow-2xl flex flex-col items-center gap-3">
        <Loader2 size={28} className="animate-spin text-indigo-500" />
        <p className="text-sm text-slate-500">טוען את המסמך...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-full h-[90vh] gap-2">
      {/* ⚠️ לא <iframe>: החסימה של נטפרי היא על מציג ה-PDF של הדפדפן, לא על
          הקובץ. מציירים את העמודים בעצמנו על canvas — ראו PdfCanvasView. */}
      <div className="flex-1 w-full overflow-y-auto rounded-xl bg-white shadow-2xl p-3">
        <PdfCanvasView url={url} name={name} />
      </div>
      <div className="flex items-center justify-center gap-2 flex-shrink-0">
        <button type="button" onClick={() => { openDocInNewTab(url, name).catch(() => {}) }}
          className="inline-flex items-center gap-1.5 bg-white/95 hover:bg-white text-slate-700 text-sm font-medium px-4 py-2 rounded-xl shadow-lg transition-colors">
          <ExternalLink size={15} /> פתח בכרטיסייה חדשה
        </button>
        <button type="button" onClick={() => { downloadDocViaData(url, name).catch(() => {}) }}
          className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded-xl shadow-lg transition-colors">
          <Download size={15} /> הורדה
        </button>
      </div>
    </div>
  )
}

export function DocViewerProvider({ children }: { children: React.ReactNode }) {
  const [doc, setDoc] = useState<DocInfo | null>(null)
  const open = useCallback((d: DocInfo) => { if (d?.url) setDoc(d) }, [])
  const close = useCallback(() => setDoc(null), [])

  // Esc לסגירה + חסימת גלילת רקע כל עוד המודל פתוח
  useEffect(() => {
    if (!doc) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
  }, [doc, close])

  // זיהוי סוג הקובץ — לפי השם *וגם* לפי הכתובת. חלק מהקוראים מעבירים תווית
  // בעברית ללא סיומת ("מסמך מצורף", "מסמך 1"), ואז רק הכתובת מעידה על הסוג;
  // בדיקה של השם בלבד גרמה לתמונות ו-PDF תקינים להיפסל כ"לא ניתן להציג".
  const isImg = isImageRef(doc?.name) || isImageRef(doc?.url)
  const isPdf = !isImg && (isPdfRef(doc?.name) || isPdfRef(doc?.url))
  // התצוגה עצמה נעשית דרך ערוץ הנתונים (loadDocBlob), שיודע לקבל גם נתיב
  // אחסון וגם כתובת פרוקסי קיימת — ולכן אין צורך לבנות כאן כתובת צפייה.

  return (
    <DocViewerContext.Provider value={open}>
      {children}
      {doc && (
        // רקע כהה — לחיצה עליו (מחוץ לקובץ) סוגרת את החלונית
        <div
          onClick={close}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4 sm:p-8 animate-[fadeIn_0.12s_ease-out]"
          role="dialog"
          aria-modal="true"
        >
          {/* X לסגירה — פינה שמאלית עליונה */}
          <button
            onClick={close}
            title="סגירה"
            aria-label="סגירה"
            className="absolute top-4 left-4 z-10 inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/95 text-slate-700 hover:bg-white hover:text-slate-900 shadow-lg transition-colors"
          >
            <X size={24} />
          </button>

          {/* הקובץ עצמו — עצירת בועה כדי שלחיצה עליו לא תסגור */}
          <div onClick={e => e.stopPropagation()} className="relative flex items-center justify-center w-full max-w-5xl max-h-[90vh]">
            {isImg ? (
              // התמונה נטענת דרך ערוץ הנתונים (blob מקומי) ולא כקובץ ברשת
              <SafeDocImage path={doc.url} name={doc.name} alt={doc.name || 'מסמך'}
                className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl bg-white" />
            ) : isPdf ? (
              // תצוגה ישירה של ה-PDF מתוך blob: מקומי — ראו PdfInlineView
              <PdfInlineView url={doc.url} name={doc.name} />
            ) : (
              // סוג לא נתמך לתצוגה — הצעת הורדה
              <div className="bg-white rounded-2xl p-10 text-center shadow-2xl max-w-sm">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FileText size={30} className="text-slate-400" />
                </div>
                <p className="text-slate-700 font-semibold mb-1">לא ניתן להציג את הקובץ כאן</p>
                <p className="text-slate-400 text-sm mb-5">{doc.name || 'קובץ מצורף'}</p>
                <button
                  type="button"
                  onClick={() => { downloadDocViaData(doc.url, doc.name).catch(() => {}) }}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors"
                >
                  <Download size={17} /> הורדת הקובץ
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </DocViewerContext.Provider>
  )
}

// hook: מחזיר פונקציה שפותחת מסמך בחלונית. שימוש: const openDoc = useDocViewer(); openDoc({ url, name })
export function useDocViewer() {
  return useContext(DocViewerContext)
}

// כפתור/קישור "צפייה" מוכן שפותח את המסמך בחלונית קופצת (במקום לשונית חדשה).
export function ViewDocButton({
  url, name, label = 'צפייה', className = '', children,
}: {
  url: string | null | undefined
  name?: string | null
  label?: string
  className?: string
  children?: React.ReactNode
}) {
  const openDoc = useDocViewer()
  if (!url) return null
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); openDoc({ url, name }) }}
      className={className || 'inline-flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:text-white hover:bg-indigo-600 px-2.5 py-1.5 rounded-lg border border-indigo-200 hover:border-indigo-600 transition-colors'}
    >
      {children ?? (<><FileText size={14} /> {label}</>)}
    </button>
  )
}

// הורדה ישירה למחשב — עוברת דרך ערוץ הנתונים (JSON+base64) ולא מושכת קובץ
// מהרשת, ולכן אינה נכנסת לבדיקת מסנן התוכן. נקודת הכניסה של *כל* ההורדות
// במערכת (DownloadDocButton, הפורטל, חלונית הצפייה), ולכן די בשינוי כאן.
export async function downloadDocDirect(url: string, name?: string | null): Promise<void> {
  await downloadDocViaData(url, name)
}
