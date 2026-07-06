'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { X, Download, FileText } from 'lucide-react'
import { docViewUrl, docDownloadUrl } from '@/lib/docUrl'

// צפייה במסמך מצורף בחלונית קופצת (מודל) במקום פתיחה בלשונית חדשה.
// לחיצה מחוץ לקובץ סוגרת · X בפינה השמאלית העליונה סוגר · Esc סוגר.
type DocInfo = { url: string; name?: string | null }

const DocViewerContext = createContext<(doc: DocInfo) => void>(() => {})

const isImageRef = (u?: string | null) => !!u && /\.(png|jpe?g|gif|webp|bmp|heic|heif|svg)(\?|#|$)/i.test(u)
const isPdfRef = (u?: string | null) => !!u && /\.pdf(\?|#|$)/i.test(u)

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

  const ref = doc ? (doc.name || doc.url) : ''
  const isImg = isImageRef(ref)
  const isPdf = isPdfRef(ref)
  // אם כבר הועברה כתובת פרוקסי (/api/files) — לא לעטוף שוב; אחרת לעטוף בכתובת צפייה מאומתת
  const view = doc ? (/^\/api\/files\b/.test(doc.url) ? doc.url : docViewUrl(doc.url)) : ''

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
              // eslint-disable-next-line @next/next/no-img-element
              <img src={view} alt={doc.name || 'מסמך'} className="max-w-full max-h-[90vh] object-contain rounded-xl shadow-2xl bg-white" />
            ) : isPdf ? (
              <iframe src={view} title={doc.name || 'מסמך'} className="w-full h-[90vh] rounded-xl shadow-2xl bg-white border-0" />
            ) : (
              // סוג לא נתמך לתצוגה — הצעת הורדה
              <div className="bg-white rounded-2xl p-10 text-center shadow-2xl max-w-sm">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <FileText size={30} className="text-slate-400" />
                </div>
                <p className="text-slate-700 font-semibold mb-1">לא ניתן להציג את הקובץ כאן</p>
                <p className="text-slate-400 text-sm mb-5">{doc.name || 'קובץ מצורף'}</p>
                <a
                  href={docDownloadUrl(doc.url, doc.name)}
                  download={doc.name || true}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors"
                >
                  <Download size={17} /> הורדת הקובץ
                </a>
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

// הורדה ישירה למחשב דרך fetch+blob — מבטיח הורדה בלי פתיחת לשונית/ניווט, בפורמט המקורי.
export async function downloadDocDirect(url: string, name?: string | null): Promise<void> {
  const res = await fetch(docDownloadUrl(url, name), { credentials: 'same-origin' })
  if (!res.ok) throw new Error('download failed')
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  if (name) a.download = name
  else a.download = ''
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 4000)
}
