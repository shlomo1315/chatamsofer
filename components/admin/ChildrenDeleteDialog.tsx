'use client'
import { useState } from 'react'
import { AlertTriangle, Baby, Trash2 } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { isLinkedToMaternity, type EditableChild } from '@/lib/childrenEditor'

// מה לעשות עם תיק היולדת של ילד שנמחק. נשאל רק כשנמחק ילד שהגיע מתיק לידה.
export type MaternityChoice = 'keep' | 'delete'

export interface DeleteDecision {
  indexes: number[]
  // תיקי הלידה שהמשתמש ביקש למחוק יחד עם הילדים
  maternityAidIdsToDelete: string[]
}

interface Props {
  open: boolean
  items: EditableChild[]
  // כמה חייבים להיבחר כדי להגיע למספר שהוקלד. null = מחיקה נקודתית
  // (כפתור הסל), ואז הבחירה כבר קבועה מראש.
  requiredCount: number | null
  // במחיקה נקודתית — האינדקס שנבחר מראש
  presetIndex?: number | null
  onCancel: () => void
  onConfirm: (decision: DeleteDecision) => void
}

function childLabel(c: EditableChild, i: number): string {
  return c.name?.trim() || `ילד/ה ${i + 1}`
}

export default function ChildrenDeleteDialog({
  open, items, requiredCount, presetIndex = null, onCancel, onConfirm,
}: Props) {
  // האתחול נעשה דרך prop key מהקורא (ChildrenEditor) — כל פתיחה מרכיבה
  // את הדיאלוג מחדש, ולכן אין צורך ב-effect שמאפס מצב.
  const [selected, setSelected] = useState<number[]>(presetIndex != null ? [presetIndex] : [])
  // בחירה לכל תיק לידה בנפרד — ילד אחד יכול להימחק עם התיק ואחר בלעדיו
  const [maternityChoice, setMaternityChoice] = useState<Record<number, MaternityChoice>>({})

  const pointMode = presetIndex != null
  const toggle = (i: number) =>
    setSelected(prev => (prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]))

  const linkedSelected = selected.filter(i => items[i] && isLinkedToMaternity(items[i]))
  // חייבים הכרעה לכל ילד שקשור לתיק לידה — לא בוחרים עבור המשתמש
  const undecided = linkedSelected.filter(i => !maternityChoice[i])
  const countOk = requiredCount == null || selected.length === requiredCount
  const canConfirm = selected.length > 0 && countOk && undecided.length === 0

  const confirm = () => {
    if (!canConfirm) return
    const aidIds = linkedSelected
      .filter(i => maternityChoice[i] === 'delete')
      .map(i => items[i].maternity_aid_id)
      .filter((x): x is string => !!x)
    onConfirm({ indexes: selected, maternityAidIdsToDelete: aidIds })
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={pointMode ? 'מחיקת ילד/ה' : `בחירת ${requiredCount} ילדים למחיקה`}
      size="md"
      footer={
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            {requiredCount != null && `נבחרו ${selected.length} מתוך ${requiredCount}`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              ביטול
            </button>
            <button
              onClick={confirm}
              disabled={!canConfirm}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Trash2 size={14} /> מחק
            </button>
          </div>
        </div>
      }
    >
      {!pointMode && (
        <p className="mb-3 text-sm text-slate-600">
          סימנת {requiredCount} ילדים פחות. בחר/י מי מהם למחוק — הפרטים שלהם יימחקו מהכרטסת.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {items.map((c, i) => {
          const linked = isLinkedToMaternity(c)
          const isSel = selected.includes(i)
          return (
            <div
              key={i}
              className={`rounded-lg border p-3 transition-colors ${
                isSel ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-white'
              }`}
            >
              <label className={`flex items-center gap-3 ${pointMode ? '' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={isSel}
                  disabled={pointMode}
                  onChange={() => toggle(i)}
                  className="h-4 w-4 rounded border-slate-300 text-red-600 focus:ring-red-500 disabled:opacity-60"
                />
                <span className="flex-1 text-sm font-medium text-slate-800">{childLabel(c, i)}</span>
                {c.birth_date && <span className="text-xs text-slate-400">{c.birth_date}</span>}
                {linked && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-700">
                    <Baby size={11} /> תיק לידה
                  </span>
                )}
              </label>

              {/* ילד שהגיע מתיק יולדת — התיק הוא רשומה נפרדת, ומחיקת הילד
                  לבדה משאירה אותו. חייבים הכרעה מפורשת. */}
              {isSel && linked && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                    <AlertTriangle size={13} /> ל{childLabel(c, i)} יש תיק לידה. למחוק גם אותו?
                  </p>
                  <div className="flex gap-2">
                    {([
                      { v: 'delete' as const, l: 'כן — למחוק גם את תיק הלידה' },
                      { v: 'keep' as const, l: 'לא — למחוק רק את הילד/ה' },
                    ]).map(o => (
                      <button
                        key={o.v}
                        type="button"
                        onClick={() => setMaternityChoice(p => ({ ...p, [i]: o.v }))}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                          maternityChoice[i] === o.v
                            ? 'border-amber-600 bg-amber-600 text-white'
                            : 'border-amber-300 bg-white text-amber-900 hover:bg-amber-100'
                        }`}
                      >
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {undecided.length > 0 && (
        <p className="mt-3 text-xs font-medium text-amber-700">
          יש להכריע מה לעשות עם תיק הלידה לפני המחיקה.
        </p>
      )}
      {!countOk && selected.length > 0 && (
        <p className="mt-3 text-xs font-medium text-red-600">
          יש לבחור בדיוק {requiredCount} ילדים.
        </p>
      )}
    </Modal>
  )
}
