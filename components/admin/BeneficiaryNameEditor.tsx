'use client'

// ─────────────────────────────────────────────────────────────────────────────
// עריכת שם המשפחה והשם הפרטי של הצאצא — מכל מחלקה.
//
// 🔴 למה זה קיים: השם שמור בטבלת beneficiaries בלבד, וניתן היה לערוך אותו
// אך ורק ממסך עריכת הצאצא. בכרטסת היולדת, בכרטסת ההלוואה ובשאר המחלקות
// השם נשלף לתצוגה בלבד — המזכירה ראתה שם שגוי מול העיניים ולא היה לה שום
// שדה לתקן בו, וגם לא חיווי שהתיקון אפשרי במקום אחר.
//
// ⚠️ עורך את אותה רשומה בדיוק (beneficiaries.full_name / family_name), ולכן
// התיקון מופיע מיד בכל המחלקות. אין כאן עותק מקומי של השם בשום טבלה.
//
// ⚠️ ההרשאה הנדרשת היא 'beneficiaries: edit' ולא הרשאת המחלקה המארחת:
// מזכירת גמ"ח שאין לה צאצאים אינה אמורה לשנות שמות דרך מסך ההלוואות.
// ה-RLS על beneficiaries מתיר לכל איש צוות, ולכן הסינון חייב להיות כאן —
// והכפתור כלל אינו מוצג למי שאינו מורשה.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  beneficiaryId: string
  familyName: string
  fullName: string
  /** נקרא אחרי שמירה מוצלחת — לרענון המסך המארח. */
  onSaved?: (next: { family_name: string; full_name: string }) => void
  /** האם למשתמש יש הרשאת עריכה לצאצאים. בלעדיה מוצג טקסט בלבד. */
  canEdit: boolean
}

export default function BeneficiaryNameEditor({
  beneficiaryId, familyName, fullName, onSaved, canEdit,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [family, setFamily] = useState(familyName)
  const [full, setFull] = useState(fullName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const display = [familyName, fullName].filter(Boolean).join(' ') || 'ללא שם'

  if (!canEdit) return <span className="font-medium text-slate-700">{display}</span>

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-medium text-slate-700">{display}</span>
        <button
          type="button"
          onClick={() => { setFamily(familyName); setFull(fullName); setError(''); setEditing(true) }}
          className="text-slate-400 hover:text-indigo-600 transition-colors"
          title="עריכת השם"
        >
          <Pencil size={14} />
        </button>
      </span>
    )
  }

  // ⚠️ שני השדות חובה — בדיוק כמו בטופס הצאצא. שמירת שם ריק הייתה יוצרת
  // כרטסת בלי שם, שאי אפשר לאתר בחיפוש ואי אפשר לזהות ברשימות.
  const save = async () => {
    const f = family.trim(), n = full.trim()
    if (!f || !n) { setError('שם משפחה ושם פרטי הם שדות חובה'); return }

    setSaving(true)
    setError('')
    try {
      const supabase = createClient()
      const { error: upErr } = await supabase.from('beneficiaries')
        .update({ family_name: f, full_name: n, updated_at: new Date().toISOString() })
        .eq('id', beneficiaryId)
      if (upErr) throw upErr
      onSaved?.({ family_name: f, full_name: n })
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'השמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <span className="inline-flex items-center gap-1.5">
        <input
          value={family}
          onChange={e => setFamily(e.target.value)}
          placeholder="שם משפחה"
          disabled={saving}
          className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
        />
        <input
          value={full}
          onChange={e => setFull(e.target.value)}
          placeholder="שם פרטי"
          disabled={saving}
          className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-slate-50"
        />
        <button
          type="button" onClick={save} disabled={saving}
          className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
          title="שמירה"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
        </button>
        <button
          type="button" onClick={() => { setEditing(false); setError('') }} disabled={saving}
          className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
          title="ביטול"
        >
          <X size={16} />
        </button>
      </span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
