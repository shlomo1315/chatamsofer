'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Paperclip, Upload, Trash2, Loader2, FileText, ExternalLink, Image as ImageIcon, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { docViewUrl, docDownloadUrl } from '@/lib/docUrl'
import { ViewDocButton } from '@/components/ui/DocViewer'
import { useDocTypes } from '@/lib/useDocTypes'
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

export default function DocumentsManager({ beneficiaryId }: { beneficiaryId: string }) {
  const supabase = createClient()
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const { docTypes: DOC_TYPES, label: typeLabel } = useDocTypes()
  const fileRef = useRef<HTMLInputElement>(null)
  const [docs, setDocs] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [docType, setDocType] = useState('id_husband')
  const [error, setError] = useState('')

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
      await load()
    } catch (err: unknown) {
      toast.error(`שגיאה במחיקה: ${err instanceof Error ? err.message : String(err)}`)
    }
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
              <ViewDocButton url={doc.file_url} className="block">
                {doc.file_url && isImage(doc.file_name) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={docViewUrl(doc.file_url)} alt={doc.file_name ?? ''} className="w-full h-28 object-cover" />
                ) : doc.file_url && isPdf(doc.file_name) ? (
                  <iframe src={`${docViewUrl(doc.file_url)}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                    title={doc.file_name ?? 'PDF'} tabIndex={-1}
                    className="border-0 bg-white pointer-events-none w-full h-28" />
                ) : (
                  <div className="w-full h-28 flex items-center justify-center bg-slate-50 text-slate-300">
                    {isImage(doc.file_name) ? <ImageIcon size={28} /> : <FileText size={28} />}
                  </div>
                )}
              </ViewDocButton>
              <div className="p-2">
                <p className="text-[11px] font-medium text-indigo-700 bg-indigo-50 inline-block px-1.5 py-0.5 rounded">
                  {typeLabel(doc.doc_type)}
                </p>
                <p className="text-xs text-slate-600 truncate mt-1" title={doc.file_name ?? ''}>{doc.file_name}</p>
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
                  <a
                    href={docDownloadUrl(doc.file_url, doc.file_name)}
                    download={doc.file_name || true}
                    className="p-1.5 rounded-lg bg-white/90 text-slate-600 hover:text-emerald-600 shadow-sm"
                    title="הורדה למחשב"
                  >
                    <Download size={13} />
                  </a>
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
