'use client'
// לוגיקת סטטוס תיק היולדת (בקרת סטטוס, סנכרון סטטוס התינוק בכרטסת, מחיקת תיק) —
// חולצה מ-MaternityTable כדי שדף כרטסת היולדת (וכפתורי הפעולה) לא יטענו את רכיב הטבלה
// הכבד כולו. כך ההידרציה של הדף מהירה ותפריט הסטטוס נפתח מיד.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Check, X, ChevronDown, CheckCircle2, AlertTriangle } from 'lucide-react'
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
export function StatusControl({ aid, advance }: { aid: MaternityAid; advance?: boolean; familyApproved?: boolean }) {
  const router = useRouter()
  const supabase = createClient()
  const toast = useToast()
  const canEdit = useCan('maternity', 'edit')
  const [open, setOpen] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  // חלונית סיבת דחייה — נפתחת לפני מעבר לסטטוס 'cancelled' (דחייה),
  // בין אם מבקשה ממתינה ובין אם מבטלים לידה שכבר אושרה.
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  // אזהרת מלאי — נפתחת לפני אישור לידה כשאין כרטיסים במלאי. המזכיר מאשר במודע
  // שהיולדת תיכנס לרשימת המתנה ותקבל שובר כרטיס אוטומטית כשיתחדש המלאי.
  const [stockWarnOpen, setStockWarnOpen] = useState(false)
  const [checkingStock, setCheckingStock] = useState(false)

  const pill = STATUS_PILL[aid.status] ?? STATUS_PILL.pending
  const Icon = pill.icon

  const setStatus = async (next: MaternityStatus, reason?: string) => {
    // אישור הבקשה עצמאי — אין חסימה לפי אישור המשפחה. ניתן לאשר לידה גם אם היחוס
    // טרם אושר (לבקשת הלקוח). אישור היחוס נעשה בנפרד בכפתור "אישור יחוס".
    // ── UI אופטימי: סוגרים מיד ומראים הצלחה, וכל העבודה מול השרת רצה ברקע ──
    // כך שהמזכיר לא ממתין ולו שנייה — התגובה מיידית.
    setOpen(false)

    // כל הקריאות לשרת רצות ברקע (לא חוסמות). כישלון → toast + רענון להצגת המצב האמיתי.
    const runBackground = async () => {
      try {
        // עדכון סטטוס התיק — דרך השרת, כדי לתעד מי המזכיר שטיפל ומתי
        const res = await fetch('/api/admin/request-status', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'maternity', id: aid.id, status: next,
            // סיבת הדחייה נשמרת בתיק (עמודת rejection_reason)
            ...(reason ? { extra: { rejection_reason: reason } } : {}),
          }),
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
        // דחיית לידה עם סיבה — שולח ליולדת מייל מעוצב עם סיבת הדחייה
        if (next === 'cancelled' && reason) {
          void fetch('/api/admin/request-rejected', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: aid.id, reason }),
          }).catch(() => {})
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

  // אישור יחוס (משפחה) — נפרד מאישור הבקשה. מסמן את המשפחה כמאושרת לכל נושא מעתה,
  // ומאמת את צומת היחוס בעץ הדורות. אישור הבקשה עצמו ("אשר לידה") אינו מאשר יחוס.
  const familyApprove = async () => {
    const mother = aid.beneficiary as MotherRefLite | undefined
    if (!mother?.id) { toast.error('לא נמצאה משפחה לאישור'); return }
    setOpen(false)
    try {
      const { error } = await supabase.from('beneficiaries')
        .update({ eligibility_status: 'approved', updated_at: new Date().toISOString() }).eq('id', mother.id)
      if (error) throw error
      void fetch('/api/admin/approve-lineage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ beneficiaryId: mother.id, approved: true }) }).catch(() => {})
      void fetch('/api/admin/send-status-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: mother.id, status: 'approved' }) }).catch(() => {})
      void fetch('/api/nedarim/save-client', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ beneficiaryId: mother.id }) }).catch(() => {})
      toast.success('אישור יחוס — המשפחה סומנה כמאושרת')
      router.refresh()
    } catch (err: unknown) {
      toast.error(`שגיאה באישור יחוס: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const options: { value: MaternityStatus; label: string; cls: string; icon: typeof Check }[] = [
    { value: 'active',    label: 'אשר לידה',     cls: 'text-green-700 hover:bg-green-50', icon: Check },
    { value: 'cancelled', label: 'דחה',          cls: 'text-red-600 hover:bg-red-50', icon: X },
    { value: 'pending',   label: 'החזר לממתין',  cls: 'text-amber-700 hover:bg-amber-50', icon: Clock },
  ]

  // בחירת אפשרות — דחייה ('cancelled') נפתחת דרך חלונית סיבה; אישור לידה ('active')
  // בודק מלאי כרטיסים ומזהיר אם ריק; השאר מיד.
  const onOption = async (value: MaternityStatus) => {
    if (value === 'cancelled') {
      setOpen(false)
      setRejectReason('')
      setRejectOpen(true)
      return
    }
    // אישור לידה — בדיקת מלאי כרטיסים. אם אין מלאי, מזהירים לפני האישור.
    if (value === 'active') {
      setOpen(false)
      setCheckingStock(true)
      try {
        const r = await fetch('/api/admin/card-stock', { cache: 'no-store' })
        const d = await r.json()
        setCheckingStock(false)
        if (r.ok && typeof d.balance === 'number' && d.balance <= 0) {
          setStockWarnOpen(true) // אין מלאי → מודאל אזהרה, האישור ימתין לאישור המזכיר
          return
        }
      } catch { setCheckingStock(false) /* בדיקת המלאי היא תוספת — כשל לא חוסם אישור */ }
      void setStatus('active')
      return
    }
    void setStatus(value)
  }

  const confirmReject = () => {
    const reason = rejectReason.trim()
    if (!reason) return
    setRejectOpen(false)
    void setStatus('cancelled', reason)
  }

  return (
    <div className="relative inline-block">
      {/* אזהרת אין-מלאי לפני אישור לידה */}
      {stockWarnOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4" dir="rtl"
          onClick={() => setStockWarnOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">אין מלאי כרטיסי מזון</h3>
                <p className="text-xs text-slate-500">שובר הכרטיס לא יישלח כעת</p>
              </div>
            </div>
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 leading-relaxed">
              כרגע אין כרטיסים במלאי. אם תאשרו את הלידה — היולדת תיכנס ל<strong>רשימת המתנה</strong>,
              תקבל מייל אישור עם שובר ההבראה בלבד (<strong>ללא שובר כרטיס מזון</strong>), וברגע שיתחדש
              המלאי היא תשויך אוטומטית ותקבל את שובר הכרטיס במייל נפרד.
            </div>
            <div className="mt-4 flex justify-start gap-2">
              <button type="button" onClick={() => { setStockWarnOpen(false); void setStatus('active') }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-5 py-2.5 text-sm
                           font-bold text-white transition hover:bg-amber-700">
                <Check size={15} /> אשר בכל זאת (לרשימת המתנה)
              </button>
              <button type="button" onClick={() => setStockWarnOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold
                           text-slate-600 transition hover:bg-slate-50">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
      {rejectOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4" dir="rtl"
          onClick={() => setRejectOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">דחיית בקשת לידה</h3>
                <p className="text-xs text-slate-500">הסיבה תופיע במייל שיישלח ליולדת</p>
              </div>
            </div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-600">סיבת הדחייה</label>
            <textarea
              autoFocus
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={4}
              placeholder="פרטו את סיבת הדחייה — הטקסט יישלח ליולדת כפי שהוא"
              className="w-full resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm
                         focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
            />
            <div className="mt-4 flex justify-start gap-2">
              <button type="button" onClick={confirmReject} disabled={!rejectReason.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2.5 text-sm
                           font-bold text-white transition hover:bg-red-700 disabled:opacity-40">
                <X size={15} /> אישור דחייה
              </button>
              <button type="button" onClick={() => setRejectOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold
                           text-slate-600 transition hover:bg-slate-50">
                ביטול
              </button>
            </div>
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
                <button key={o.value} onClick={() => onOption(o.value)} disabled={checkingStock}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-right transition-colors disabled:opacity-50 ${o.cls}`}>
                  <OIcon size={15} /> {o.label}
                </button>
              )
            })}
            {/* אישור יחוס — פעולה נפרדת מאישור הבקשה */}
            <button onClick={familyApprove}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-right text-emerald-700 hover:bg-emerald-50 border-t border-slate-100">
              <Check size={15} /> אישור יחוס (משפחה)
            </button>
          </div>
        </>
      )}
    </div>
  )
}
