'use client'
// לוגיקת סטטוס תיק היולדת (בקרת סטטוס, סנכרון סטטוס התינוק בכרטסת, מחיקת תיק) —
// חולצה מ-MaternityTable כדי שדף כרטסת היולדת (וכפתורי הפעולה) לא יטענו את רכיב הטבלה
// הכבד כולו. כך ההידרציה של הדף מהירה ותפריט הסטטוס נפתח מיד.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Check, X, ChevronDown, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { goToNextPending } from '@/lib/nextPending'
import type { MaternityAid, MaternityStatus } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useCan } from '@/components/StaffPermissions'

export type MotherRef = {
  id: string
  full_name?: string
  family_name?: string
  phone?: string
  spouse_name?: string
  spouse_id_number?: string
  children?: unknown[]
  children_count?: number
}

export const STATUS_PILL: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  pending:   { label: 'ממתין לאישור', cls: 'bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200', icon: Clock },
  active:    { label: 'מאושר',        cls: 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200', icon: Check },
  cancelled: { label: 'לא מאושר',     cls: 'bg-red-100 text-red-800 hover:bg-red-200 border-red-200', icon: X },
  completed: { label: 'הושלם',        cls: 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200', icon: Check },
}

const isSameBaby = (c: Record<string, unknown>, aid: MaternityAid) =>
  (c.maternity_aid_id && c.maternity_aid_id === aid.id) ||
  (aid.baby_id_number && c.id_number === aid.baby_id_number) ||
  (c.name === aid.baby_name && c.birth_date === aid.birth_date)

// סנכרון סטטוס התינוק בכרטסת המשפחה (beneficiaries → children JSON) לפי סטטוס תיק היולדת
async function syncBabyStatusInFamily(
  supabase: ReturnType<typeof createClient>,
  aid: MaternityAid,
  next: MaternityStatus,
) {
  const mother = aid.beneficiary as MotherRef | undefined
  if (!mother?.id) return

  const existing = Array.isArray(mother.children) ? (mother.children as Record<string, unknown>[]) : []

  // רשימת התינוקות של התיק — בלידת תאומים יש שניים (babies), אחרת התינוק הבודד.
  const twinBabies = Array.isArray(aid.babies) && aid.babies.length
    ? aid.babies
    : [{ name: aid.baby_name, gender: aid.baby_gender, id_type: aid.baby_id_type, id_number: aid.baby_id_number }]

  // לידה שקטה (ללא פרטי תינוק) — אין ילד להוסיף לכרטסת
  if (twinBabies.every(b => !b.name && !b.id_number)) return

  // התאמת ילד קיים בכרטסת לתינוק מסוים של התיק (לפי ת.ז / שיוך התיק / שם+תאריך)
  const matchBaby = (c: Record<string, unknown>, b: { name?: string | null; id_number?: string | null }) =>
    (c.maternity_aid_id === aid.id && b.id_number != null && c.id_number === b.id_number) ||
    (b.id_number != null && c.id_number === b.id_number) ||
    (c.maternity_aid_id === aid.id && c.name === (b.name ?? null) && c.birth_date === aid.birth_date)

  let updatedChildren: Record<string, unknown>[] = existing

  if (next === 'cancelled') {
    // דחיית הלידה — נסיר מהכרטסת רק ילדים שנכנסו דרך תיק היולדת (יש להם birth_status/שיוך)
    updatedChildren = existing.filter(c => {
      const belongsToAid = c.maternity_aid_id === aid.id || twinBabies.some(b => matchBaby(c, b))
      if (!belongsToAid) return true
      return !(c.birth_status || c.maternity_aid_id) // משאירים אם לא נכנס דרך התיק
    })
  } else {
    // active → מאושר · pending → ממתין לאישור לידה
    const birth_status = next === 'active' ? 'approved' : 'pending'
    for (const b of twinBabies) {
      const babyData = {
        name: b.name ?? null,
        id_number: b.id_number ?? null,
        doc_type: b.id_type ?? 'id',
        gender: b.gender ?? null,
        birth_date: aid.birth_date ?? null,
        marital_status: 'single', // תינוק שזה עתה נולד — לא נשוי
        maternity_aid_id: aid.id,
        birth_status,
      }
      const idx = updatedChildren.findIndex(c => matchBaby(c, b))
      updatedChildren = idx === -1
        ? [...updatedChildren, babyData]
        : updatedChildren.map((c, i) => i === idx ? { ...c, ...babyData } : c)
    }
  }

  await supabase
    .from('beneficiaries')
    .update({ children: updatedChildren, children_count: updatedChildren.length })
    .eq('id', mother.id)
}

// מחיקת תיק יולדת — מסיר גם את התינוק שנכנס דרך התיק מכרטסת המשפחה, ואז מוחק את התיק
export async function deleteMaternityAid(supabase: ReturnType<typeof createClient>, aid: MaternityAid) {
  const mother = aid.beneficiary as MotherRef | undefined
  if (mother?.id) {
    const existing = Array.isArray(mother.children) ? (mother.children as Record<string, unknown>[]) : []
    // תעודות הזהות של כל תינוקות התיק (כולל תאומים) — להסרה מהכרטסת
    const aidBabyIds = new Set(
      (Array.isArray(aid.babies) && aid.babies.length
        ? aid.babies.map(b => b.id_number)
        : [aid.baby_id_number]
      ).filter(Boolean) as string[],
    )
    // נסיר כל ילד שנכנס דרך תיק היולדת (שיוך התיק / ת.ז / שם+תאריך), אך רק אם נכנס דרך התיק
    const updatedChildren = existing.filter(c => {
      const belongsToAid = c.maternity_aid_id === aid.id
        || (c.id_number != null && aidBabyIds.has(String(c.id_number)))
        || isSameBaby(c, aid)
      if (!belongsToAid) return true
      return !(c.maternity_aid_id || c.birth_status) // שומרים אם לא נכנס דרך התיק
    })
    if (updatedChildren.length !== existing.length) {
      await supabase
        .from('beneficiaries')
        .update({ children: updatedChildren, children_count: updatedChildren.length })
        .eq('id', mother.id)
    }
  }
  const { error } = await supabase.from('maternity_aids').delete().eq('id', aid.id)
  if (error) throw error
}

type MotherRefLite = { id: string }

// ── Clickable status control ────────────────────────────────────────────────────
export function StatusControl({ aid, advance, familyApproved }: { aid: MaternityAid; advance?: boolean; familyApproved?: boolean }) {
  const router = useRouter()
  const supabase = createClient()
  const toast = useToast()
  const canEdit = useCan('maternity', 'edit')
  const [open, setOpen] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [familyGate, setFamilyGate] = useState(false) // חלונית: יש לאשר תחילה את המשפחה

  const pill = STATUS_PILL[aid.status] ?? STATUS_PILL.pending
  const Icon = pill.icon

  const setStatus = async (next: MaternityStatus) => {
    // חסימה: לא ניתן לאשר לידה לפני שהמשפחה מאושרת — חלונית מפורשת
    if (next === 'active' && familyApproved === false) {
      setOpen(false)
      setFamilyGate(true)
      return
    }
    // ── UI אופטימי: סוגרים מיד ומראים הצלחה, וכל העבודה מול השרת רצה ברקע ──
    // כך שהמזכיר לא ממתין ולו שנייה — התגובה מיידית.
    setOpen(false)

    // כל הקריאות לשרת רצות ברקע (לא חוסמות). כישלון → toast + רענון להצגת המצב האמיתי.
    const runBackground = async () => {
      try {
        // עדכון סטטוס התיק — דרך השרת, כדי לתעד מי המזכיר שטיפל ומתי
        const res = await fetch('/api/admin/request-status', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'maternity', id: aid.id, status: next }),
        })
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'שגיאה בעדכון הסטטוס') }

        // סנכרון סטטוס התינוק בכרטסת המשפחה לפי סטטוס תיק היולדת
        // active → הלידה מאושרת · pending → חוזר לממתין · cancelled → מוסר מהכרטסת
        void syncBabyStatusInFamily(supabase, aid, next)

        // באישור הלידה — מייל+שוברים והפיכת המשפחה ל"מאושר", וסנכרון נדרים
        if (next === 'active') {
          void fetch('/api/admin/request-approved', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'maternity', id: aid.id }),
          }).catch(() => {})
          const mother = aid.beneficiary as MotherRefLite | undefined
          if (mother?.id) {
            void fetch('/api/nedarim/save-client', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ beneficiaryId: mother.id }),
            }).catch(() => {})
          }
        }
        // רק כשלא מדובר בזרימת "בקשה הבאה" — נרענן ברקע לעדכון המספרים
        if (!(advance && next !== 'pending')) router.refresh()
      } catch (err: unknown) {
        toast.error(`שגיאה בעדכון: ${err instanceof Error ? err.message : String(err)}`)
        router.refresh()
      }
    }
    void runBackground()

    // טיפול בבקשה ממתינה מתוך כרטיס הבקשה → חלונית הצלחה ואז קפיצה לבקשה הממתינה הבאה
    if (advance && next !== 'pending') {
      setShowSuccess(true)
      setTimeout(() => {
        goToNextPending(supabase, router, { table: 'maternity_aids', statusColumn: 'status', pendingValues: ['pending'], currentId: aid.id, detailBase: '/admin/maternity', listPath: '/admin/maternity' })
      }, 1200)
    }
  }

  const options: { value: MaternityStatus; label: string; cls: string; icon: typeof Check }[] = [
    { value: 'active',    label: 'אשר לידה',     cls: 'text-green-700 hover:bg-green-50', icon: Check },
    { value: 'cancelled', label: 'דחה',          cls: 'text-red-600 hover:bg-red-50', icon: X },
    { value: 'pending',   label: 'החזר לממתין',  cls: 'text-amber-700 hover:bg-amber-50', icon: Clock },
  ]

  return (
    <div className="relative inline-block">
      {familyGate && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" dir="rtl" onClick={() => setFamilyGate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 px-7 py-6 flex flex-col items-center gap-3 max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center">
              <Clock size={28} className="text-amber-600" />
            </div>
            <p className="font-bold text-slate-900 text-lg">עליך לאשר תחילה את המשפחה</p>
            <p className="text-sm text-slate-500 leading-relaxed">לא ניתן לאשר את הלידה כל עוד המשפחה אינה מאושרת. אשרו תחילה את המשפחה (הפאנל הצהוב ״המשפחה טרם אושרה״), ולאחר מכן ניתן לאשר את הלידה.</p>
            <button onClick={() => setFamilyGate(false)} className="mt-1 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-xl px-6 py-2.5">הבנתי</button>
          </div>
        </div>
      )}
      {showSuccess && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 px-8 py-7 flex flex-col items-center gap-3 max-w-xs text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 size={30} className="text-green-600" />
            </div>
            <p className="font-bold text-slate-900">הפעולה בוצעה בהצלחה</p>
            <p className="text-sm text-slate-500">מעבירים אותך לבקשה הבאה…</p>
          </div>
        </div>
      )}
      {canEdit ? (
        <button
          onClick={() => setOpen(o => !o)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${pill.cls}`}
        >
          <Icon size={13} />
          {pill.label}
          <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      ) : (
        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${pill.cls}`}>
          <Icon size={13} />
          {pill.label}
        </span>
      )}
      {canEdit && open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          {/* נפתח לצד שמאל של הכפתור כדי לא להיחתך בתחתית הטבלה */}
          <div className="absolute z-20 top-0 left-full ml-2 w-40 bg-white rounded-xl border border-slate-200 shadow-lg py-1">
            {options.filter(o => o.value !== aid.status).map(o => {
              const OIcon = o.icon
              return (
                <button key={o.value} onClick={() => setStatus(o.value)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-right transition-colors ${o.cls}`}>
                  <OIcon size={15} /> {o.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
