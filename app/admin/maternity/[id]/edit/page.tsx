'use client'
import { useState, useEffect, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Loader2, Check, AlertTriangle, Upload, X, Baby } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { validateIsraeliId } from '@/lib/validation'
import { UPLOAD_ACCEPT, UPLOAD_HINT } from '@/lib/uploads'
import HebrewDatePicker from '@/components/ui/HebrewDatePicker'
import { format, addWeeks } from 'date-fns'
import { he } from 'date-fns/locale'

const RECOVERY_HOMES = ['אם וילד', 'טלזסטון', 'ביכורים']

function sixWeeksEnd(birthDate: string): string {
  if (!birthDate) return ''
  return format(addWeeks(new Date(birthDate), 6), 'dd/MM/yyyy', { locale: he })
}

type Child = Record<string, unknown>

export default function EditMaternityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [recoveryHomes, setRecoveryHomes] = useState<string[]>(RECOVERY_HOMES)
  useEffect(() => {
    supabase.from('recovery_homes').select('name').order('name').then(({ data }) => {
      if (data && data.length) setRecoveryHomes([...new Set([...RECOVERY_HOMES, ...data.map((r: { name: string }) => r.name)])])
    })
  }, [supabase])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [motherId, setMotherId] = useState<string | null>(null)
  const [children, setChildren] = useState<Child[]>([])

  // editable fields
  const [babyName, setBabyName] = useState('')
  const [babyIdType, setBabyIdType] = useState<'id' | 'passport'>('id')
  const [babyIdNumber, setBabyIdNumber] = useState('')
  const [babyGender, setBabyGender] = useState<'male' | 'female' | ''>('')
  const [babyBirthDate, setBabyBirthDate] = useState('')
  const [recoveryHome, setRecoveryHome] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [certUrl, setCertUrl] = useState<string | null>(null)
  const [certFile, setCertFile] = useState<File | null>(null)
  // האם הזכאות הוארכה ידנית — אם כן, לא נדרוס את six_weeks_end בעת שמירת העריכה
  const [eligibilityExtended, setEligibilityExtended] = useState(false)

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('maternity_aids')
          .select('*, beneficiary:beneficiaries(id, children)')
          .eq('id', id)
          .single()
        if (error || !data) throw error ?? new Error('not found')
        setBabyName(data.baby_name ?? '')
        setBabyIdType(data.baby_id_type ?? 'id')
        setBabyIdNumber(data.baby_id_number ?? '')
        setBabyGender(data.baby_gender ?? '')
        setBabyBirthDate(data.birth_date ?? '')
        setRecoveryHome(data.recovery_home ?? '')
        setCardNumber(data.card_number ?? '')
        setCertUrl(data.birth_certificate_url ?? null)
        setEligibilityExtended(!!data.eligibility_extended)
        const ben = data.beneficiary as { id?: string; children?: Child[] } | undefined
        setMotherId(ben?.id ?? null)
        setChildren(Array.isArray(ben?.children) ? ben!.children! : [])
      } catch {
        setLoadError('שגיאה בטעינת התיק')
      } finally {
        setLoading(false)
      }
    })()
  }, [id, supabase])

  const clearErr = (key: string) => setFieldErrors(p => {
    if (!p[key]) return p
    const next = { ...p }; delete next[key]; return next
  })

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {}
    if (!babyName.trim()) e.babyName = 'שם תינוק חובה'
    if (!babyIdNumber.trim()) e.babyIdNumber = babyIdType === 'id' ? 'מספר תעודת זהות תינוק חובה' : 'מספר דרכון חובה'
    else if (babyIdType === 'id' && !validateIsraeliId(babyIdNumber)) e.babyIdNumber = 'תעודת זהות ישראלית לא תקינה'
    if (!babyGender) e.babyGender = 'יש לבחור מין תינוק'
    if (!babyBirthDate) e.babyBirthDate = 'תאריך לידת תינוק חובה'
    if (!recoveryHome) e.recoveryHome = 'יש לבחור בית החלמה'
    const cardDigits = cardNumber.replace(/\D/g, '')
    if (!cardNumber.trim()) e.cardNumber = 'מספר כרטיס נדרים חובה'
    else if (cardDigits.length !== 16) e.cardNumber = 'מספר כרטיס נדרים חייב להכיל 16 ספרות'
    return e
  }

  const handleSave = async () => {
    const errs = validate()
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) { setSaveError('יש למלא את כל השדות המסומנים'); return }
    setSaving(true); setSaveError('')
    try {
      let newCertUrl = certUrl ?? undefined
      if (certFile && motherId) {
        const path = `maternity/${motherId}/${Date.now()}_${certFile.name}`
        const { error: upErr } = await supabase.storage.from('documents').upload(path, certFile)
        if (!upErr) {
          const { data: pub } = supabase.storage.from('documents').getPublicUrl(path)
          newCertUrl = pub.publicUrl
        }
      }

      const sixEnd = addWeeks(new Date(babyBirthDate), 6).toISOString().split('T')[0]

      const updatePayload: Record<string, unknown> = {
        birth_date: babyBirthDate,
        baby_name: babyName.trim() || null,
        baby_id_type: babyIdType,
        baby_id_number: babyIdNumber || null,
        baby_gender: babyGender || null,
        birth_certificate_url: newCertUrl ?? null,
        recovery_home: recoveryHome || null,
        card_number: cardNumber || null,
      }
      // אם הזכאות הוארכה ידנית — שומרים על תאריך הסיום הידני ולא דורסים אותו.
      // אחרת מחשבים מחדש לפי תאריך הלידה (ברירת מחדל: 6 שבועות).
      if (!eligibilityExtended) updatePayload.six_weeks_end = sixEnd

      const { error } = await supabase
        .from('maternity_aids')
        .update(updatePayload)
        .eq('id', id)
      if (error) throw error

      // סנכרון פרטי התינוק בכרטסת המשפחה (שומר על סטטוס הלידה הקיים)
      if (motherId) {
        const idx = children.findIndex(c =>
          (c.maternity_aid_id && c.maternity_aid_id === id) ||
          (babyIdNumber && c.id_number === babyIdNumber))
        if (idx !== -1) {
          const updated = children.map((c, i) => i === idx ? {
            ...c,
            name: babyName.trim(),
            id_number: babyIdNumber.trim() || null,
            doc_type: babyIdType,
            gender: babyGender || null,
            birth_date: babyBirthDate || null,
          } : c)
          await supabase.from('beneficiaries').update({ children: updated }).eq('id', motherId)
        }
      }

      router.push(`/admin/maternity/${id}`)
      router.refresh()
    } catch {
      setSaveError('שגיאה בשמירה — נסה שוב')
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-slate-400"><Loader2 size={20} className="animate-spin" /></div>
  }
  if (loadError) {
    return <div className="max-w-2xl bg-white rounded-xl border p-8 text-center text-red-500">{loadError}</div>
  }

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`/admin/maternity/${id}`} className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">עריכת תיק יולדת</h1>
          <p className="text-sm text-slate-500">עדכון פרטי התינוק והכרטיס</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
        {/* Baby name */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-600">שם התינוק <span className="text-red-500">*</span></label>
          <input type="text" value={babyName}
            onChange={e => { setBabyName(e.target.value); clearErr('babyName') }}
            className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${fieldErrors.babyName ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-indigo-500'}`} />
          {fieldErrors.babyName && <p className="text-xs text-red-600">{fieldErrors.babyName}</p>}
        </div>

        {/* ID type + number */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-600">סוג מסמך תינוק <span className="text-red-500">*</span></label>
          <div className="flex gap-2">
            {(['id', 'passport'] as const).map(t => (
              <button key={t} onClick={() => { setBabyIdType(t); clearErr('babyIdNumber') }}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${babyIdType === t ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                {t === 'id' ? 'תעודת זהות' : 'דרכון'}
              </button>
            ))}
          </div>
          <input type="text" value={babyIdNumber}
            onChange={e => { setBabyIdNumber(e.target.value); clearErr('babyIdNumber') }}
            className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ltr-num text-left ${fieldErrors.babyIdNumber ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-indigo-500'}`}
            dir="ltr" />
          {fieldErrors.babyIdNumber && <p className="text-xs text-red-600">{fieldErrors.babyIdNumber}</p>}
        </div>

        {/* Gender */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-600">מין התינוק <span className="text-red-500">*</span></label>
          <div className="flex gap-2">
            {([['male', 'בן'], ['female', 'בת']] as const).map(([val, label]) => (
              <button key={val} onClick={() => { setBabyGender(val); clearErr('babyGender') }}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${babyGender === val ? (val === 'male' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-pink-500 border-pink-500 text-white') : `${fieldErrors.babyGender ? 'border-red-400' : 'border-slate-300'} text-slate-600 hover:bg-slate-50`}`}>
                {label}
              </button>
            ))}
          </div>
          {fieldErrors.babyGender && <p className="text-xs text-red-600">{fieldErrors.babyGender}</p>}
        </div>

        {/* Birth date */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-600">תאריך לידת התינוק <span className="text-red-500">*</span></label>
          <HebrewDatePicker value={babyBirthDate} onChange={iso => { setBabyBirthDate(iso); clearErr('babyBirthDate') }} maxToday />
          {fieldErrors.babyBirthDate && <p className="text-xs text-red-600">{fieldErrors.babyBirthDate}</p>}
          {babyBirthDate && (
            <div className="flex items-center gap-2 text-xs bg-indigo-50 text-indigo-700 rounded-lg px-3 py-2 border border-indigo-100">
              <Baby size={13} /> 6 שבועות לאחר הלידה: <span className="font-bold mr-1">{sixWeeksEnd(babyBirthDate)}</span>
              {eligibilityExtended && <span className="mr-1 text-indigo-500">— הזכאות הוארכה ידנית (תאריך הסיום נשמר בנפרד)</span>}
            </div>
          )}
        </div>

        {/* Recovery home */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-600">בית החלמה <span className="text-red-500">*</span></label>
          <div className="flex gap-2">
            {RECOVERY_HOMES.map(h => (
              <button key={h} onClick={() => { setRecoveryHome(recoveryHome === h ? '' : h); clearErr('recoveryHome') }}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${recoveryHome === h ? 'bg-indigo-600 border-indigo-600 text-white' : `${fieldErrors.recoveryHome ? 'border-red-400' : 'border-slate-300'} text-slate-600 hover:bg-slate-50`}`}>
                {h}
              </button>
            ))}
          </div>
          {fieldErrors.recoveryHome && <p className="text-xs text-red-600">{fieldErrors.recoveryHome}</p>}
        </div>

        {/* Birth certificate */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-slate-600">אישור לידה (קובץ מצורף)</label>
          <input type="file" ref={fileRef} className="hidden" accept={UPLOAD_ACCEPT}
            onChange={e => setCertFile(e.target.files?.[0] ?? null)} />
          {certFile ? (
            <div className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-700">
              <Check size={14} />
              <span className="truncate flex-1">{certFile.name}</span>
              <button onClick={() => { setCertFile(null); if (fileRef.current) fileRef.current.value = '' }}
                className="text-slate-400 hover:text-red-500 flex-shrink-0"><X size={14} /></button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {certUrl && (
                <a href={certUrl} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-indigo-600 hover:underline">צפייה בקובץ הנוכחי</a>
              )}
              <button onClick={() => fileRef.current?.click()}
                className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg px-4 py-2.5 text-sm border-slate-300 text-slate-500 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">
                <Upload size={16} /> {certUrl ? 'החלפת הקובץ' : 'העלאת קובץ'}
              </button>
            </div>
          )}
          <p className="text-xs text-slate-400">{UPLOAD_HINT}</p>
        </div>
      </div>

      {/* Nedarim card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-2">
        <label className="text-xs font-medium text-slate-600">מספר כרטיס נדרים <span className="text-red-500">*</span> <span className="font-normal text-slate-400">(16 ספרות)</span></label>
        <input type="text" inputMode="numeric" value={cardNumber}
          onChange={e => { setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16)); clearErr('cardNumber') }}
          maxLength={16}
          className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ltr-num text-left tracking-widest ${fieldErrors.cardNumber ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-indigo-500'}`}
          dir="ltr" />
        <p className="text-[11px] text-slate-400 text-left ltr-num">{cardNumber.replace(/\D/g, '').length}/16</p>
        {fieldErrors.cardNumber && <p className="text-xs text-red-600">{fieldErrors.cardNumber}</p>}
      </div>

      {saveError && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle size={14} /> {saveError}
        </div>
      )}
      <div className="flex gap-3 justify-end">
        <Link href={`/admin/maternity/${id}`}
          className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition-colors">ביטול</Link>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} שמירה
        </button>
      </div>
    </div>
  )
}
