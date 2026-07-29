'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { X, Download, FileText, Loader2 } from 'lucide-react'
import { docViewUrl, docDownloadUrl, docThumbUrl } from '@/lib/docUrl'

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
              // PDF מוצג כתמונות של העמודים, שמרונדרות בשרת. לא iframe ולא
              // ניווט לקובץ: נטפרי מיירט כל תגובת application/pdf ומחזיר את דף
              // החסימה שלו — גם מהדומיין שלנו — ולכן שום PDF לא עובר בחוט כאן.
              <PdfPagesView key={doc.url} url={doc.url} name={doc.name} />
            ) : (
              // סוג לא נתמך לתצוגה — הצעת הורדה
              <DownloadOnlyCard url={doc.url} name={doc.name} title="לא ניתן להציג את הקובץ כאן" />
            )}
          </div>
        </div>
      )}
    </DocViewerContext.Provider>
  )
}

// צפייה במסמך PDF בתוך החלונית — כל עמוד נטען כתמונה מרונדרת-שרת
// (/api/files/thumb). כך המסמך נקרא בתוך המערכת בלי שאף PDF יעבור בחוט,
// ולכן בלי חסימת נטפרי ובלי "נשלח לבדיקה".
function PdfPagesView({ url, name }: { url: string; name?: string | null }) {
  const [pages, setPages] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)

  // הרכיב ממופתח ב-key לפי הכתובת (ראה אתר הקריאה), ולכן מסמך חדש = מופע חדש
  // עם מצב נקי — אין צורך (ואסור) לאפס את ה-state בתוך האפקט.
  useEffect(() => {
    let alive = true
    fetch(`/api/files/thumb?p=${encodeURIComponent(url)}&meta=1`, { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { pages?: number }) => { if (alive) setPages(Math.max(1, Math.min(Number(d.pages) || 1, 200))) })
      .catch(() => { if (alive) setFailed(true) })
    return () => { alive = false }
  }, [url])

  // מסמך פגום/מוגן — אין מה להציג, נשארת ההורדה
  if (failed) return <DownloadOnlyCard url={url} name={name} title="לא ניתן להציג את הקובץ כאן" />

  if (pages === null) {
    return (
      <div className="bg-white rounded-2xl px-10 py-14 text-center shadow-2xl flex flex-col items-center gap-3">
        <Loader2 size={26} className="animate-spin text-indigo-500" />
        <p className="text-slate-400 text-sm">טוען את המסמך…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-full max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-100 flex-shrink-0">
        <span className="text-sm font-semibold text-slate-700 truncate">{name || 'מסמך PDF'}</span>
        <span className="text-xs text-slate-400 flex-shrink-0">
          {pages > 1 ? `${pages} עמודים` : 'עמוד אחד'}
        </span>
        <a href={docDownloadUrl(url, name)} download={name || true}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-white hover:bg-emerald-600 border border-emerald-200 hover:border-emerald-600 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
          <Download size={14} /> הורדה
        </a>
      </div>
      <div className="overflow-y-auto bg-slate-100 p-3 flex flex-col gap-3">
        {Array.from({ length: pages }, (_, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={docThumbUrl(url, { page: i + 1, width: 1400 })}
            alt={`עמוד ${i + 1}`}
            loading={i === 0 ? 'eager' : 'lazy'}
            className="w-full block rounded-lg shadow-sm bg-white"
          />
        ))}
      </div>
    </div>
  )
}

// כרטיס "אין תצוגה — הורד את הקובץ", משותף למסמך פגום ולסוג לא נתמך
function DownloadOnlyCard({ url, name, title }: { url: string; name?: string | null; title: string }) {
  return (
    <div className="bg-white rounded-2xl p-10 text-center shadow-2xl max-w-sm">
      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <FileText size={30} className="text-slate-400" />
      </div>
      <p className="text-slate-700 font-semibold mb-1">{title}</p>
      <p className="text-slate-400 text-sm mb-5">{name || 'קובץ מצורף'}</p>
      <a href={docDownloadUrl(url, name)} download={name || true}
        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors">
        <Download size={17} /> הורדת הקובץ
      </a>
    </div>
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
