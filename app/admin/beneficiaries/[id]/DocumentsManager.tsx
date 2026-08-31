'use client'
import { groupDocsByType } from '@/lib/groupDocsByType'
import PdfCanvasView from '@/components/ui/PdfCanvasView'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Paperclip, Upload, Trash2, Loader2, FileText, ExternalLink, Image as ImageIcon, Download, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { docDownloadName } from '@/lib/docUrl'
import { downloadDocViaData, releaseDoc } from '@/lib/docBlob'
import SafeDocImage from '@/components/ui/SafeDocImage'
import { ViewDocButton } from '@/components/ui/DocViewer'
import { useDocTypes } from '@/lib/useDocTypes'
import { docNameMismatch } from '@/lib/docNameMismatch'
import { UPLOAD_ACCEPT, UPLOAD_HINT } from '@/lib/uploads'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const BUCKET = 'documents'

interface DocRow {
  id: string
  beneficiary_id: string
  doc_type: string
  file_url: string | null
  file_name: string | null
  uploaded_at?: string
}

const formatUploaded = (raw?: string) => {
  if (!raw) return ''
  try {
    const d = new Date(raw)
    return `${d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
  } catch { return '' }
}

const isImage = (name?: string | null) => !!name && /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(name)
const isPdf = (name?: string | null) => !!name && /\.pdf$/i.test(name)

export default function DocumentsManager({ beneficiaryId, beneficiaryName }: { beneficiaryId: string; beneficiaryName?: string }) {
  const supabase = createClient()
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const { docTypes: DOC_TYPES, label: typeLabel } = useDocTypes()

  // שם ההורדה: "סוג המסמך + שם ומשפחת המוטב" עם הסיומת המקורית של הקובץ.
  // למשל: "תעודת זהות משה כהן.pdf". כך הקובץ יורד עם שם משמעותי ובפורמט הנכון.
  const downloadName = useCallback(
    (doc: DocRow): string => docDownloadName(typeLabel(doc.doc_type), beneficiaryName, doc.file_name),
    [typeLabel, beneficiaryName],
  )
  const fileRef = useRef<HTMLInputElement>(null)
  const [docs, setDocs] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [docType, setDocType] = useState('id_husband')
  const [error, setError] = useState('')
  // אזהרת סתירה בין שם הקובץ לסוג שנבחר — מוצגת אחרי ההעלאה, לא חוסמת.
  const [mismatch, setMismatch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('beneficiary_id', beneficiaryId)
      .order('uploaded_at', { ascending: false })
    if (!error) setDocs(data ?? [])
    setLoading(false)
  }, [supabase, beneficiaryId])

  useEffect(() => { load() }, [load])

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploading(true)
    setError('')
    // ⚠️ אזהרה ולא חסימה: שם קובץ אינו ראיה על תוכנו, וקובץ מאוחד
    // ("תעודות זהות משפחה.pdf") לגיטימי תחת כל תווית. חסימה הייתה עוצרת
    // העלאות תקינות. ראו lib/docNameMismatch.
    const warns = Array.from(files)
      .map(f => docNameMismatch(f.name, docType))
      .filter((w): w is string => !!w)
    setMismatch(warns[0] ?? '')
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop()
        const path = `${beneficiaryId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
        if (upErr) throw upErr
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
        const { error: insErr } = await supabase.from('documents').insert({
          beneficiary_id: beneficiaryId,
          doc_type: docType,
          file_url: pub.publicUrl,
          file_name: file.name,
        })
        if (insErr) throw insErr
      }
      await load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg.includes('Bucket not found')
        ? 'דלי האחסון "documents" לא קיים. צור אותו ב-Supabase (ראה הוראות).'
        : `שגיאה בהעלאה: ${msg}`)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleDelete = async (doc: DocRow) => {
    if (!(await confirm({ title: 'מחיקת קובץ', message: `למחוק את הקובץ "${doc.file_name || ''}"?`, confirmLabel: 'מחיקה', danger: true }))) return
    try {
      // Try to remove the underlying storage object (path = everything after the bucket segment)
      if (doc.file_url) {
        const marker = `/${BUCKET}/`
        const idx = doc.file_url.indexOf(marker)
        if (idx !== -1) {
          const path = decodeURIComponent(doc.file_url.slice(idx + marker.length))
          await supabase.storage.from(BUCKET).remove([path])
        }
      }
      await supabase.from('documents').delete().eq('id', doc.id)
      // שחרור העותק המקומי מהמטמון — אחרת קובץ שהועלה מחדש לאותו נתיב
      // ימשיך להציג את התמונה הישנה עד רענון הדף.
      if (doc.file_url) releaseDoc(doc.file_url)
      await load()
    } catch (err: unknown) {
      toast.error(`שגיאה במחיקה: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // 🔴 כמה קבצים יש בכל סוג, ומה מיקומו של כל אחד.
  //
  // ⚠️ ת"ז דו-צדדית וספח מרובה עמודים מועלים כשני קבצים מאותו סוג —
  // התנהגות מכוונת (appendMode ב-upload-docs). בלי המונה שני כרטיסים
  // בשם זהה נראים ככפילות או כתקלה.
  //
  // ⚠️ groupDocsByType ממיין לפי מועד ההעלאה, כדי שהצד הקדמי יהיה (1/2).
  const groups = groupDocsByType(docs)
  // 🔴 גלריה לכל סוג: לחיצה על צד אחד של ת"ז פותחת חלונית שאפשר
  // לעבור בה לצד השני — במקום לסגור ולפתוח כרטיס אחר.
  const galleryOf: Record<string, { url: string; name: string | null }[]> = {}
  for (const g of groups) {
    galleryOf[g.doc_type] = g.files
      .map(f => ({ url: String(f.file_url ?? ''), name: f.file_name }))
      .filter(x => x.url)
  }
  const typeCounts: Record<string, number> = {}
  const docIndex: Record<string, number> = {}
  for (const g of groups) {
    typeCounts[g.doc_type] = g.files.length
    g.files.forEach((f, i) => { docIndex[(f as DocRow).id] = i + 1 })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Paperclip size={16} className="text-indigo-500" />
        <h2 className="text-xs font-semibold text-slate-500 uppercase">קבצים מצורפים</h2>
        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{docs.length}</span>
      </div>

      {/* Upload bar */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
        <select
          value={docType}
          onChange={(e) => setDocType(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          {DOC_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <input
          ref={fileRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          העלה צילום
        </button>
        <span className="text-xs text-slate-400 w-full">{UPLOAD_HINT}</span>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {mismatch && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-relaxed flex-1">{mismatch}</p>
          <button onClick={() => setMismatch('')} className="text-xs font-bold text-amber-700 hover:text-amber-900">סגירה</button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-4 justify-center">
          <Loader2 size={16} className="animate-spin" /> טוען קבצים...
        </div>
      ) : docs.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">אין קבצים מצורפים עדיין.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {docs.map((doc) => (
            <div key={doc.id} className="group relative border border-slate-200 rounded-xl overflow-hidden bg-white">
              {/* תמונות — תצוגה מקדימה בלחיצה (מודל). PDF — לא מוטמע ב-iframe
                  (נטפרי חוסם PDF ב-iframe/viewer ומציג NETFREE); במקום זה אייקון
                  ופתיחה בכרטיסייה חדשה = ניווט מלא לדומיין שלנו, שנטפרי לא חוסם. */}
              {doc.file_url && isImage(doc.file_name) ? (
                <ViewDocButton url={doc.file_url} className="block" gallery={galleryOf[doc.doc_type]} index={(docIndex[doc.id] ?? 1) - 1}>
                  <SafeDocImage path={doc.file_url} name={doc.file_name} className="w-full h-28 object-cover" />
                </ViewDocButton>
              ) : doc.file_url && isPdf(doc.file_name) ? (
                // 🔴 תצוגה מקדימה בחלונית, לא כרטיסייה חדשה.
                //
                // ⚠️ ההערה שמעל תיארה מצב שכבר אינו נכון: היא נכתבה לפני
                // PdfCanvasView, שמצייר את העמודים בעצמו על canvas ולכן
                // נטפרי אינה חוסמת אותו. פתיחה בכרטיסייה הוציאה את
                // המזכירה מהכרטסת בכל מסמך.
                <ViewDocButton url={doc.file_url} className="block" gallery={galleryOf[doc.doc_type]} index={(docIndex[doc.id] ?? 1) - 1}>
                  <div className="w-full h-28 overflow-hidden bg-slate-50">
                    <PdfCanvasView url={doc.file_url} name={doc.file_name}
                      maxPages={1} cover className="w-full h-full" />
                  </div>
                </ViewDocButton>
              ) : (
                <ViewDocButton url={doc.file_url} className="block" gallery={galleryOf[doc.doc_type]} index={(docIndex[doc.id] ?? 1) - 1}>
                  <div className="w-full h-28 flex items-center justify-center bg-slate-50 text-slate-300">
                    {isImage(doc.file_name) ? <ImageIcon size={28} /> : <FileText size={28} />}
                  </div>
                </ViewDocButton>
              )}
              <div className="p-2">
                <p className="text-[11px] font-medium text-indigo-700 bg-indigo-50 inline-block px-1.5 py-0.5 rounded">
                  {typeLabel(doc.doc_type)}
                  {/* 🔴 מונה כשיש כמה קבצים מאותו סוג.
                      ⚠️ ת"ז דו-צדדית וספח מרובה עמודים מועלים כשני קבצים
                      (appendMode), ושני כרטיסים בשם זהה נראים ככפילות.
                      המונה אומר שזה מכוון. */}
                  {(typeCounts[doc.doc_type] ?? 0) > 1 && (
                    <span className="mr-1 text-indigo-500">
                      ({docIndex[doc.id]}/{typeCounts[doc.doc_type]})
                    </span>
                  )}
                </p>
                {/* שם הקובץ הגולמי (כפי שהמשתמש קרא לו) לא מוצג — אינו מעניין
                    ולעתים מבלבל. מזהים את המסמך לפי הסוג (התווית) בלבד. */}
                {doc.uploaded_at && (
                  <p className="text-[10px] text-slate-400 mt-0.5">🕒 {formatUploaded(doc.uploaded_at)}</p>
                )}
              </div>
              <div className="absolute top-1.5 left-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <ViewDocButton
                  url={doc.file_url}
                  className="p-1.5 rounded-lg bg-white/90 text-slate-600 hover:text-indigo-600 shadow-sm"
                >
                  <ExternalLink size={13} />
                </ViewDocButton>
                {doc.file_url && (
                  <button
                    type="button"
                    onClick={() => { downloadDocViaData(doc.file_url!, downloadName(doc)).catch(e => toast.error(e?.message || 'שגיאה בהורדה')) }}
                    className="p-1.5 rounded-lg bg-white/90 text-slate-600 hover:text-emerald-600 shadow-sm"
                    title="הורדה למחשב"
                  >
                    <Download size={13} />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(doc)}
                  className="p-1.5 rounded-lg bg-white/90 text-red-500 hover:bg-red-50 shadow-sm"
                  title="מחק"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {confirmDialog}
    </div>
  )
}
