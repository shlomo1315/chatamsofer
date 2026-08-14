'use client'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Check, X, ChevronDown, Loader2, Trash2, CheckCircle2, MessageSquare } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { goToNextPending } from '@/lib/nextPending'
import type { Loan, LoanStatus } from '@/types'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCan } from '@/components/StaffPermissions'

// סטטוס זכאות להלוואה: ממתין / זכאי (מאושר) / לא זכאי (לא מאושר)
const PILL: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  pending:   { label: 'ממתין לאישור', cls: 'bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-200', icon: Clock },
  inquiry:   { label: 'בתהליך בירור', cls: 'bg-sky-100 text-sky-800 hover:bg-sky-200 border-sky-200', icon: MessageSquare },
  approved:  { label: 'מאושר',        cls: 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200', icon: Check },
  active:    { label: 'מאושר',        cls: 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200', icon: Check },
  completed: { label: 'מאושר',        cls: 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200', icon: Check },
  rejected:  { label: 'לא מאושר',     cls: 'bg-red-100 text-red-800 hover:bg-red-200 border-red-200', icon: X },
  defaulted: { label: 'לא מאושר',     cls: 'bg-red-100 text-red-800 hover:bg-red-200 border-red-200', icon: X },
}

/**
 * ⚠️ variant='buttons' מציג שני כפתורים מפורשים (אישור / דחייה) במקום
 * תפריט נפתח. אותה לוגיקה בדיוק — רק המראה משתנה.
 *
 * הסיבה: בכרטסת ההחלטה היא הפעולה המרכזית, ותפריט נפתח מסתיר אותה מאחורי
 * לחיצה נוספת. ברשימה, לעומת זאת, התפריט חוסך מקום בכל שורה.
 */
export function LoanStatusControl({ loan, advance, variant = 'pill' }: { loan: Loan; advance?: boolean; familyApproved?: boolean; variant?: 'pill' | 'buttons' }) {
  const router = useRouter()
  const supabase = createClient()
  const toast = useToast()
  const canEdit = useCan('loans', 'edit')
  const btnRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  // מודל אישור — קליטת הסכום שאושר בפועל לפני האישור
  const [approveOpen, setApproveOpen] = useState(false)
  const [approvedAmount, setApprovedAmount] = useState(String(Math.round(Number(loan.approved_amount ?? loan.amount) || 0)))
  // האם לאשר גם את הייחוס יחד עם ההלוואה.
  //
  // ⚠️ ברירת המחדל היא false — אישור ההלוואה בלבד. אישור ייחוס הוא
  // הצהרה נפרדת ומשמעותית על שיוך המשפחה לשושלת, והוא משפיע על כל
  // הבקשות העתידיות שלה. הפיכתו לתופעת לוואי של אישור הלוואה הייתה
  // מאשרת שושלות בלי שאיש בחן אותן.
  const [approveLineage, setApproveLineage] = useState(false)
  // מודל דחייה — הסיבה נשמרת ומוצגת בבקשה הבאה של אותה משפחה.
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  // סטטוס אופטימי מקומי — מתעדכן מיד בלחיצה, בלי להמתין ל-router.refresh().
  const [localStatus, setLocalStatus] = useState<LoanStatus>(loan.status)
  useEffect(() => { setLocalStatus(loan.status) }, [loan.status])

  const pill = PILL[localStatus] ?? PILL.pending
  const Icon = pill.icon

  const toggle = () => {
    if (open) { setOpen(false); return }
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setCoords({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
    setOpen(true)
  }

  // חלק האישור/דחייה המשותף — מקבל אילו שדות לעדכן.
  // ⚠️ UI אופטימי מלא (כמו באישור לידה): הכפתור מתעדכן *מיד* בלחיצה, וכל
  // הרשת רצה ברקע. קודם ה-setLocalStatus חיכה ל-await fetch של request-status,
  // ולכן האישור "נתקע" עד שהשרת ענה — וזה מה שהרגיש איטי. עכשיו התגובה מיידית.
  const applyStatus = (next: LoanStatus, extra: Record<string, unknown> = {}) => {
    // 1) משוב ויזואלי מיידי — לפני כל קריאת רשת
    setLocalStatus(next)
    setOpen(false)
    setApproveOpen(false)
    setRejectOpen(false)

    // 2) כל הרשת ברקע — לא חוסמת את ה-UI. כשל → גלגול אחורה + הודעה.
    void (async () => {
      try {
        const res = await fetch('/api/admin/request-status', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'loan', id: loan.id, status: next, extra }),
        })
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'שגיאה בעדכון הסטטוס') }

        // באישור — מייל "בקשתך אושרה" + הפיכת המשפחה ל"מאושר" — גם ברקע
        if (next === 'approved') {
          void fetch('/api/admin/request-approved', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'loan', id: loan.id }),
          }).catch(() => {})
        }
        // רק כשלא בזרימת "בקשה הבאה" — נרענן ברקע לעדכון המספרים
        if (!(advance && next !== 'pending')) router.refresh()
      } catch (err: unknown) {
        setLocalStatus(loan.status) // גלגול אחורה במקרה כשל
        toast.error(`שגיאה בעדכון: ${err instanceof Error ? err.message : String(err)}`)
      }
    })()

    // טיפול בבקשה ממתינה מתוך כרטיס הבקשה → חלונית הצלחה ואז קפיצה לבקשה הבאה
    if (advance && next !== 'pending') {
      setShowSuccess(true)
      setTimeout(() => {
        goToNextPending(supabase, router, { table: 'loans', statusColumn: 'status', pendingValues: ['pending'], currentId: loan.id, detailBase: '/admin/loans', listPath: '/admin/loans' })
      }, 1500)
    }
  }

  const confirmReject = async () => {
    // ⚠️ הסיבה אינה חובה טכנית אבל כן נדרשת בפועל: היא מה שיוצג למזכירות
    // בפעם הבאה שהמשפחה תגיש. דחייה בלי סיבה משאירה את הבקשה הבאה בדיוק
    // באותו עיוורון שהתיקון הזה נועד לפתור.
    const reason = rejectReason.trim()
    if (!reason) { toast.error('יש לציין את סיבת הדחייה'); return }
    await applyStatus('rejected', {
      rejection_reason: reason,
      rejected_at: new Date().toISOString(),
    })
  }

  const setStatus = async (next: LoanStatus) => {
    if (next === 'rejected') {
      setOpen(false)
      setRejectReason('')
      setRejectOpen(true)
      return
    }
    // אישור הבקשה עצמאי — אין חסימה לפי אישור המשפחה. ניתן לאשר הלוואה גם אם היחוס
    // טרם אושר (לבקשת הלקוח). אישור היחוס נעשה בנפרד ("אישור יחוס" בכרטסת).
    // אישור — קודם מבקשים את הסכום שאושר בפועל
    if (next === 'approved') {
      setOpen(false)
      setApprovedAmount(String(Math.round(Number(loan.approved_amount ?? loan.amount) || 0)))
      // ⚠️ מאופס בכל פתיחה: הבחירה שייכת לבקשה הנוכחית בלבד, ו"דביקות"
      // מאישור קודם הייתה מאשרת ייחוס בלי כוונה בבקשה הבאה.
      setApproveLineage(false)
      setApproveOpen(true)
      return
    }
    await applyStatus(next)
  }

  const requestedAmount = Math.round(Number(loan.amount) || 0)

  const confirmApprove = async () => {
    const n = parseInt(approvedAmount.replace(/\D/g, '') || '0', 10)
    if (!n) { toast.error('יש להזין את הסכום שאושר'); return }
    // 🔴 אין תקרה בשלב האישור, בכוונה.
    //
    // ⚠️ קודם נחסם כל סכום שעלה על המבוקש. אבל האישור הוא החלטת המשרד,
    // ולעיתים מאשרים יותר ממה שהמבקש ביקש (שערוך מחדש, צירוף בקשות,
    // החלטת ועדה). החסימה הכריחה לערוך את הבקשה המקורית — כלומר לשכתב
    // את מה שהמבקש באמת ביקש, ולאבד את הנתון האמיתי.
    //
    // ── אישור הייחוס, אם נבחר במפורש ──
    //
    // ⚠️ נשלח *לפני* applyStatus ולא אחריו: applyStatus מפעילה את
    // המעבר האוטומטי לבקשה הבאה (ניווט אחרי 1.5 שניות), וקריאה שנשלחת
    // אחריה הייתה נקטעת באמצע כשהדף מתחלף.
    //
    // ⚠️ לא ממתינים לתשובה (void): אישור ההלוואה אינו תלוי בה, ושתי
    // ההחלטות נפרדות. כשל באישור הייחוס לא אמור לעכב או לבטל הלוואה.
    //
    // ⚠️ אישור ייחוס מאמת גם את כל האבות הממתינים עד הצומת המאושר
    // הראשון — פעולה רחבה, ולכן היא מתבצעת רק בבחירה מפורשת.
    if (approveLineage && loan.beneficiary_id) {
      void fetch('/api/admin/approve-lineage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ⚠️ approved: true חובה — בלעדיו המסלול מפרש את הבקשה
        // כ*ביטול* אישור ומחזיר את הצומת ל"ממתין".
        body: JSON.stringify({ beneficiaryId: loan.beneficiary_id, approved: true }),
      }).then(r => {
        if (!r.ok) toast.error('ההלוואה אושרה, אך אישור הייחוס נכשל')
      }).catch(() => toast.error('ההלוואה אושרה, אך אישור הייחוס נכשל'))
    }

    // ⚠️ התקרה בהגשה *נשארת* — שם היא מגבילה את המבקש, וזה תקין.
    // כאן מגבילה את המשרד, וזה לא.
    await applyStatus('approved', { approved_amount: n })
  }

  const options: { value: LoanStatus; label: string; cls: string; icon: typeof Check }[] = [
    { value: 'approved',  label: 'אשר (זכאי)',      cls: 'text-green-700 hover:bg-green-50', icon: Check },
    { value: 'rejected',  label: 'דחה (לא זכאי)',   cls: 'text-red-600 hover:bg-red-50', icon: X },
    // העברה ידנית לבירור — למקרה שהמנהל מעביר בקשה לבירור בלי לשלוח הודעה
    // מהצ'אט (שליחת הודעה מעבירה לשם אוטומטית).
    { value: 'inquiry',   label: 'העבר לבירור',     cls: 'text-sky-700 hover:bg-sky-50', icon: MessageSquare },
    { value: 'pending',   label: 'החזר לממתין',     cls: 'text-amber-700 hover:bg-amber-50', icon: Clock },
  ]
  const isApprovedLike = localStatus === 'approved' || localStatus === 'active' || localStatus === 'completed'
  const isRejectedLike = localStatus === 'rejected' || localStatus === 'defaulted'

  return (
    <div className="inline-block">
      {/* ── מודל דחייה — הסיבה נשמרת ומוצגת בבקשה הבאה ── */}
      {rejectOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden">
            <div className="bg-gradient-to-l from-rose-500 to-red-500 px-6 py-4">
              <h2 className="text-white font-bold">דחיית הלוואה</h2>
              <p className="text-red-100 text-xs mt-0.5">הסיבה תוצג בבקשה הבאה של המשפחה</p>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">סיבת הדחייה</label>
                <textarea
                  autoFocus rows={4} value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="לדוגמה: אין הכנסה קבועה · הבקשה אינה עומדת בתנאי הגמ״ח · חוב פתוח"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:border-rose-400 transition-shadow"
                />
                <p className="text-[11px] text-slate-400">
                  תוצג למזכירות אם המשפחה תגיש בקשה נוספת — לא נשלחת למבקש.
                </p>
              </div>
              <div className="flex gap-3 mt-1">
                <button onClick={confirmReject} disabled={saving}
                  className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">
                  דחה בקשה
                </button>
                <button onClick={() => setRejectOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600">
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {approveOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden">
            <div className="bg-gradient-to-l from-green-500 to-emerald-500 px-6 py-4">
              <h2 className="text-white font-bold">אישור הלוואה</h2>
              <p className="text-emerald-100 text-xs mt-0.5">הזן את הסכום שאושר בפועל</p>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              <div className="flex items-center justify-between text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span className="text-slate-500">סכום מבוקש</span>
                <span className="font-semibold text-slate-700 ltr-num">${requestedAmount.toLocaleString('he-IL')}</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-slate-700">סכום שאושר ($)</label>
                <input
                  type="text" inputMode="numeric" autoFocus dir="ltr"
                  value={approvedAmount}
                  // ⚠️ אין הגבלה: האישור הוא החלטת המשרד, ולעיתים מאשרים
                  // יותר מהמבוקש. החסימה הכריחה לערוך את הבקשה המקורית
                  // ולאבד את הסכום שהמבקש באמת ביקש.
                  onChange={e => setApprovedAmount(e.target.value.replace(/\D/g, ''))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 text-left ltr-num focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 transition-shadow"
                />
                {/* ⚠️ הסכום המבוקש מוצג כהתייחסות ולא כתקרה — והחריגה
                    מסומנת, כדי שאישור גבוה מהמבוקש יהיה מודע ולא בטעות. */}
                <p className="text-[11px] text-slate-400">
                  הסכום המבוקש: ${requestedAmount.toLocaleString('he-IL')}
                  {parseInt(approvedAmount || '0', 10) > requestedAmount && (
                    <span className="text-amber-600 font-bold"> · מאושר מעל המבוקש</span>
                  )}
                </p>
              </div>
              {/* ── היקף האישור ──
                  ⚠️ שתי אפשרויות מפורשות ולא תיבת סימון: תיבה שאינה
                  מסומנת נקראת כ"טרם החלטתי", ואילו כאן ברירת המחדל היא
                  החלטה בפני עצמה — לאשר את ההלוואה בלבד. */}
              <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
                <span className="text-xs font-bold text-slate-600">היקף האישור</span>

                <label className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                  !approveLineage ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'
                }`}>
                  <input type="radio" name="approve-scope" checked={!approveLineage}
                    onChange={() => setApproveLineage(false)} className="mt-0.5 accent-emerald-600" />
                  <span className="text-xs leading-tight">
                    <span className="font-bold text-slate-800">רק את ההלוואה</span>
                    <span className="block text-slate-500">ללא אישור ייחוס</span>
                  </span>
                </label>

                <label className={`flex items-start gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                  approveLineage ? 'border-amber-300 bg-amber-50' : 'border-slate-200 hover:bg-slate-50'
                }`}>
                  <input type="radio" name="approve-scope" checked={approveLineage}
                    onChange={() => setApproveLineage(true)} className="mt-0.5 accent-amber-600" />
                  <span className="text-xs leading-tight">
                    <span className="font-bold text-slate-800">גם את הייחוס</span>
                    <span className="block text-slate-500">מאשר את המשפחה ואת אבותיה הממתינים</span>
                  </span>
                </label>
              </div>

              <div className="flex gap-3 mt-1">
                <button onClick={confirmApprove} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-green-500 to-emerald-500 text-white font-semibold py-2.5 text-sm shadow-md shadow-emerald-200 hover:opacity-90 transition-opacity disabled:opacity-50">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                  אשר הלוואה
                </button>
                <button onClick={() => setApproveOpen(false)} disabled={saving}
                  className="px-5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50">
                  ביטול
                </button>
              </div>
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
      {/* ── שני כפתורים מפורשים (כרטסת) ── */}
      {/* ⚠️ גוונים רכים (50/700) ולא צבע מלא: זו פעולה בלתי הפיכה מבחינת
          המשפחה, וכפתור צועק מזמין לחיצה מהירה. הצבע מבחין, לא מושך. */}
      {canEdit && variant === 'buttons' ? (
        <div className="flex items-center gap-2 flex-wrap">
          {/* הסטטוס הנוכחי — כדי שיהיה ברור מה כבר הוחלט */}
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${pill.cls}`}>
            <Icon size={13} /> {pill.label}
          </span>

          {!isApprovedLike && (
            <button onClick={() => setStatus('approved')} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              אישור ההלוואה
            </button>
          )}
          {!isRejectedLike && (
            <button onClick={() => setStatus('rejected')} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-100 hover:border-rose-300 disabled:opacity-50 transition-colors">
              <X size={15} /> דחיית ההלוואה
            </button>
          )}
          {/* ⚠️ אין כאן תפריט "פעולות נוספות" בכוונה: בכרטסת ההחלטה היא
              בינארית — אישור או דחייה. החץ פתח חלונית עם פעולות נוספות
              ("אשר זכאי" וכו') שהסיטו את המזכיר מההחלטה שהוא בא לקבל.
              הפעולות הנדירות עדיין זמינות דרך גרסת ה-pill ברשימה. */}
        </div>
      ) : canEdit ? (
        <button ref={btnRef} onClick={toggle} disabled={saving}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors disabled:opacity-60 ${pill.cls}`}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
          {pill.label}
          <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      ) : (
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${pill.cls}`}>
          <Icon size={13} />
          {pill.label}
        </span>
      )}
      {canEdit && open && coords && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed z-50 w-44 bg-white rounded-xl border border-slate-200 shadow-xl py-1"
            style={{ top: coords.top, right: coords.right }}>
            {options
              .filter(o => !(o.value === localStatus || (o.value === 'approved' && isApprovedLike) || (o.value === 'rejected' && isRejectedLike)))
              .map(o => {
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

export function DeleteLoanButton({ loanId, redirect }: { loanId: string; redirect?: boolean }) {
  const router = useRouter()
  const supabase = createClient()
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!(await confirm({ title: 'מחיקת הלוואה', message: 'למחוק את ההלוואה לצמיתות? פעולה זו אינה הפיכה.', confirmLabel: 'מחיקה', danger: true }))) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('loans').delete().eq('id', loanId)
      if (error) throw error
      toast.success('ההלוואה נמחקה')
      if (redirect) router.push('/admin/loans')
      router.refresh()
    } catch (err: unknown) {
      toast.error(`שגיאה במחיקה: ${err instanceof Error ? err.message : String(err)}`)
      setDeleting(false)
    }
  }

  return (
    <>
    <button onClick={handleDelete} disabled={deleting}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-white hover:bg-red-600 px-2.5 py-1.5 rounded-lg border border-red-200 hover:border-red-600 transition-colors disabled:opacity-50">
      {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} מחיקה
    </button>
    {confirmDialog}
    </>
  )
}
