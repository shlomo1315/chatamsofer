'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Search, Loader2, Check, AlertTriangle, X, CreditCard, Upload, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Beneficiary } from '@/types'

const MAX_AMOUNT = 30000
const MAX_INSTALLMENTS = 60
const MAX_FILES = 5
const MAX_FILE_MB = 10

// הצהרה — האם פנה בעבר לגמ"ח
const DECLARATION_OPTIONS = ['לא הגשתי', 'הגשתי וקיבלתי', 'הגשתי וסורבתי']

// מטרות ההלוואה — כולל הסבר היכן שנדרש
const LOAN_PURPOSES: { value: string; desc?: string }[] = [
  { value: 'נישואי הבן/הבת', desc: 'יש חתן או כלה בבית העומדים לקראת חתונתם — מומלץ לצרף הזמנה במידת האפשר' },
  { value: 'שמחה משפחתית' },
  { value: 'הוצאה רפואית' },
  { value: 'חובות מנישואי הילדים' },
  { value: 'רכישת דירה', desc: 'לתשומת לב: ההלוואה לצורך זה היא רק בעת הרכישה בפועל, ורק לצורך דירה ראשונה ולא לצורך רכישת נכס נוסף' },
  { value: 'אחר' },
]

const fmtCur = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

const ELIGIBILITY_LABEL: Record<string, string> = {
  pending: 'ממתין לאישור', review: 'בבדיקה', approved: 'מאושר', rejected: 'לא מאושר',
}

const familyTitle = (b: Beneficiary) =>
  b.spouse_name
    ? `${[b.family_name].filter(Boolean).join(' ')} ${b.spouse_name}`.trim()
    : [b.family_name, b.full_name].filter(Boolean).join(' ')

export default function NewLoanPage() {
  const router = useRouter()
  const supabase = createClient()

  // Step 1 — beneficiary lookup
  const [idInput, setIdInput] = useState('')
  const [looking, setLooking] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [beneficiary, setBeneficiary] = useState<Beneficiary | null>(null)

  // Step 2 — loan details
  const fileRef = useRef<HTMLInputElement>(null)
  const [purpose, setPurpose] = useState('')
  const [purposeDetails, setPurposeDetails] = useState('')
  const [amount, setAmount] = useState('')
  const [installments, setInstallments] = useState('')
  const [declaration, setDeclaration] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const amountNum = parseInt(amount.replace(/\D/g, '') || '0', 10)
  const instNum = parseInt(installments.replace(/\D/g, '') || '0', 10)
  // פירוט מטרה לא נדרש עבור "נישואי הבן/הבת" — אישור הרב/הזמנה מספיקים
  const needsDetails = purpose !== 'נישואי הבן/הבת'

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const incoming = Array.from(list)
    const tooBig = incoming.find(f => f.size > MAX_FILE_MB * 1024 * 1024)
    if (tooBig) { setFieldErrors(p => ({ ...p, files: `הקובץ "${tooBig.name}" גדול מ-${MAX_FILE_MB}MB` })); return }
    setFiles(prev => {
      const merged = [...prev, ...incoming].slice(0, MAX_FILES)
      return merged
    })
    clearErr('files')
    if (fileRef.current) fileRef.current.value = ''
  }
  const removeFile = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i))

  const lookupBeneficiary = async () => {
    const raw = idInput.trim()
    if (!raw) return
    setLooking(true); setLookupError(''); setBeneficiary(null)
    try {
      const digits = raw.replace(/\D/g, '')
      const variants = Array.from(new Set([raw, digits].filter(Boolean)))
      // חיפוש לפי ת.ז. הבעל (id_number) או ת.ז. האישה (spouse_id_number)
      const orFilter = variants
        .flatMap(v => [`id_number.eq.${v}`, `spouse_id_number.eq.${v}`])
        .join(',')

      const { data, error } = await supabase
        .from('beneficiaries')
        .select('*')
        .or(orFilter)
        .maybeSingle()

      if (error || !data) {
        setLookupError('לא נמצאה משפחה עם תעודת זהות זו (בעל או אישה). יש לרשום את המשפחה תחילה בכרטסת נתמכים.')
      } else if (data.eligibility_status !== 'approved') {
        // רק נתמך בסטטוס מאושר רשאי להגיש בקשת הלוואה
        setLookupError(`לא ניתן להגיש בקשת הלוואה — הנתמך בסטטוס "${ELIGIBILITY_LABEL[data.eligibility_status] ?? data.eligibility_status}". ניתן להגיש בקשה רק עבור נתמך בסטטוס "מאושר".`)
      } else {
        setBeneficiary(data)
      }
    } catch {
      setLookupError('שגיאת רשת — נסה שוב')
    }
    setLooking(false)
  }

  const clearErr = (k: string) => setFieldErrors(p => { if (!p[k]) return p; const n = { ...p }; delete n[k]; return n })

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {}
    if (!purpose) e.purpose = 'יש לבחור מטרת הלוואה'
    if (needsDetails && !purposeDetails.trim()) e.purposeDetails = 'יש לפרט את מטרת ההלוואה'
    if (!amountNum) e.amount = 'יש להזין סכום'
    else if (amountNum > MAX_AMOUNT) e.amount = `הסכום המרבי הוא ${fmtCur(MAX_AMOUNT)}`
    if (!instNum) e.installments = 'יש להזין מספר תשלומים'
    else if (instNum > MAX_INSTALLMENTS) e.installments = `מספר התשלומים המרבי הוא ${MAX_INSTALLMENTS}`
    if (files.length === 0) e.files = 'יש לצרף לפחות מסמך אחד (אישור רב)'
    if (!declaration) e.declaration = 'יש לבחור תשובה'
    return e
  }

  const handleSubmit = async () => {
    if (!beneficiary) return
    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) { setSaveError('יש למלא את כל השדות המסומנים'); return }
    setSaving(true); setSaveError('')
    try {
      // העלאת המסמכים המצורפים לאחסון
      const docs: { url: string; name: string }[] = []
      for (const f of files) {
        const path = `loans/${beneficiary.id}/${Date.now()}_${f.name}`
        const { error: upErr } = await supabase.storage.from('documents').upload(path, f)
        if (!upErr) {
          const { data: pub } = supabase.storage.from('documents').getPublicUrl(path)
          docs.push({ url: pub.publicUrl, name: f.name })
        }
      }

      const { data: inserted, error } = await supabase
        .from('loans')
        .insert({
          beneficiary_id: beneficiary.id,
          amount: amountNum,
          installments: instNum,
          monthly_payment: 0,
          purpose: purpose || null,
          purpose_details: needsDetails ? (purposeDetails.trim() || null) : null,
          declaration: declaration || null,
          document_urls: docs.length ? docs : null,
          notes: notes.trim() || null,
          status: 'pending',
        })
        .select()
        .single()
      if (error) throw error
      router.push(`/admin/loans/${inserted.id}`)
    } catch (e) {
      setSaveError('שגיאה בשמירה — נסה שוב')
      console.error(e)
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/loans" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">בקשת הלוואה חדשה</h1>
          <p className="text-sm text-slate-500">מילוי פרטי בקשת הלוואה</p>
        </div>
      </div>

      {/* ── Step 1: Beneficiary lookup ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">1</span>
          איתור הנתמך
        </h2>
        <div className="flex gap-2">
          <input
            type="text"
            value={idInput}
            onChange={e => setIdInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && lookupBeneficiary()}
            placeholder="תעודת זהות של הבעל או של האישה"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-left ltr-num"
            dir="ltr"
          />
          <button onClick={lookupBeneficiary} disabled={looking || !idInput.trim()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            {looking ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            חיפוש
          </button>
        </div>

        {lookupError && (
          <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
            {lookupError}
          </div>
        )}

        {beneficiary && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2">
                <Check size={15} className="text-green-700 mt-0.5 flex-shrink-0" />
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-green-800">{familyTitle(beneficiary)}</span>
                  <Link href={`/admin/beneficiaries/${beneficiary.id}`} className="text-xs text-green-700/80 underline mt-0.5">
                    פתיחת כרטסת המשפחה
                  </Link>
                </div>
              </div>
              <button onClick={() => { setBeneficiary(null); setIdInput('') }} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-green-700 mt-1">
              <span>ת.ז. הבעל: <span className="ltr-num font-mono">{beneficiary.id_number}</span></span>
              {beneficiary.spouse_id_number && <span>ת.ז. האישה: <span className="ltr-num font-mono">{beneficiary.spouse_id_number}</span></span>}
              {beneficiary.phone && <span>טלפון: <span className="ltr-num">{beneficiary.phone}</span></span>}
              {beneficiary.city && <span>עיר: {beneficiary.city}</span>}
            </div>
          </div>
        )}
      </div>

      {/* ── Step 2: Loan details (only after approved beneficiary found) ── */}
      {beneficiary && (
        <>
          {/* Purpose */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">2</span>
              מטרת ההלוואה <span className="text-red-500">*</span>
            </h2>
            <div className="flex flex-col gap-2">
              {LOAN_PURPOSES.map(p => (
                <button key={p.value} type="button"
                  onClick={() => { setPurpose(p.value); clearErr('purpose') }}
                  className={`text-right rounded-lg border px-3 py-2.5 transition-colors ${
                    purpose === p.value ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                  }`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${purpose === p.value ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'}`} />
                    <span className="text-sm font-medium text-slate-800">{p.value}</span>
                  </div>
                  {p.desc && <p className="text-xs text-slate-500 mt-1 pr-6">{p.desc}</p>}
                </button>
              ))}
            </div>
            {fieldErrors.purpose && <p className="text-xs text-red-600">{fieldErrors.purpose}</p>}

            {needsDetails && (
              <div className="flex flex-col gap-2 mt-1">
                <label className="text-xs font-medium text-slate-600">
                  פירוט מטרת ההלוואה <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={purposeDetails}
                  onChange={e => { setPurposeDetails(e.target.value); clearErr('purposeDetails') }}
                  rows={2}
                  placeholder="פרט/י את מטרת ההלוואה"
                  className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none ${fieldErrors.purposeDetails ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-indigo-500'}`}
                />
                {fieldErrors.purposeDetails && <p className="text-xs text-red-600">{fieldErrors.purposeDetails}</p>}
              </div>
            )}
          </div>

          {/* Amount + installments */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">3</span>
              סכום ותשלומים
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">סכום ההלוואה המבוקש (₪) <span className="text-red-500">*</span></label>
                <input type="text" inputMode="numeric" value={amount}
                  onChange={e => { const v = e.target.value.replace(/\D/g, ''); setAmount(v === '' ? '' : String(Math.min(parseInt(v, 10), MAX_AMOUNT))); clearErr('amount') }}
                  placeholder="0"
                  className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ltr-num text-left ${fieldErrors.amount ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-indigo-500'}`}
                  dir="ltr" />
                <p className="text-[11px] text-slate-400">עד {MAX_AMOUNT.toLocaleString('he-IL')} ש״ח (שימו לב, ההלוואה מתבצעת במטבע הדולר)</p>
                {fieldErrors.amount && <p className="text-xs text-red-600">{fieldErrors.amount}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-600">מספר תשלומים להחזר <span className="text-red-500">*</span></label>
                <input type="text" inputMode="numeric" value={installments}
                  onChange={e => { const v = e.target.value.replace(/\D/g, ''); setInstallments(v === '' ? '' : String(Math.min(parseInt(v, 10), MAX_INSTALLMENTS))); clearErr('installments') }}
                  placeholder="בחר/י מספר תשלומים"
                  className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ltr-num text-left ${fieldErrors.installments ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-indigo-500'}`}
                  dir="ltr" />
                <p className="text-[11px] text-slate-400">עד {MAX_INSTALLMENTS} תשלומים</p>
                {fieldErrors.installments && <p className="text-xs text-red-600">{fieldErrors.installments}</p>}
              </div>
            </div>
          </div>

          {/* Documents */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">4</span>
              צירוף מסמכים <span className="text-red-500">*</span>
            </h2>
            <p className="text-xs text-slate-500">יש לצרף: <strong>אישור רב</strong> (חובה), וכן מומלץ הזמנה / מסמכים רפואיים / כל מסמך אחר. עד {MAX_FILES} קבצים — PDF, מסמך או תמונה. גודל מרבי לקובץ: {MAX_FILE_MB}MB.</p>
            <input type="file" ref={fileRef} className="hidden" multiple accept="image/*,.pdf,.doc,.docx"
              onChange={e => addFiles(e.target.files)} />
            {files.length > 0 && (
              <div className="flex flex-col gap-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700">
                    <FileText size={14} className="text-indigo-500 flex-shrink-0" />
                    <span className="truncate flex-1">{f.name}</span>
                    <button type="button" onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-500 flex-shrink-0"><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
            {files.length < MAX_FILES && (
              <button type="button" onClick={() => fileRef.current?.click()}
                className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg px-4 py-3 text-sm transition-colors ${fieldErrors.files ? 'border-red-400 text-red-500 hover:bg-red-50' : 'border-slate-300 text-slate-500 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                <Upload size={16} /> הוספת קובץ
              </button>
            )}
            {fieldErrors.files && <p className="text-xs text-red-600">{fieldErrors.files}</p>}
          </div>

          {/* Declaration */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">5</span>
              הצהרה <span className="text-red-500">*</span>
            </h2>
            <label className="text-xs font-medium text-slate-600">האם פנית בעבר לגמ״ח חתם סופר לבקשת הלוואה?</label>
            <div className="flex flex-col gap-2 mt-1">
              {DECLARATION_OPTIONS.map(opt => (
                <button key={opt} type="button"
                  onClick={() => { setDeclaration(opt); clearErr('declaration') }}
                  className={`text-right rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 ${
                    declaration === opt ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200 text-slate-800' : 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:bg-slate-50'
                  }`}>
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

          {saveError && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangle size={14} /> {saveError}
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <Link href="/admin/loans" className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition-colors">ביטול</Link>
            <button onClick={handleSubmit} disabled={saving}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
              הגשת בקשה
            </button>
          </div>
        </>
      )}
    </div>
  )
}
