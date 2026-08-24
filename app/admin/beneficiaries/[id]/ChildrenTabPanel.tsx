'use client'

// טאב "ילדים" בכרטסת — תצוגה + עריכה במקום.
//
// ⚠️ העריכה משתמשת באותו ChildrenEditor של טופס העריכה המלא, ובאותו
// lib/childrenEditor לנרמול — שני מסלולי השמירה חייבים להסכים.
//
// ⚠️ נערכים רק הילדים ה*רשומים* (beneficiary.children). הטבלה מציגה גם
// ילדים ממוזגים מבקשות לידה שטרם נרשמו בכרטסת; שמירה שהייתה כוללת אותם
// הייתה "מרשמת" תינוק שעדיין ממתין לאישור.

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Loader2, Pencil, Save, Users, X } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useCan } from '@/components/StaffPermissions'
import ChildrenEditor from '@/components/admin/ChildrenEditor'
import ChildrenTable, { type KidRow } from './ChildrenTable'
import { diffChildren, type EditableChild } from '@/lib/childrenEditor'

interface Props {
  beneficiaryId: string
  rows: KidRow[]
  /** הילדים הרשומים בלבד — מה שנשמר בפועל */
  registered: EditableChild[]
  /** כמה ילדים מוצגים בסך הכול (כולל ממתינים מבקשות לידה) */
  totalShown: number
  summary: React.ReactNode
}

export default function ChildrenTabPanel({ beneficiaryId, rows, registered, totalShown, summary }: Props) {
  const router = useRouter()
  const toast = useToast()
  const canEdit = useCan('beneficiaries', 'edit')

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<EditableChild[]>(registered)
  const [aidsToDelete, setAidsToDelete] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const diff = diffChildren(registered, draft)
  const dirty = diff.hasChanges || aidsToDelete.length > 0

  // אזהרה ביציאה מהדף עם שינוי שלא נשמר
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const startEdit = () => { setDraft(registered); setAidsToDelete([]); setEditing(true) }

  const cancel = () => {
    if (dirty && !confirm('יש שינויים שלא נשמרו. לצאת מהעריכה?')) return
    setDraft(registered); setAidsToDelete([]); setEditing(false)
  }

  const save = async () => {
    // ⚠️ נחסמים רק ילדים *חדשים* בלי שם. במאגר יש עשרות ילדים ותיקים
    // שנשמרו בלי שם, וחסימה גורפת הייתה מונעת כל עריכה במשפחות שלהם.
    const newBlank = draft.findIndex((c, i) => !c.name.trim() && i >= registered.length)
    if (newBlank >= 0) { toast.error(`חסר שם לילד/ה ${newBlank + 1}`); return }

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/beneficiaries/${beneficiaryId}/children`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ children: draft, maternityAidIdsToDelete: aidsToDelete }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'שמירה נכשלה')

      const extra = json.maternityAidsDeleted?.length ? ` · ${json.maternityAidsDeleted.length} תיקי לידה נמחקו` : ''
      toast.success(`נשמרו ${json.children_count} ילדים${extra}`)
      setAidsToDelete([])
      setEditing(false)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-emerald-500" />
          <h2 className="text-xs font-semibold uppercase text-slate-500">
            ילדים ({editing ? draft.length : totalShown})
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!editing && summary}

          {canEdit && !editing && (
            <button
              onClick={startEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 transition-colors"
            >
              <Pencil size={13} /> עריכה
            </button>
          )}

          {editing && (
            <>
              <button
                onClick={cancel}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                <X size={13} /> ביטול
              </button>
              {/* הכפתור מהבהב כל עוד יש שינוי שלא נשמר */}
              <button
                onClick={save}
                disabled={!dirty || saving}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors ${
                  dirty
                    ? 'bg-green-600 hover:bg-green-700 animate-pulse shadow-lg shadow-green-600/30 ring-2 ring-green-400/50'
                    : 'bg-slate-300 cursor-not-allowed'
                }`}
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {saving ? 'שומר…' : dirty ? `שמור שינויים (${diff.changeCount + aidsToDelete.length})` : 'אין שינויים'}
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="p-4">
          {totalShown > registered.length && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {totalShown - registered.length} ילדים מבקשות לידה שטרם נרשמו בכרטסת אינם ניתנים לעריכה כאן —
              יש לאשר את הלידה תחילה.
            </p>
          )}
          <ChildrenEditor
            items={draft}
            onChange={setDraft}
            disabled={saving}
            onMaternityDeleteQueued={ids => setAidsToDelete(prev => Array.from(new Set([...prev, ...ids])))}
          />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">לא נרשמו ילדים</p>
      ) : (
        <ChildrenTable kids={rows} />
      )}
    </div>
  )
}
