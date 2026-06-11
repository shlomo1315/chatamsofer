'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Search, Loader2, Check, AlertTriangle, Upload, X, Baby, ExternalLink, GitBranch, ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { validateIsraeliId } from '@/lib/validation'
import HebrewDatePicker from '@/components/ui/HebrewDatePicker'
import { format, addWeeks } from 'date-fns'
import { he } from 'date-fns/locale'
import type { Beneficiary } from '@/types'
import ConfettiSuccess from '@/components/ui/ConfettiSuccess'
import LineageBranchView from '@/app/admin/beneficiaries/[id]/LineageBranchView'

const RECOVERY_HOMES = ['אם וילד', 'טלזסטון', 'ביכורים']

function sixWeeksEnd(birthDate: string): string {
  if (!birthDate) return ''
  const d = new Date(birthDate)
  return format(addWeeks(d, 6), 'dd/MM/yyyy', { locale: he })
}

export default function NewMaternityPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  // Step 1 — mother lookup
  const [idInput, setIdInput] = useState('')
  const [looking, setLooking] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const [mother, setMother] = useState<Beneficiary | null>(null)

  // Step 2 — baby details
  const [babyName, setBabyName] = useState('')
  const [babyIdType, setBabyIdType] = useState<'id' | 'passport'>('id')
  const [babyIdNumber, setBabyIdNumber] = useState('')
  const [babyGender, setBabyGender] = useState<'male' | 'female' | ''>('')
  const [babyBirthDate, setBabyBirthDate] = useState('')
  const [recoveryHome, setRecoveryHome] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [certFile, setCertFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [savedInfo, setSavedInfo] = useState<{ name: string; details: string[] } | null>(null)
  const [lineagePath, setLineagePath] = useState<string[]>([])
  // רשימת בתי החלמה — נטענת דינמית (כולל בתים שנוספו), עם נפילה לברירת המחדל
  const [recoveryHomes, setRecoveryHomes] = useState<string[]>(RECOVERY_HOMES)
  useEffect(() => {
    supabase.from('recovery_homes').select('name').order('name').then(({ data }) => {
      if (data && data.length) setRecoveryHomes([...new Set([...RECOVERY_HOMES, ...data.map((r: { name: string }) => r.name)])])
    })
  }, [supabase])

  // שליפת שרשרת הדורות (עץ הדורות) של המשפחה שנמצאה
  const loadLineage = async (lineageNodeId?: string, manual?: unknown) => {
    const names: string[] = []
    if (lineageNodeId) {
      try {
        const res = await fetch(`/api/lineage?node_id=${lineageNodeId}`)
        const j = await res.json()
        for (const node of (j.path ?? [])) {
          if (node.name) names.push(node.name)
        }
      } catch { /* ignore */ }
    }
    if (Array.isArray(manual)) names.push(...(manual as string[]).filter(Boolean))
    setLineagePath(names)
  }

  const lookupMother = async () => {
    if (!idInput.trim()) return
    setLooking(true); setLookupError(''); setMother(null); setLineagePath([])
    try {
      const raw = idInput.trim()
      const digits = raw.replace(/\D/g, '')
      // נחפש גם לפי הערך כפי שהוקלד וגם לפי הספרות בלבד (כך נתפוס ת.ז. שנשמרה מנורמלת)
      const variants = Array.from(new Set([raw, digits].filter(Boolean)))
      const orFilter = variants.map(v => `spouse_id_number.eq.${v}`).join(',')

      // חיפוש לפי תעודת הזהות של האישה (spouse_id_number)
      const { data, error } = await supabase
        .from('beneficiaries')
        .select('*')
        .or(orFilter)
        .maybeSingle()

      if (error || !data) {
        setLookupError('לא נמצאה אישה עם תעודת זהות זו במערכת. יש לרשום את המשפחה תחילה בכרטסת צאצאים (כולל פרטי האישה).')
      } else if (data.marital_status !== 'נשואים') {
        // גרושה / אלמנה — אין אפשרות לפתוח תיק יולדת
        setLookupError(`נמצאה רשומה אך הסטטוס המשפחתי הוא "${data.marital_status || 'לא ידוע'}". ניתן לפתוח תיק יולדת רק עבור סטטוס "נשואים".`)
      } else {
        setMother(data)
        loadLineage(data.lineage_node_id, (data as { lineage_manual?: unknown }).lineage_manual)
      }
    } catch {
      setLookupError('שגיאת רשת — נסה שוב')
    }
    setLooking(false)
  }

  const clearErr = (key: string) => setFieldErrors(p => {
    if (!p[key]) return p
    const next = { ...p }; delete next[key]; return next
  })

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {}
    if (!babyName.trim()) e.babyName = 'שם תינוק חובה'
    if (!babyIdNumber.trim()) {
      e.babyIdNumber = babyIdType === 'id' ? 'מספר תעודת זהות תינוק חובה' : 'מספר דרכון חובה'
    } else if (babyIdType === 'id' && !validateIsraeliId(babyIdNumber)) {
      e.babyIdNumber = 'תעודת זהות ישראלית לא תקינה (כולל ספרת ביקורת)'
    }
    if (!babyGender) e.babyGender = 'יש לבחור מין תינוק'
    if (!babyBirthDate) e.babyBirthDate = 'תאריך לידת תינוק חובה'
    if (!recoveryHome) e.recoveryHome = 'יש לבחור בית החלמה'
    if (!certFile) e.certFile = 'יש לצרף אישור לידה'
    const cardDigits = cardNumber.replace(/\D/g, '')
    if (!cardNumber.trim()) e.cardNumber = 'מספר כרטיס נדרים חובה'
    else if (cardDigits.length !== 16) e.cardNumber = 'מספר כרטיס נדרים חייב להכיל 16 ספרות'
    return e
  }

  const handleSubmit = async () => {
    if (!mother) return
    const errs = validate()

    // בדיקת כפילות — האם תינוק עם ת.ז. זו כבר קיים ברשימת הילדים של המשפחה
    if (!errs.babyIdNumber && babyIdNumber.trim()) {
      const normalizedBabyId = babyIdType === 'id' ? babyIdNumber.replace(/\D/g, '') : babyIdNumber.trim()
      const existingChildren = Array.isArray((mother as { children?: unknown }).children)
        ? ((mother as { children: Record<string, unknown>[] }).children)
        : []
      const dup = existingChildren.some(c => {
        const cid = String(c.id_number ?? '').replace(/\D/g, '') || String(c.id_number ?? '')
        return cid && (cid === normalizedBabyId || c.id_number === babyIdNumber.trim())
      })
      if (dup) errs.babyIdNumber = 'ילד עם תעודת זהות זו כבר רשום במשפחה זו — לא ניתן להוסיף שוב'
    }

    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) { setSaveError('יש למלא את כל השדות המסומנים'); return }
    setSaving(true); setSaveError('')
    try {
      let certUrl: string | undefined
      if (certFile) {
        // ניקוי שם הקובץ (עברית/רווחים שוברים מפתח אחסון)
        const safeName = certFile.name.replace(/[^\w.\-]+/g, '_')
        const path = `maternity/${mother.id}/${Date.now()}_${safeName}`
        const { error: upErr } = await supabase.storage.from('documents').upload(path, certFile, { upsert: true })
        if (upErr) throw new Error(`שגיאה בהעלאת אישור הלידה: ${upErr.message}`)
        const { data: pub } = supabase.storage.from('documents').getPublicUrl(path)
        certUrl = pub.publicUrl
      }

      const sixEnd = addWeeks(new Date(babyBirthDate), 6).toISOString().split('T')[0]

      const { data: inserted, error } = await supabase
        .from('maternity_aids')
        .insert({
          beneficiary_id: mother.id,
          birth_date: babyBirthDate,
          baby_name: babyName.trim() || null,
          baby_id_type: babyIdType,
          baby_id_number: babyIdNumber || null,
          baby_gender: babyGender || null,
          birth_certificate_url: certUrl ?? null,
          recovery_home: recoveryHome || null,
          card_number: cardNumber || null,
          six_weeks_end: sixEnd,
          total_weeks: 6,
          card_balance: 0,
          weekly_amount: 0,
          status: 'pending',
        })
        .select()
        .single()

      if (error) throw error

      // הכנסת התינוק לכרטסת המשפחה (פרטי הילדים) בסטטוס "ממתין לאישור לידה".
      // עם אישור הלידה בתיק היולדת הסטטוס יתעדכן ל"מאושר".
      const existingChildren = Array.isArray((mother as { children?: Record<string, unknown>[] }).children)
        ? ((mother as { children: Record<string, unknown>[] }).children)
        : []
      const newChild = {
        name: babyName.trim(),
        id_number: babyIdNumber.trim() || null,
        doc_type: babyIdType,
        gender: babyGender || null,
        birth_date: babyBirthDate || null,
        marital_status: 'single',
        maternity_aid_id: inserted.id,
        birth_status: 'pending' as const,
      }
      const updatedChildren = [...existingChildren, newChild]
      await supabase
        .from('beneficiaries')
        .update({ children: updatedChildren, children_count: updatedChildren.length })
        .eq('id', mother.id)

      // חלונית הצלחה עם קונפיטי — מציגה את הפרטים ל-3 שניות ואז נכנסת לכרטסת
      const familyName = mother.spouse_name
        ? [mother.family_name, mother.spouse_name].filter(Boolean).join(' ')
        : [mother.family_name, mother.full_name].filter(Boolean).join(' ')
      setSavedInfo({
        name: familyName || 'המשפחה',
        details: [
          `תינוק/ת: ${babyName.trim()}`,
          babyGender ? (babyGender === 'male' ? 'בן' : 'בת') : '',
          babyIdNumber.trim() ? `ת.ז. ${babyIdNumber.trim()}` : '',
          babyBirthDate ? `לידה ${format(new Date(babyBirthDate), 'dd/MM/yyyy', { locale: he })}` : '',
          recoveryHome ? `בית החלמה: ${recoveryHome}` : '',
        ].filter(Boolean),
      })
      setTimeout(() => router.push(`/admin/maternity/${inserted.id}`), 3000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'שגיאה בשמירה — נסה שוב')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const statusWarning = mother && mother.eligibility_status !== 'approved'

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      {savedInfo && (
        <ConfettiSuccess title="הלידה נוספה בהצלחה! 🎉" subtitle={`למשפחת ${savedInfo.name}`} details={savedInfo.details} />
      )}
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/maternity" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">לידה חדשה</h1>
          <p className="text-sm text-slate-500">פתיחת תיק סיוע יולדות</p>
        </div>
      </div>

      {/* ── Step 1: Mother lookup ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">1</span>
          פרטי האם (יולדת)
        </h2>

        <div className="flex gap-2">
          <input
            type="text"
            value={idInput}
            onChange={e => setIdInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && lookupMother()}
            placeholder="הכנס מספר תעודת זהות של האישה (היולדת)"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-left ltr-num"
            dir="ltr"
          />
          <button
            onClick={lookupMother}
            disabled={looking || !idInput.trim()}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
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

        {mother && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2">
                <Check size={15} className="text-green-700 mt-0.5 flex-shrink-0" />
                <div className="flex flex-col">
                  {/* כותרת = שם האישה (היולדת). אם אין spouse_name נופלים לשם הרשומה */}
                  <span className="text-sm font-semibold text-green-800">
                    {mother.spouse_name
                      ? `${[mother.family_name].filter(Boolean).join(' ')} ${mother.spouse_name}`.trim()
                      : [mother.family_name, mother.full_name].filter(Boolean).join(' ')}
                  </span>
                  {mother.spouse_name && (
                    <span className="text-xs text-green-600/80 mt-0.5">
                      בן זוג: {[mother.family_name, mother.full_name].filter(Boolean).join(' ')}
                    </span>
                  )}
                  <Link href={`/admin/beneficiaries/${mother.id}`}
                    className="text-xs text-indigo-600 hover:text-indigo-700 underline inline-flex items-center gap-1 mt-1 w-fit">
                    <ExternalLink size={11} /> פתיחת כרטסת המשפחה
                  </Link>
                </div>
              </div>
              <button onClick={() => { setMother(null); setIdInput(''); setLineagePath([]) }} className="text-slate-400 hover:text-slate-600"><X size={15} /></button>
            </div>

            {/* שרשרת הדורות (עץ הדורות) של המשפחה */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs border-t border-green-200/70 pt-2 mt-1">
              <span className="inline-flex items-center gap-1 text-green-700/80 font-medium">
                <GitBranch size={12} /> שרשרת הדורות:
              </span>
              {lineagePath.length > 0 ? lineagePath.map((name, i) => (
                <span key={i} className="inline-flex items-center gap-1.5">
                  <span className="bg-white border border-green-200 rounded-full px-2 py-0.5 text-green-800">
                    <span className="text-green-500">דור {i + 1}</span> {name}
                  </span>
                  {i < lineagePath.length - 1 && <ChevronLeft size={12} className="text-green-400" />}
                </span>
              )) : (
                <span className="text-slate-400 italic">לא משויך לעץ הדורות</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-green-700 mt-1">
              <span>ת.ז. האישה: <span className="ltr-num font-mono">{mother.spouse_id_number ?? mother.id_number}</span></span>
              <span>ת.ז. הבעל: <span className="ltr-num font-mono">{mother.id_number}</span></span>
              {mother.phone && <span>טלפון: <span className="ltr-num">{mother.phone}</span></span>}
              {mother.city && <span>עיר: {mother.city}</span>}
            </div>
            {statusWarning && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-1">
                <AlertTriangle size={13} />
                שים לב: הצאצא בסטטוס "{mother.eligibility_status === 'pending' || mother.eligibility_status === 'review' ? 'ממתין לאישור' : 'לא מאושר'}" — ניתן להמשיך אך מומלץ לאשר קודם.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Lineage visual tree ─────────────────────────────────────────── */}
      {mother && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
            <GitBranch size={15} className="text-indigo-500" />
            <span className="text-sm font-semibold text-slate-700">עץ הדורות</span>
          </div>
          <div className="h-64 overflow-hidden">
            <LineageBranchView nodeId={mother.lineage_node_id ?? null} />
          </div>
        </div>
      )}

      {/* ── Step 2: Baby details (shown only after mother found) ────────── */}
      {mother && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">2</span>
              פרטי התינוק
            </h2>

            {/* Baby name */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-slate-600">שם התינוק <span className="text-red-500">*</span></label>
              <input
                type="text" value={babyName}
                onChange={e => { setBabyName(e.target.value); clearErr('babyName') }}
                placeholder="שם פרטי של התינוק/ת"
                className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${fieldErrors.babyName ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-indigo-500'}`}
              />
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
              <input
                type="text" value={babyIdNumber}
                onChange={e => { setBabyIdNumber(e.target.value); clearErr('babyIdNumber') }}
                placeholder={babyIdType === 'id' ? 'מספר תעודת זהות תינוק' : 'מספר דרכון תינוק'}
                className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ltr-num text-left ${fieldErrors.babyIdNumber ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-indigo-500'}`}
                dir="ltr"
              />
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

            {/* Birth date + 6 weeks calc */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-slate-600">תאריך לידת התינוק <span className="text-red-500">*</span></label>
              <HebrewDatePicker value={babyBirthDate} onChange={iso => { setBabyBirthDate(iso); clearErr('babyBirthDate') }} maxToday />
              {fieldErrors.babyBirthDate && <p className="text-xs text-red-600">{fieldErrors.babyBirthDate}</p>}
              {babyBirthDate && (
                <div className="flex items-center gap-2 text-xs bg-indigo-50 text-indigo-700 rounded-lg px-3 py-2 border border-indigo-100">
                  <Baby size={13} />
                  סיום 6 שבועות (תאריך יעד): <span className="font-bold mr-1">{sixWeeksEnd(babyBirthDate)}</span>
                </div>
              )}
            </div>

            {/* Recovery home */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-slate-600">בית החלמה <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                {recoveryHomes.map(h => (
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
              <label className="text-xs font-medium text-slate-600">אישור לידה (קובץ מצורף) <span className="text-red-500">*</span></label>
              <input type="file" ref={fileRef} className="hidden" accept="image/*,.pdf"
                onChange={e => { setCertFile(e.target.files?.[0] ?? null); clearErr('certFile') }} />
              {certFile ? (
                <div className="flex items-center gap-2 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-700">
                  <Check size={14} />
                  <span className="truncate flex-1">{certFile.name}</span>
                  <button onClick={() => { setCertFile(null); if (fileRef.current) fileRef.current.value = '' }}
                    className="text-slate-400 hover:text-red-500 flex-shrink-0"><X size={14} /></button>
                </div>
              ) : (
                <button onClick={() => fileRef.current?.click()}
                  className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg px-4 py-4 text-sm transition-colors ${fieldErrors.certFile ? 'border-red-400 text-red-500 hover:bg-red-50' : 'border-slate-300 text-slate-500 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                  <Upload size={16} />
                  לחץ להעלאת קובץ (תמונה / PDF)
                </button>
              )}
              {fieldErrors.certFile && <p className="text-xs text-red-600">{fieldErrors.certFile}</p>}
            </div>
          </div>

          {/* ── Step 3: Nedarim card ──────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">3</span>
              כרטיס נדרים
            </h2>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-slate-600">מספר כרטיס נדרים <span className="text-red-500">*</span> <span className="font-normal text-slate-400">(16 ספרות)</span></label>
              <input
                type="text" inputMode="numeric" value={cardNumber}
                onChange={e => { setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16)); clearErr('cardNumber') }}
                placeholder="0000000000000000"
                maxLength={16}
                className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ltr-num text-left tracking-widest ${fieldErrors.cardNumber ? 'border-red-400 focus:ring-red-400' : 'border-slate-300 focus:ring-indigo-500'}`}
                dir="ltr"
              />
              <p className="text-[11px] text-slate-400 text-left ltr-num">{cardNumber.replace(/\D/g, '').length}/16</p>
              {fieldErrors.cardNumber && <p className="text-xs text-red-600">{fieldErrors.cardNumber}</p>}
            </div>
          </div>

          {/* Submit */}
          {saveError && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertTriangle size={14} /> {saveError}
            </div>
          )}
          <div className="flex gap-3 justify-end">
            <Link href="/admin/maternity"
              className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
              ביטול
            </Link>
            <button onClick={handleSubmit} disabled={saving || !babyBirthDate}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              פתח תיק יולדת
            </button>
          </div>
        </>
      )}
    </div>
  )
}
