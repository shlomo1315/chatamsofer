'use client'
import { useState } from 'react'
import { Baby, CheckCircle2, Loader2, Plus, Trash2, Users } from 'lucide-react'
import HebrewDatePicker from '@/components/ui/HebrewDatePicker'
import ChildrenDeleteDialog, { type DeleteDecision } from './ChildrenDeleteDialog'
import {
  emptyChild,
  isLinkedToMaternity,
  MAX_CHILDREN,
  removeChildrenAt,
  resizeChildren,
  docTypeOf,
  type DocType,
  type EditableChild,
} from '@/lib/childrenEditor'

// עורך רשימת הילדים — משותף לטופס העריכה המלא ולעריכה מתוך הכרטסת.
// הרכיב מחזיק *רק* את מצב העריכה; השמירה היא באחריות ההורה, כך שאותו
// עורך משרת שני מסלולי שמירה שונים בלי לשכפל את הלוגיקה.

const GENDER_SEL: Record<string, string> = {
  male: 'bg-blue-600 text-white border-blue-600',
  female: 'bg-pink-600 text-white border-pink-600',
}
const GENDER_UNSEL = 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'

function maritalOptionsFor(gender: string): { value: string; label: string }[] {
  if (gender === 'male') return [{ value: 'married', label: 'נשוי' }, { value: 'single', label: 'לא נשוי' }]
  if (gender === 'female') return [{ value: 'married', label: 'נשואה' }, { value: 'single', label: 'לא נשואה' }]
  return []
}

export function CInput({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent placeholder:text-slate-400 w-full ${className}`}
      {...props}
    />
  )
}

function CField({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode
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

export interface ChildFieldErrors {
  name?: string; gender?: string; birth_date?: string; marital_status?: string; id_number?: string
}

interface Props {
  items: EditableChild[]
  onChange: (next: EditableChild[]) => void
  errors?: ChildFieldErrors[]
  // מנקה שגיאת שדה בעת הקלדה (הטופס מנהל שגיאות משלו)
  onClearError?: (idx: number, field: keyof ChildFieldErrors) => void
  // אישור לידה מתוך העריכה — קיים רק בטופס המלא
  onApproveBirth?: (idx: number) => void
  approvingIdx?: number | null
  // ולידציית ת"ז בעת יציאה מהשדה
  onIdBlur?: (idx: number) => void
  // נמסר להורה כדי שידע אילו תיקי לידה למחוק בשמירה
  onMaternityDeleteQueued?: (aidIds: string[]) => void
  disabled?: boolean
}

export default function ChildrenEditor({
  items, onChange, errors = [], onClearError, onApproveBirth, approvingIdx = null,
  onIdBlur, onMaternityDeleteQueued, disabled = false,
}: Props) {
  // הערך המוקלד בשדה "מספר ילדים". נשמר בנפרד מהרשימה כדי לאפשר מחיקת
  // הספרה בזמן הקלדה בלי לאפס את הרשימה.
  const [countInput, setCountInput] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ required: number | null; preset: number | null } | null>(null)

  const setChild = <K extends keyof EditableChild>(idx: number, key: K, value: EditableChild[K]) =>
    onChange(items.map((c, i) => (i === idx ? { ...c, [key]: value } : c)))

  // ⚠️ כותב למפתח שכבר קיים ברשומה (id_doc_type הוותיק או doc_type החדש).
  // כתיבה תמידית ל-doc_type הייתה משאירה שני שדות סותרים באותה רשומה.
  const setDocType = (idx: number, v: DocType) =>
    onChange(items.map((c, i) => {
      if (i !== idx) return c
      return c.id_doc_type !== undefined && c.doc_type === undefined
        ? { ...c, id_doc_type: v }
        : { ...c, doc_type: v }
    }))

  const handleCount = (raw: string) => {
    setCountInput(raw)
    if (raw.trim() === '') return
    const n = parseInt(raw, 10)
    if (!Number.isFinite(n)) return
    const res = resizeChildren(items, n)
    // 🔴 הפחתה אינה מוחקת מעצמה — נפתח דיאלוג בחירה. אחרת נמחקים
    // בשקט הילדים האחרונים ברשימה, על כל פרטיהם.
    if (res.needsRemoval > 0) setDialog({ required: res.needsRemoval, preset: null })
    else onChange(res.children)
  }

  const applyDelete = (d: DeleteDecision) => {
    onChange(removeChildrenAt(items, d.indexes))
    if (d.maternityAidIdsToDelete.length) onMaternityDeleteQueued?.(d.maternityAidIdsToDelete)
    setDialog(null)
    setCountInput(null)
  }

  const addChild = () => {
    if (items.length >= MAX_CHILDREN) return
    onChange([...items, emptyChild()])
    setCountInput(null)
  }

  const countValue = countInput ?? String(items.length)

  return (
    <div className="flex flex-col gap-4">
      {/* ── שורת הבקרה: מספר ילדים + הוספה ── */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="w-40">
          <CField label="מספר ילדים">
            <CInput
              type="number" min="0" max={MAX_CHILDREN}
              value={countValue}
              disabled={disabled}
              onChange={e => handleCount(e.target.value)}
              onBlur={() => setCountInput(null)}
            />
          </CField>
        </div>
        <p className="flex-1 text-xs text-slate-500">
          הפחתת המספר תפתח בחירה של מי למחוק — אף ילד לא נמחק מעצמו.
        </p>
        <button
          type="button" onClick={addChild}
          disabled={disabled || items.length >= MAX_CHILDREN}
          className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 transition-colors"
        >
          <Plus size={15} /> הוסף ילד/ה
        </button>
      </div>

      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 py-8 text-center">
          <Users size={22} className="mx-auto mb-2 text-slate-300" />
          <p className="text-sm text-slate-400">לא נרשמו ילדים</p>
        </div>
      )}

      {items.map((child, idx) => (
        <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-indigo-600">ילד/ה {idx + 1}</p>
            <div className="flex items-center gap-2">
              {child.birth_status === 'approved' && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">לידה מאושרת</span>
              )}
              {child.birth_status === 'pending' && (
                <>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">ממתין לאישור לידה</span>
                  {onApproveBirth && child.maternity_aid_id && (
                    <button type="button" onClick={() => onApproveBirth(idx)} disabled={approvingIdx === idx}
                      className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60 transition-colors">
                      {approvingIdx === idx ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} אשר לידה
                    </button>
                  )}
                </>
              )}
              {isLinkedToMaternity(child) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-700">
                  <Baby size={11} /> תיק לידה
                </span>
              )}
              <button
                type="button"
                onClick={() => setDialog({ required: null, preset: idx })}
                disabled={disabled}
                aria-label={`מחק ילד/ה ${idx + 1}`}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CField label="שם הילד/ה" required error={errors[idx]?.name}>
              <CInput
                value={child.name} disabled={disabled} placeholder="שם מלא"
                onChange={e => { setChild(idx, 'name', e.target.value); onClearError?.(idx, 'name') }}
              />
            </CField>

            <CField label="מין" required error={errors[idx]?.gender}>
              <div className="flex gap-2">
                {[{ v: 'male', l: 'בן' }, { v: 'female', l: 'בת' }].map(({ v, l }) => (
                  <button key={v} type="button" disabled={disabled}
                    onClick={() => onChange(items.map((c, i) => i === idx ? { ...c, gender: v, marital_status: '' } : c))}
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                      child.gender === v ? GENDER_SEL[v] : GENDER_UNSEL
                    }`}
                  >{l}</button>
                ))}
              </div>
            </CField>

            <CField label="תאריך לידה" required error={errors[idx]?.birth_date}>
              <HebrewDatePicker value={child.birth_date} onChange={iso => setChild(idx, 'birth_date', iso)} maxToday />
            </CField>

            {child.gender && (
              <CField label="מצב משפחתי" required error={errors[idx]?.marital_status}>
                <div className="flex gap-2">
                  {maritalOptionsFor(child.gender).map(o => (
                    <button key={o.value} type="button" disabled={disabled}
                      onClick={() => setChild(idx, 'marital_status', o.value)}
                      className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                        child.marital_status === o.value
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400'
                      }`}
                    >{o.label}</button>
                  ))}
                </div>
              </CField>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                מסמך זיהוי <span className="text-red-500 mr-1">*</span>
              </label>
              <div className="flex gap-2">
                {[{ v: 'id' as const, l: 'ת"ז' }, { v: 'passport' as const, l: 'דרכון' }].map(o => (
                  <button key={o.v} type="button" disabled={disabled}
                    onClick={() => setDocType(idx, o.v)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      docTypeOf(child) === o.v
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
                    }`}
                  >{o.l}</button>
                ))}
              </div>
              <CInput
                value={child.id_number} disabled={disabled}
                placeholder={docTypeOf(child) === 'passport' ? 'מספר דרכון' : 'ת"ז'}
                onChange={e => { setChild(idx, 'id_number', e.target.value); onClearError?.(idx, 'id_number') }}
                onBlur={() => onIdBlur?.(idx)}
              />
              {errors[idx]?.id_number && <p className="text-xs text-red-500">{errors[idx]?.id_number}</p>}
            </div>
          </div>
        </div>
      ))}

      <ChildrenDeleteDialog
        key={dialog ? `${dialog.required}-${dialog.preset}` : 'closed'}
        open={!!dialog}
        items={items}
        requiredCount={dialog?.required ?? null}
        presetIndex={dialog?.preset ?? null}
        onCancel={() => { setDialog(null); setCountInput(null) }}
        onConfirm={applyDelete}
      />
    </div>
  )
}
