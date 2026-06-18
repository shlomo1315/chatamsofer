'use client'
import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Upload, Trash2, Loader2, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { docViewUrl } from '@/lib/docUrl'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'

const isImage = (url: string) => /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(url)
const isPdf = (url: string) => /\.pdf(\?|$)/i.test(url)

// תצוגה מקדימה של אישור הלידה בתוך הכרטסת, עם פעולות בריחוף: פתיחה / החלפה / מחיקה
export default function BirthCertificatePreview({
  aidId,
  beneficiaryId,
  url: initialUrl,
}: {
  aidId: string
  beneficiaryId: string
  url: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const fileRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState(initialUrl)
  const [busy, setBusy] = useState(false)

  const replace = async (file: File) => {
    setBusy(true)
    try {
      const safe = file.name.replace(/[^\w.\-]+/g, '_')
      const path = `maternity/${beneficiaryId}/${Date.now()}_${safe}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('documents').getPublicUrl(path)
      const { error } = await supabase.from('maternity_aids').update({ birth_certificate_url: pub.publicUrl }).eq('id', aidId)
      if (error) throw error
      setUrl(pub.publicUrl)
      toast.success('הקובץ הוחלף בהצלחה')
      router.refresh()
    } catch (e) {
      toast.error(`שגיאה בהחלפת הקובץ: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!(await confirm({ title: 'מחיקת אישור לידה', message: 'למחוק את אישור הלידה?', confirmLabel: 'מחיקה', danger: true }))) return
    setBusy(true)
    try {
      const { error } = await supabase.from('maternity_aids').update({ birth_certificate_url: null }).eq('id', aidId)
      if (error) throw error
      toast.success('אישור הלידה נמחק')
      router.refresh()
    } catch (e) {
      toast.error(`שגיאה במחיקה: ${e instanceof Error ? e.message : String(e)}`)
      setBusy(false)
    }
  }

  const btn = 'inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-white/95 shadow-sm border border-slate-200 hover:bg-white transition-colors'
  const view = docViewUrl(url)

  return (
    <div className="group relative rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
      {/* תצוגה מקדימה */}
      {isImage(url) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={view} alt="אישור לידה" className="w-full max-h-80 object-contain bg-white" />
      ) : isPdf(url) ? (
        <iframe src={`${view}#toolbar=0&navpanes=0`} title="אישור לידה" className="w-full h-80 bg-white" />
      ) : (
        <a href={view} target="_blank" rel="noopener noreferrer" className="h-40 flex flex-col items-center justify-center text-slate-400 gap-2 hover:text-indigo-500">
          <FileText size={28} /> <span className="text-xs">פתח את הקובץ</span>
        </a>
      )}

      {/* פעולות בריחוף */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-end gap-1.5 p-2 bg-gradient-to-b from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <a href={view} target="_blank" rel="noopener noreferrer" className={`${btn} text-indigo-700`}>
          <ExternalLink size={13} /> פתח
        </a>
        <button onClick={() => fileRef.current?.click()} disabled={busy} className={`${btn} text-slate-700`}>
          <Upload size={13} /> החלף
        </button>
        <button onClick={remove} disabled={busy} className={`${btn} text-red-600 hover:bg-red-50`}>
          <Trash2 size={13} /> מחק
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) replace(f); if (fileRef.current) fileRef.current.value = '' }} />

      {busy && (
        <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
          <Loader2 size={22} className="animate-spin text-indigo-500" />
        </div>
      )}
      {confirmDialog}
    </div>
  )
}
