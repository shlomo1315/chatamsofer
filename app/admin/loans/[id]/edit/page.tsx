'use client'
import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Loader2, Check, AlertTriangle, Upload, X, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ViewDocButton } from '@/components/ui/DocViewer'
import DownloadDocButton from '@/components/ui/DownloadDocButton'
import { LOAN_DECLARATIONS } from '@/lib/emailRequestForms'

const MAX_FILES = 5
const MAX_FILE_MB = 10
const LOAN_PURPOSES = ['נישואי הבן/הבת', 'שמחה משפחתית', 'הוצאה רפואית', 'חובות מנישואי הילדים', 'רכישת דירה', 'אחר']
const DECLARATION_OPTIONS = [...LOAN_DECLARATIONS]

type Doc = { url: string; name: string }

export default function EditLoanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [beneficiaryId, setBeneficiaryId] = useState<string | null>(null)
  const [borrower, setBorrower] = useState<{ name: string; id: string } | null>(null)

  const [purpose, setPurpose] = useState('')
  const [purposeDetails, setPurposeDetails] = useState('')
  const [amount, setAmount] = useState('')
  const [approvedAmount, setApprovedAmount] = useState('')
  const [installments, setInstallments] = useState('')
  const [declaration, setDeclaration] = useState('')
  const [notes, setNotes] = useState('')
  const [docs, setDocs] = useState<Doc[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const amountNum = parseInt(amount.replace(/\D/g, '') || '0', 10)
  const approvedNum = parseInt(approvedAmount.replace(/\D/g, '') || '0', 10)
  const instNum = parseInt(installments.replace(/\D/g, '') || '0', 10)
  const needsDetails = purpose !== 'נישואי הבן/הבת'

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from('loans').select('*, beneficiary:beneficiaries(full_name, family_name, id_number)').eq('id', id).single()
        if (error || !data) throw error ?? new Error('not found')
        setBeneficiaryId(data.beneficiary_id)
        const ben = data.beneficiary as { full_name?: string; family_name?: string; id_number?: string } | undefined
        if (ben) setBorrower({ name: [ben.family_name, ben.full_name].filter(Boolean).join(' '), id: ben.id_number ?? '' })
        setPurpose(data.purpose ?? '')
        setPurposeDetails(data.purpose_details ?? '')
        setAmount(data.amount ? String(Math.round(Number(data.amount))) : '')
        setApprovedAmount(data.approved_amount != null ? String(Math.round(Number(data.approved_amount))) : '')
        setInstallments(data.installments ? String(data.installments) : '')
        setDeclaration(data.declaration ?? '')
        setNotes(data.notes ?? '')
        setDocs(Array.isArray(data.document_urls) ? data.document_urls : [])
      } catch {
        setLoadError('שגיאה בטעינת ההלוואה')
      } finally {
        setLoading(false)
      }
    })()
  }, [id, supabase])

  const clearErr = (k: string) => setFieldErrors(p => { if (!p[k]) return p; const n = { ...p }; delete n[k]; return n })

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const incoming = Array.from(list)
    const tooBig = incoming.find(f => f.size > MAX_FILE_MB * 1024 * 1024)
    if (tooBig) { setFieldErrors(p => ({ ...p, files: `הקובץ "${tooBig.name}" גדול מ-${MAX_FILE_MB}MB` })); return }
    setNewFiles(prev => [...prev, ...incoming].slice(0, MAX_FILES))
    clearErr('files')
    if (fileRef.current) fileRef.current.value = ''
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!purpose) e.purpose = 'יש לבחור מטרת הלוואה'
    if (needsDetails && !purposeDetails.trim()) e.purposeDetails = 'יש לפרט את מטרת ההלוואה'
    // ברמת המנהל אין תקרת סכום/תשלומים — רק ערך חיובי, כהגנה מטעות הקלדה
    if (!amountNum) e.amount = 'יש להזין סכום'
    if (!instNum) e.installments = 'יש להזין מספר תשלומים'
    if (docs.length === 0 && newFiles.length === 0) e.files = 'יש לצרף לפחות מסמך אחד'
    if (!declaration) e.declaration = 'יש לבחור תשובה'
    return e
  }

  const handleSave = async () => {
    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) { setSaveError('יש למלא את כל השדות המסומנים'); return }
    setSaving(true); setSaveError('')
    try {
      const uploaded: Doc[] = [...docs]
      for (const f of newFiles) {
        const path = `loans/${beneficiaryId}/${Date.now()}_${f.name}`
        const { error: upErr } = await supabase.storage.from('documents').upload(path, f)
        if (!upErr) {
          const { data: pub } = supabase.storage.from('documents').getPublicUrl(path)
          uploaded.push({ url: pub.publicUrl, name: f.name })
        }
      }
      const { error } = await supabase.from('loans').update({
        amount: amountNum,
        approved_amount: approvedNum || null,
        installments: instNum,
        purpose: purpose || null,
        purpose_details: needsDetails ? (purposeDetails.trim() || null) : null,
        declaration: declaration || null,
        document_urls: uploaded.length ? uploaded : null,
        notes: notes.trim() || null,
      }).eq('id', id)
      if (error) throw error
      router.push(`/admin/loans/${id}`)
      router.refresh()
    } catch {
      setSaveError('שגיאה בשמירה — נסה שוב')
      setSaving(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 size={20} className="animate-spin" /></div>
  if (loadError) return <div className="max-w-2xl bg-white rounded-xl border p-8 text-center text-red-500">{loadError}</div>

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`/admin/loans/${id}`} className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">עריכת הלוואה</h1>
          <p className="text-sm text-slate-500">עדכון פרטי בקשת ההלוואה</p>
        </div>
      </div>

      {/* פרטי הלווה (הבעל) */}
      {borrower && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
              {borrower.name.charAt(0) || '?'}
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-800">{borrower.name || '—'}</p>
              <p className="text-xs text-slate-500">פרטי הלווה (הבעל)</p>
            </div>
          </div>
          {borrower.id && <span className="text-xs font-mono text-slate-600 ltr-num">ת.ז. {borrower.id}</span>}
        </div>
      )}

      {/* Purpose */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">מטרת ההלוואה <span className="text-red-500">*</span></h2>
        <div className="grid grid-cols-2 gap-2">
          {LOAN_PURPOSES.map(p => (
            <button key={p} type="button" onClick={() => { setPurpose(p); clearErr('purpose') }}
              className={`text-sm px-3 py-2 rounded-lg border font-medium transition-colors ${purpose === p ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
              {p}
            </button>
          ))}
        </div>
        {fieldErrors.purpose && <p className="text-xs text-red-600">{fieldErrors.purpose}</p>}
        {needsDetails && (
          <div className="flex flex-col gap-1.5 mt-1">
            <label className="text-xs font-medium text-slate-600">פירוט מטרת ההלוואה <span className="text-red-500">*</span></label>
            <textarea value={purposeDetails} onChange={e => { setPurposeDetails(e.target.value); clearErr('purposeDetails') }} rows={2}
              className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none ${fieldErrors.purposeDetails ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-indigo-500'}`} />
            {fieldErrors.purposeDetails && <p className="text-xs text-red-600">{fieldErrors.purposeDetails}</p>}
          </div>
        )}
      </div>

      {/* Amount + installments */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">סכום ההלוואה המבוקש (₪) <span className="text-red-500">*</span></label>
          <input type="text" inputMode="numeric" value={amount} onChange={e => { const v = e.target.value.replace(/\D/g, ''); setAmount(v); clearErr('amount') }}
            className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ltr-num text-left ${fieldErrors.amount ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-indigo-500'}`} dir="ltr" />
          <p className="text-[11px] text-slate-400">ללא תקרה (שימו לב, ההלוואה מתבצעת במטבע הדולר)</p>
          {fieldErrors.amount && <p className="text-xs text-red-600">{fieldErrors.amount}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">סכום שאושר בפועל (₪)</label>
          <input type="text" inputMode="numeric" value={approvedAmount} onChange={e => { const v = e.target.value.replace(/\D/g, ''); setApprovedAmount(v) }}
            className="rounded-lg border border-slate-300 focus:ring-indigo-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 ltr-num text-left" dir="ltr" placeholder="ריק = כסכום המבוקש" />
          <p className="text-[11px] text-slate-400">הסכום שמוצג בפורטל הביצוע</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-slate-600">מספר תשלומים להחזר <span className="text-red-500">*</span></label>
          <input type="text" inputMode="numeric" value={installments} onChange={e => { const v = e.target.value.replace(/\D/g, ''); setInstallments(v); clearErr('installments') }}
            className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ltr-num text-left ${fieldErrors.installments ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-indigo-500'}`} dir="ltr" />
          <p className="text-[11px] text-slate-400">ללא תקרה</p>
          {fieldErrors.installments && <p className="text-xs text-red-600">{fieldErrors.installments}</p>}
        </div>
      </div>

      {/* Documents */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-700">מסמכים מצורפים <span className="text-red-500">*</span></h2>
        <p className="text-xs text-slate-500">יש לצרף: <strong>אישור רב</strong> (חובה), וכן מומלץ הזמנה / מסמכים רפואיים / כל מסמך אחר. עד {MAX_FILES} קבצים — PDF, מסמך או תמונה. גודל מרבי לקובץ: {MAX_FILE_MB}MB.</p>
        {docs.map((d, i) => (
          <div key={`d${i}`} className="flex items-center gap-2 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700">
            <FileText size={14} className="text-indigo-500 flex-shrink-0" />
            <ViewDocButton url={d.url} className="truncate flex-1 hover:underline">{d.name || `מסמך ${i + 1}`}</ViewDocButton>
            <DownloadDocButton url={d.url} docType={(d.name || `מסמך ${i + 1}`).replace(/\.[^.\s]+$/, '')} person={borrower?.name} name={d.name || d.url} variant="icon" />
            <button type="button" onClick={() => setDocs(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500"><X size={14} /></button>
          </div>
        ))}
        {newFiles.map((f, i) => (
          <div key={`n${i}`} className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-700">
            <FileText size={14} className="flex-shrink-0" />
            <span className="truncate flex-1">{f.name}</span>
            <button type="button" onClick={() => setNewFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500"><X size={14} /></button>
          </div>
        ))}
        <input type="file" ref={fileRef} className="hidden" multiple accept="image/*,.pdf,.doc,.docx" onChange={e => addFiles(e.target.files)} />
        {docs.length + newFiles.length < MAX_FILES && (
          <button type="button" onClick={() => fileRef.current?.click()}
            className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg px-4 py-3 text-sm transition-colors ${fieldErrors.files ? 'border-red-400 text-red-500' : 'border-slate-300 text-slate-500 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600'}`}>
            <Upload size={16} /> הוספת קובץ
          </button>
        )}
        {fieldErrors.files && <p className="text-xs text-red-600">{fieldErrors.files}</p>}
      </div>

      {/* Declaration */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-2">
        <label className="text-xs font-medium text-slate-600">האם פנית בעבר לגמ״ח חתם סופר לבקשת הלוואה? <span className="text-red-500">*</span></label>
        <div className="flex flex-col gap-2 mt-1">
          {DECLARATION_OPTIONS.map(opt => (
            <button key={opt} type="button" onClick={() => { setDeclaration(opt); clearErr('declaration') }}
              className={`text-right rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 ${declaration === opt ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200 text-slate-800' : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-slate-50'}`}>
              <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${declaration === opt ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`} />
              {opt}
            </button>
          ))}
        </div>
        {fieldErrors.declaration && <p className="text-xs text-red-600">{fieldErrors.declaration}</p>}
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-2">
        <label className="text-sm font-semibold text-slate-700">הערות</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
      </div>

      {saveError && <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3"><AlertTriangle size={14} /> {saveError}</div>}
      <div className="flex gap-3 justify-end">
        <Link href={`/admin/loans/${id}`} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition-colors">ביטול</Link>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} שמירה
        </button>
      </div>
    </div>
  )
}
