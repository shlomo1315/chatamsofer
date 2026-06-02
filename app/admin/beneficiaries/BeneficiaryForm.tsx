'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import { GitBranch, ChevronLeft, Loader2, Heart, User, Phone, MapPin, Users, FileText, Plus, X, CheckCircle2 } from 'lucide-react'
import { validateIsraeliId } from '@/lib/validation'

const MARITAL_OPTIONS = ['נשואים', 'גרוש', 'גרושה', 'אלמן', 'אלמנה']
const WIFE_PRIMARY_STATUSES = ['גרושה', 'אלמנה']
const MARRIED_STATUS = 'נשואים'

const STATUS_OPTIONS = [
  { value: 'pending', label: 'ממתין לאישור', sel: 'bg-amber-500 text-white border-amber-500', unsel: 'border-amber-300 text-amber-700 hover:bg-amber-50' },
  { value: 'approved', label: 'מאושר', sel: 'bg-green-600 text-white border-green-600', unsel: 'border-green-300 text-green-700 hover:bg-green-50' },
  { value: 'rejected', label: 'לא מאושר', sel: 'bg-red-600 text-white border-red-600', unsel: 'border-red-300 text-red-700 hover:bg-red-50' },
]

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface ChildEntry {
  name: string
  id_number: string
  doc_type: 'id' | 'passport'
  gender: string
  birth_date: string
  marital_status: string
  // נשמרים עבור ילדים שנכנסו דרך תיק יולדת — לא לאבד אותם בעריכה
  birth_status?: 'pending' | 'approved'
  maternity_aid_id?: string
}

function emptyChild(): ChildEntry {
  return { name: '', id_number: '', doc_type: 'id', gender: '', birth_date: '', marital_status: '' }
}

// סטטוס משפחתי לילד לפי מין: בן → נשוי/לא נשוי, בת → נשואה/לא נשואה
function maritalOptionsFor(gender: string): { value: string; label: string }[] {
  if (gender === 'male') return [{ value: 'married', label: 'נשוי' }, { value: 'single', label: 'לא נשוי' }]
  if (gender === 'female') return [{ value: 'married', label: 'נשואה' }, { value: 'single', label: 'לא נשואה' }]
  return []
}

interface LineageNode {
  id: string
  name: string
  generation: number
  parent_id: string | null
}

function LineageCascade({
  initialNodeId,
  onSelect,
}: {
  initialNodeId?: string
  onSelect: (nodeId: string, path: string[]) => void
}) {
  const [levels, setLevels] = useState<
    { nodes: LineageNode[]; selected: string | null; selectedName: string }[]
  >([])
  const [loading, setLoading] = useState(false)

  const loadLevel = useCallback(async (parentId: string | null, levelIdx: number) => {
    setLoading(true)
    try {
      const url = parentId ? `/api/lineage?parent_id=${parentId}` : '/api/lineage'
      const res = await fetch(url)
      const data = await res.json()
      setLevels(prev => {
        const next = prev.slice(0, levelIdx)
        if ((data.nodes ?? []).length > 0) {
          next.push({ nodes: data.nodes, selected: null, selectedName: '' })
        }
        return next
      })
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  // טעינה ראשונית: אם קיים שיוך שמור (עריכה) — שחזר את כל מסלול הדורות שנבחר;
  // אחרת טען את דור 1 בלבד (רישום חדש).
  const didInit = useRef(false)
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    if (initialNodeId) {
      (async () => {
        setLoading(true)
        try {
          const res = await fetch(`/api/lineage?node_id=${initialNodeId}`)
          const data = await res.json()
          const path: { selectedId: string; nodes: LineageNode[] }[] = data.path ?? []
          if (path.length > 0) {
            const rebuilt = path.map(lvl => ({
              nodes: lvl.nodes,
              selected: lvl.selectedId,
              selectedName: lvl.nodes.find(n => n.id === lvl.selectedId)?.name ?? '',
            }))
            setLevels(rebuilt)
            onSelect(initialNodeId, rebuilt.map(l => l.selectedName))
            setLoading(false)
            return
          }
        } catch { /* ignore */ }
        loadLevel(null, 0)
      })()
    } else {
      loadLevel(null, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSelect = async (levelIdx: number, node: LineageNode) => {
    const currentPath = levels.slice(0, levelIdx).map(l => l.selectedName).concat(node.name)
    setLevels(prev =>
      prev.slice(0, levelIdx + 1).map((l, i) =>
        i === levelIdx ? { ...l, selected: node.id, selectedName: node.name } : l
      )
    )
    setLoading(true)
    try {
      const res = await fetch(`/api/lineage?parent_id=${node.id}`)
      const data = await res.json()
      const children: LineageNode[] = data.nodes ?? []
      setLevels(prev => {
        const next = prev.slice(0, levelIdx + 1)
        if (children.length > 0) {
          next.push({ nodes: children, selected: null, selectedName: '' })
          onSelect('', currentPath)
        } else {
          onSelect(node.id, currentPath)
        }
        return next
      })
    } catch {
      onSelect(node.id, currentPath)
    }
    setLoading(false)
  }

  if (levels.length === 0 && loading) {
    return <div className="text-sm text-slate-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" />טוען...</div>
  }

  return (
    <div className="flex flex-col gap-3">
      {levels.map((level, idx) => (
        <div key={idx}>
          <p className="text-xs font-medium text-slate-500 mb-1.5">
            {idx === 0 ? 'דור ראשון:' : `המשך דור ${idx + 1}:`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {level.nodes.map(node => (
              <button
                key={node.id}
                type="button"
                onClick={() => handleSelect(idx, node)}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  level.selected === node.id
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
                }`}
              >
                {node.name}
              </button>
            ))}
            {loading && idx === levels.length - 1 && (
              <Loader2 size={14} className="animate-spin text-slate-400 self-center" />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function Section({ title, icon: Icon, children }: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-indigo-500" />
        <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Field({ label, required, error, children }: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-slate-600">
        {label}{required && <span className="text-red-500 mr-1">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

function FInput({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400 w-full ${className}`}
      {...props}
    />
  )
}

// Reusable ID / passport selector + matching input
function DocTypeField({
  label,
  required,
  docType,
  value,
  error,
  onDocType,
  onValue,
  onBlur,
  checking,
}: {
  label: string
  required?: boolean
  docType: 'id' | 'passport'
  value: string
  error?: string
  onDocType: (t: 'id' | 'passport') => void
  onValue: (v: string) => void
  onBlur?: () => void
  checking?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-slate-600">
        {label}{required && <span className="text-red-500 mr-1">*</span>}
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onDocType('id')}
          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
            docType === 'id'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
          }`}
        >
          תעודת זהות
        </button>
        <button
          type="button"
          onClick={() => onDocType('passport')}
          className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
            docType === 'passport'
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
          }`}
        >
          דרכון
        </button>
      </div>
      <FInput
        value={value}
        onChange={e => onValue(e.target.value)}
        onBlur={onBlur}
        placeholder={docType === 'id' ? '123456789' : 'מספר דרכון'}
        dir="ltr"
        inputMode={docType === 'id' ? 'numeric' : 'text'}
        maxLength={docType === 'id' ? 9 : 20}
        required={required}
      />
      {checking && <p className="text-xs text-slate-400">בודק אם תעודת הזהות כבר קיימת...</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

interface FormState {
  family_name: string
  id_number: string
  id_doc_type: 'id' | 'passport'
  full_name: string
  phone: string
  phone2: string
  email: string
  address: string
  city: string
  birth_date: string
  gender: string
  marital_status: string
  spouse_name: string
  spouse_id_number: string
  spouse_doc_type: 'id' | 'passport'
  spouse_birth_date: string
  children_count: string
  notes: string
  lineage_node_id: string
  eligibility_status: string
}

interface Props {
  defaultValues?: Partial<FormState & { lineage_node_id: string; children: ChildEntry[]; lineage_manual: string[] }>
  beneficiaryId?: string
}

export default function BeneficiaryForm({ defaultValues, beneficiaryId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const isEdit = !!beneficiaryId

  const [form, setForm] = useState<FormState>({
    family_name: defaultValues?.family_name ?? '',
    id_number: defaultValues?.id_number ?? '',
    id_doc_type: defaultValues?.id_doc_type ?? 'id',
    full_name: defaultValues?.full_name ?? '',
    phone: defaultValues?.phone ?? '',
    phone2: defaultValues?.phone2 ?? '',
    email: defaultValues?.email ?? '',
    address: defaultValues?.address ?? '',
    city: defaultValues?.city ?? '',
    birth_date: defaultValues?.birth_date ?? '',
    gender: defaultValues?.gender ?? '',
    marital_status: defaultValues?.marital_status ?? '',
    spouse_name: defaultValues?.spouse_name ?? '',
    spouse_id_number: defaultValues?.spouse_id_number ?? '',
    spouse_doc_type: defaultValues?.spouse_doc_type ?? 'id',
    spouse_birth_date: defaultValues?.spouse_birth_date ?? '',
    children_count: String(defaultValues?.children_count ?? '0'),
    notes: defaultValues?.notes ?? '',
    lineage_node_id: defaultValues?.lineage_node_id ?? '',
    eligibility_status: defaultValues?.eligibility_status ?? 'pending',
  })
  const [lineagePath, setLineagePath] = useState<string[]>([])
  // Manual generations beyond the tree (דור 5 ומעלה) — free text the user adds himself
  const [manualLineage, setManualLineage] = useState<string[]>(
    Array.isArray(defaultValues?.lineage_manual) ? defaultValues!.lineage_manual : []
  )
  const [children, setChildren] = useState<ChildEntry[]>(
    Array.isArray(defaultValues?.children) ? defaultValues!.children : []
  )
  const [childErrors, setChildErrors] = useState<Partial<Record<keyof ChildEntry, string>>[]>([])
  const [checkingId, setCheckingId] = useState(false)
  // חלונית הצלחה לאחר שמירה (נסגרת אוטומטית אחרי 3 שניות)
  const [savedInfo, setSavedInfo] = useState<{ name: string; details: string[] } | null>(null)

  // בדיקת כפילות תעודת זהות בזמן אמת (כשעוזבים את השדה)
  const checkDuplicateId = useCallback(async () => {
    const raw = form.id_number.trim()
    if (!raw) return
    const normalized = form.id_doc_type === 'id' ? raw.replace(/\D/g, '') : raw
    if (!normalized) return
    setCheckingId(true)
    try {
      let q = supabase.from('beneficiaries').select('id, full_name, family_name').eq('id_number', normalized)
      if (isEdit && beneficiaryId) q = q.neq('id', beneficiaryId)
      const { data } = await q.maybeSingle()
      if (data) {
        const who = [data.family_name, data.full_name].filter(Boolean).join(' ')
        setErrors(prev => ({ ...prev, id_number: `תעודת זהות זו כבר קיימת במערכת${who ? ` (${who})` : ''} — לא ניתן לרשום אותה שוב` }))
      } else {
        setErrors(prev => {
          if (!prev.id_number?.includes('כבר קיימת')) return prev
          const next = { ...prev }; delete next.id_number; return next
        })
      }
    } catch { /* שגיאת רשת — נבדוק שוב בשמירה */ }
    setCheckingId(false)
  }, [form.id_number, form.id_doc_type, isEdit, beneficiaryId, supabase])

  const set = (k: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const handleChildrenCount = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setForm(f => ({ ...f, children_count: raw }))
    const n = Math.max(0, Math.min(30, parseInt(raw) || 0))
    setChildren(prev => {
      const next = prev.slice(0, n)
      while (next.length < n) next.push(emptyChild())
      return next
    })
  }

  const setChild = <K extends keyof ChildEntry>(idx: number, key: K, value: ChildEntry[K]) =>
    setChildren(prev => prev.map((c, i) => (i === idx ? { ...c, [key]: value } : c)))

  // אישור לידה מתוך עריכת המשפחה — מסנכרן את תיק היולדת ל"מאושר" ומסמן את הילד
  const [approvingIdx, setApprovingIdx] = useState<number | null>(null)
  const approveBirth = async (idx: number) => {
    const child = children[idx]
    if (!child.maternity_aid_id) return
    setApprovingIdx(idx)
    try {
      const { error } = await supabase.from('maternity_aids').update({ status: 'active' }).eq('id', child.maternity_aid_id)
      if (error) throw error
      setChild(idx, 'birth_status', 'approved')
    } catch (e) {
      alert(`שגיאה באישור הלידה: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setApprovingIdx(null)
    }
  }

  // Derived flags
  const hasMaritalStatus = !!form.marital_status              // personal details appear only after a status is chosen
  const primaryIsWife = WIFE_PRIMARY_STATUSES.includes(form.marital_status)
  const primaryGender = primaryIsWife ? 'female' : 'male'
  const showWifeFields = form.marital_status === MARRIED_STATUS  // spouse data exists only when married
  const showHusbandSection = hasMaritalStatus && !primaryIsWife        // גרוש, אלמן, נשואים
  const showWifeSection = hasMaritalStatus && (primaryIsWife || showWifeFields) // גרושה, אלמנה, נשואים

  const validate = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {}

    if (!form.marital_status) errs.marital_status = 'יש לבחור מצב משפחתי'

    if (!form.family_name.trim()) errs.family_name = 'שדה חובה'

    if (!form.id_number.trim()) errs.id_number = 'שדה חובה'
    else if (form.id_doc_type === 'id' && !validateIsraeliId(form.id_number)) {
      errs.id_number = 'תעודת זהות ישראלית לא תקינה (כולל ספרת ביקורת)'
    }

    if (!form.full_name.trim()) errs.full_name = 'שדה חובה'
    if (!form.birth_date) errs.birth_date = 'שדה חובה'

    if (showWifeFields) {
      if (!form.spouse_name.trim()) errs.spouse_name = 'שדה חובה'
      if (!form.spouse_id_number.trim()) errs.spouse_id_number = 'שדה חובה'
      else if (form.spouse_doc_type === 'id' && !validateIsraeliId(form.spouse_id_number)) {
        errs.spouse_id_number = 'תעודת זהות ישראלית לא תקינה (כולל ספרת ביקורת)'
      }
      if (!form.spouse_birth_date) errs.spouse_birth_date = 'שדה חובה'
    }

    if (!form.phone.trim()) errs.phone = 'שדה חובה'
    if (!form.email.trim()) errs.email = 'שדה חובה'
    else if (!EMAIL_REGEX.test(form.email.trim())) errs.email = 'אימייל לא תקין'

    if (!form.address.trim()) errs.address = 'שדה חובה'
    if (!form.city.trim()) errs.city = 'שדה חובה'

    if (!form.lineage_node_id) errs.lineage_node_id = 'יש לבחור שיוך שושלת'

    const childErrs: Partial<Record<keyof ChildEntry, string>>[] = children.map(c => {
      const ce: Partial<Record<keyof ChildEntry, string>> = {}
      if (!c.name.trim()) ce.name = 'שדה חובה'
      if (!c.gender) ce.gender = 'שדה חובה'
      if (!c.marital_status) ce.marital_status = 'שדה חובה'
      if (!c.birth_date) ce.birth_date = 'שדה חובה'
      if (c.id_number.trim() && c.doc_type === 'id' && !validateIsraeliId(c.id_number)) {
        ce.id_number = 'תעודת זהות ישראלית לא תקינה (כולל ספרת ביקורת)'
      }
      return ce
    })
    setChildErrors(childErrs)
    const hasChildErrors = childErrs.some(ce => Object.keys(ce).length > 0)

    setErrors(errs)
    return Object.keys(errs).length === 0 && !hasChildErrors
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      const normalizedId = form.id_doc_type === 'id' ? form.id_number.replace(/\D/g, '') : form.id_number.trim()

      // בדיקת כפילות תעודת זהות — לא ניתן לרשום ת.ז. שכבר קיימת בכרטסת אחרת
      let dupQuery = supabase.from('beneficiaries').select('id').eq('id_number', normalizedId)
      if (isEdit && beneficiaryId) dupQuery = dupQuery.neq('id', beneficiaryId)
      const { data: dup } = await dupQuery.maybeSingle()
      if (dup) {
        setErrors(prev => ({ ...prev, id_number: 'תעודת זהות זו כבר קיימת במערכת — לא ניתן לרשום אותה שוב' }))
        setSaving(false)
        window.scrollTo({ top: 0, behavior: 'smooth' })
        return
      }

      const payload = {
        family_name: form.family_name.trim(),
        id_number: normalizedId,
        id_doc_type: form.id_doc_type,
        full_name: form.full_name.trim(),
        phone: form.phone || null,
        phone2: form.phone2 || null,
        email: form.email || null,
        address: form.address || null,
        city: form.city || null,
        birth_date: form.birth_date || null,
        gender: primaryGender,
        marital_status: form.marital_status || null,
        spouse_name: showWifeFields ? (form.spouse_name || null) : null,
        spouse_id_number: showWifeFields
          ? ((form.spouse_doc_type === 'id' ? form.spouse_id_number.replace(/\D/g, '') : form.spouse_id_number.trim()) || null)
          : null,
        spouse_doc_type: showWifeFields ? form.spouse_doc_type : null,
        spouse_birth_date: showWifeFields ? (form.spouse_birth_date || null) : null,
        children_count: children.length,
        children: children.map(c => ({
          name: c.name.trim(),
          id_number: c.id_number.trim()
            ? (c.doc_type === 'id' ? c.id_number.replace(/\D/g, '') : c.id_number.trim())
            : null,
          doc_type: c.doc_type,
          gender: c.gender || null,
          birth_date: c.birth_date || null,
          marital_status: c.marital_status || null,
          // שמירת סימוני תיק היולדת אם קיימים (כדי לא לאבד אותם בעריכה)
          ...(c.birth_status ? { birth_status: c.birth_status } : {}),
          ...(c.maternity_aid_id ? { maternity_aid_id: c.maternity_aid_id } : {}),
        })),
        notes: form.notes || null,
        lineage_node_id: form.lineage_node_id || null,
        lineage_manual: manualLineage.map(s => s.trim()).filter(Boolean),
        eligibility_status: form.eligibility_status || 'pending',
        updated_at: new Date().toISOString(),
      }

      const familyName = [payload.family_name, payload.spouse_name || payload.full_name].filter(Boolean).join(' ')
      const details = [
        `ת.ז. ${payload.id_number}`,
        payload.phone ? `טלפון ${payload.phone}` : '',
        payload.city ? `עיר ${payload.city}` : '',
        `${children.length} ילדים`,
      ].filter(Boolean)

      let targetId = beneficiaryId
      if (isEdit) {
        const { error } = await supabase.from('beneficiaries').update(payload).eq('id', beneficiaryId)
        if (error) throw error
      } else {
        const { data: inserted, error } = await supabase
          .from('beneficiaries')
          .insert(payload)
          .select()
          .single()
        if (error) throw error
        targetId = inserted.id
      }

      // חלונית "נשמר בהצלחה" — מציגה את הפרטים ל-3 שניות ואז נסגרת ומנווטת
      setSavedInfo({ name: familyName, details })
      setTimeout(() => {
        router.push(`/admin/beneficiaries/${targetId}`)
        router.refresh()
      }, 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      alert(`שגיאה בשמירה: ${msg}`)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">

      {/* ── Success modal (auto-closes after 3s) ── */}
      {savedInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-7 w-full max-w-sm mx-4 text-center">
            <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={30} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">השינויים נשמרו בהצלחה</h3>
            <p className="text-sm text-slate-500 mt-1">למשפחת {savedInfo.name}</p>
            {savedInfo.details.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {savedInfo.details.map((d, i) => (
                  <span key={i} className="text-xs text-slate-600 bg-slate-100 rounded-full px-2.5 py-1">{d}</span>
                ))}
              </div>
            )}
            <div className="mt-5 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 animate-[shrink_3s_linear_forwards]" />
            </div>
          </div>
        </div>
      )}

      {/* ── Registration status ── */}
      <Section title="סטטוס רישום" icon={FileText}>
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setForm(f => ({ ...f, eligibility_status: opt.value }))}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                form.eligibility_status === opt.value ? opt.sel : `bg-white ${opt.unsel}`
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </Section>

      {/* ── Marital status ── */}
      <Section title="מצב משפחתי" icon={Heart}>
        <div className="flex flex-wrap gap-2">
          {MARITAL_OPTIONS.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => setForm(f => ({ ...f, marital_status: opt }))}
              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                form.marital_status === opt
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
        {errors.marital_status && <p className="text-xs text-red-500 mt-2">{errors.marital_status}</p>}
      </Section>

      {/* ── Husband section ── */}
      {showHusbandSection && (
        <Section title="פרטי הבעל" icon={User}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="שם משפחה" required error={errors.family_name}>
              <FInput value={form.family_name} onChange={set('family_name')} placeholder="שם משפחה" required />
            </Field>
            <Field label="שם הבעל (שם פרטי)" required error={errors.full_name}>
              <FInput value={form.full_name} onChange={set('full_name')} placeholder="שם פרטי" required />
            </Field>
            <DocTypeField
              label="מסמך זיהוי"
              required
              docType={form.id_doc_type}
              value={form.id_number}
              error={errors.id_number}
              checking={checkingId}
              onBlur={checkDuplicateId}
              onDocType={t => setForm(f => ({ ...f, id_doc_type: t }))}
              onValue={v => setForm(f => ({ ...f, id_number: v }))}
            />
            <Field label="תאריך לידה" required error={errors.birth_date}>
              <FInput type="date" value={form.birth_date} onChange={set('birth_date')} dir="ltr" required />
            </Field>
            <Field label="מספר ילדים" required>
              <FInput type="number" min="0" max="30" value={form.children_count} onChange={handleChildrenCount} required />
            </Field>
          </div>
        </Section>
      )}

      {/* ── Wife section ── */}
      {showWifeSection && (
        <Section title="פרטי האישה" icon={Heart}>
          {primaryIsWife ? (
            /* Woman is primary person (גרושה / אלמנה) */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="שם משפחה" required error={errors.family_name}>
                <FInput value={form.family_name} onChange={set('family_name')} placeholder="שם משפחה" required />
              </Field>
              <Field label="שם האישה (שם פרטי)" required error={errors.full_name}>
                <FInput value={form.full_name} onChange={set('full_name')} placeholder="שם פרטי" required />
              </Field>
              <DocTypeField
                label="מסמך זיהוי"
                required
                docType={form.id_doc_type}
                value={form.id_number}
                error={errors.id_number}
                checking={checkingId}
                onBlur={checkDuplicateId}
                onDocType={t => setForm(f => ({ ...f, id_doc_type: t }))}
                onValue={v => setForm(f => ({ ...f, id_number: v }))}
              />
              <Field label="תאריך לידה" required error={errors.birth_date}>
                <FInput type="date" value={form.birth_date} onChange={set('birth_date')} dir="ltr" required />
              </Field>
              <Field label="מספר ילדים" required>
                <FInput type="number" min="0" max="30" value={form.children_count} onChange={handleChildrenCount} required />
              </Field>
            </div>
          ) : (
            /* Woman is spouse (נשואים) */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="שם האישה" required error={errors.spouse_name}>
                <FInput value={form.spouse_name} onChange={set('spouse_name')} placeholder="שם מלא" required />
              </Field>
              <DocTypeField
                label="מסמך זיהוי האישה"
                required
                docType={form.spouse_doc_type}
                value={form.spouse_id_number}
                error={errors.spouse_id_number}
                onDocType={t => setForm(f => ({ ...f, spouse_doc_type: t }))}
                onValue={v => setForm(f => ({ ...f, spouse_id_number: v }))}
              />
              <Field label="תאריך לידה האישה" required error={errors.spouse_birth_date}>
                <FInput type="date" value={form.spouse_birth_date} onChange={set('spouse_birth_date')} dir="ltr" required />
              </Field>
            </div>
          )}
        </Section>
      )}

      {/* ── Children details ── */}
      {children.length > 0 && (
        <Section title={`פרטי הילדים (${children.length})`} icon={Users}>
          <div className="flex flex-col gap-4">
            {children.map((child, idx) => (
              <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-xs font-semibold text-indigo-600">ילד/ה {idx + 1}</p>
                  {child.birth_status === 'approved' && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">לידה מאושרת</span>
                  )}
                  {child.birth_status === 'pending' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">ממתין לאישור לידה</span>
                      <button type="button" onClick={() => approveBirth(idx)} disabled={approvingIdx === idx}
                        className="inline-flex items-center gap-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 px-2.5 py-1 rounded-lg transition-colors">
                        {approvingIdx === idx ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} אשר לידה
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="שם הילד/ה" required error={childErrors[idx]?.name}>
                    <FInput
                      value={child.name}
                      onChange={e => setChild(idx, 'name', e.target.value)}
                      placeholder="שם מלא"
                      required
                    />
                  </Field>
                  <Field label="מין" required error={childErrors[idx]?.gender}>
                    <select
                      value={child.gender}
                      onChange={e => { setChild(idx, 'gender', e.target.value); setChild(idx, 'marital_status', '') }}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full"
                      required
                    >
                      <option value="">בחר...</option>
                      <option value="male">בן</option>
                      <option value="female">בת</option>
                    </select>
                  </Field>
                  <Field label="תאריך לידה" required error={childErrors[idx]?.birth_date}>
                    <FInput
                      type="date"
                      value={child.birth_date}
                      onChange={e => setChild(idx, 'birth_date', e.target.value)}
                      dir="ltr"
                      required
                    />
                  </Field>
                  <Field label="סטטוס" required error={childErrors[idx]?.marital_status}>
                    <select
                      value={child.marital_status}
                      onChange={e => setChild(idx, 'marital_status', e.target.value)}
                      disabled={!child.gender}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full disabled:bg-slate-100 disabled:text-slate-400"
                      required
                    >
                      <option value="">{child.gender ? 'בחר...' : 'בחר מין תחילה'}</option>
                      {maritalOptionsFor(child.gender).map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">
                      מסמך זיהוי <span className="font-normal text-slate-400">(לא חובה)</span>
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setChild(idx, 'doc_type', 'id')}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                          child.doc_type === 'id'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
                        }`}
                      >
                        ת&quot;ז
                      </button>
                      <button
                        type="button"
                        onClick={() => setChild(idx, 'doc_type', 'passport')}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                          child.doc_type === 'passport'
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
                        }`}
                      >
                        דרכון
                      </button>
                    </div>
                    <FInput
                      value={child.id_number}
                      onChange={e => setChild(idx, 'id_number', e.target.value)}
                      placeholder={child.doc_type === 'id' ? '123456789' : 'מספר דרכון'}
                      dir="ltr"
                      inputMode={child.doc_type === 'id' ? 'numeric' : 'text'}
                      maxLength={child.doc_type === 'id' ? 9 : 20}
                    />
                    {childErrors[idx]?.id_number && (
                      <p className="text-xs text-red-500">{childErrors[idx].id_number}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Contact ── */}
      <Section title="פרטי קשר" icon={Phone}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="טלפון ראשי" required error={errors.phone}>
            <FInput type="tel" value={form.phone} onChange={set('phone')} placeholder="050-0000000" dir="ltr" required />
          </Field>
          <Field label="טלפון נוסף">
            <FInput type="tel" value={form.phone2} onChange={set('phone2')} placeholder="050-0000000" dir="ltr" />
          </Field>
          <Field label="אימייל" required error={errors.email}>
            <FInput type="email" value={form.email} onChange={set('email')} placeholder="name@example.com" dir="ltr" required />
          </Field>
        </div>
      </Section>

      {/* ── Address ── */}
      <Section title="כתובת" icon={MapPin}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="רחוב ומספר" required error={errors.address}>
            <FInput value={form.address} onChange={set('address')} placeholder="הרב קוק 12" required />
          </Field>
          <Field label="עיר" required error={errors.city}>
            <FInput value={form.city} onChange={set('city')} placeholder="בני ברק" required />
          </Field>
        </div>
      </Section>

      {/* ── Lineage ── */}
      <Section title="שיוך שושלת *" icon={GitBranch}>
        <p className="text-xs text-slate-500 mb-3">
          בחר את הענף שהנתמך שייך אליו. לחץ על שם ואז המשך לבחור את הדור הבא.
        </p>
        {errors.lineage_node_id && (
          <p className="text-xs text-red-500 mb-3">{errors.lineage_node_id}</p>
        )}

        {(form.lineage_node_id || lineagePath.length > 0) && (
          <div className="flex items-center gap-1 flex-wrap mb-3 p-2.5 bg-indigo-50 rounded-lg border border-indigo-100">
            <span className="text-xs text-indigo-600 font-medium ml-1">נבחר:</span>
            {lineagePath.map((name, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronLeft size={11} className="text-indigo-300" />}
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  i === lineagePath.length - 1
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'bg-indigo-100 text-indigo-700'
                }`}>
                  {name}
                </span>
              </span>
            ))}
          </div>
        )}

        <LineageCascade
          initialNodeId={form.lineage_node_id}
          onSelect={(nodeId, path) => {
            setForm(f => ({ ...f, lineage_node_id: nodeId }))
            setLineagePath(path)
          }}
        />

        {form.lineage_node_id && (
          <button
            type="button"
            onClick={() => { setForm(f => ({ ...f, lineage_node_id: '' })); setLineagePath([]); setManualLineage([]) }}
            className="mt-2 text-xs text-slate-400 hover:text-slate-600 underline"
          >
            נקה בחירה
          </button>
        )}

        {/* Manual generations (דור 5 ומעלה) — appear after a branch is fully selected */}
        {form.lineage_node_id && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-600 mb-1">
              המשך דורות (דור {lineagePath.length + 1} ומעלה)
            </p>
            <p className="text-xs text-slate-400 mb-3">
              אם הנתמך שייך לדור שאינו ברשימה, הוסף כאן את שמות הדורות הבאים ידנית.
            </p>

            <div className="flex flex-col gap-2">
              {manualLineage.map((val, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-14 flex-shrink-0">
                    דור {lineagePath.length + 1 + idx}
                  </span>
                  <FInput
                    value={val}
                    onChange={e =>
                      setManualLineage(prev => prev.map((v, i) => (i === idx ? e.target.value : v)))
                    }
                    placeholder="שם"
                  />
                  <button
                    type="button"
                    onClick={() => setManualLineage(prev => prev.filter((_, i) => i !== idx))}
                    className="text-slate-300 hover:text-red-500 flex-shrink-0"
                    aria-label="הסר דור"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setManualLineage(prev => [...prev, ''])}
              className="mt-3 flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 rounded-lg px-3 py-1.5 transition-colors"
            >
              <Plus size={14} />
              הוסף דור {lineagePath.length + 1 + manualLineage.length}
            </button>
          </div>
        )}
      </Section>

      {/* ── Notes ── */}
      <Section title="הערות" icon={FileText}>
        <textarea
          value={form.notes}
          onChange={set('notes')}
          rows={3}
          placeholder="הערות נוספות..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </Section>

      {Object.keys(errors).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          יש שדות חובה שלא מולאו או שאינם תקינים. אנא בדוק את השדות המסומנים באדום.
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <Button type="button" variant="secondary" onClick={() => router.back()}>ביטול</Button>
        <Button type="submit" loading={saving}>
          {isEdit ? 'שמור שינויים' : 'רישום נתמך'}
        </Button>
      </div>
    </form>
  )
}
