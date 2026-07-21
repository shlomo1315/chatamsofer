'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Package, Plus, Minus, Loader2, X, History, AlertTriangle, CheckCircle2, Clock } from 'lucide-react'
import { useStaffPermissions } from '@/components/StaffPermissions'

type LedgerRow = {
  id: string
  delta: number
  reason: 'restock' | 'birth_approval' | 'manual_out' | 'auto_assign' | 'adjust'
  note: string | null
  created_at: string
  aid?: { id?: string; beneficiary?: { family_name?: string; spouse_name?: string; full_name?: string; id_number?: string; spouse_id_number?: string } } | null
}

const REASON_LABEL: Record<LedgerRow['reason'], string> = {
  restock: 'הוספת מלאי',
  birth_approval: 'אישור לידה',
  manual_out: 'הורדה ידנית',
  auto_assign: 'שיוך אוטומטי',
  adjust: 'התאמה',
}

// תאריך ושעה מופרדים — כדי שלא ייווצר פסיק RTL שבור בין התאריך לשעה
const fmtDate = (s: string) => {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
const fmtTime = (s: string) => {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}
const benName = (r: LedgerRow) => {
  const b = r.aid?.beneficiary
  if (!b) return null
  return [b.family_name, b.spouse_name || b.full_name].filter(Boolean).join(' ') || null
}
// ת"ז היולדת (האשה קודם, נפילה-לאחור לראשי)
const benId = (r: LedgerRow) => {
  const b = r.aid?.beneficiary
  return b ? (b.spouse_id_number || b.id_number || null) : null
}

export default function StockManager() {
  const router = useRouter()
  // ניהול המלאי שמור למנהל בלבד — לא למזכירות, גם אם יש לה הרשאת עריכה
  // לכרטיסים. ⚠️ זו שכבת UI; האכיפה האמיתית היא ב-API (requirePermission).
  const { isAdmin } = useStaffPermissions()
  const canEdit = isAdmin
  const [balance, setBalance] = useState<number | null>(null)
  const [awaiting, setAwaiting] = useState(0)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'remove' | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [flash, setFlash] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/card-stock', { cache: 'no-store' })
      const d = await r.json()
      setBalance(typeof d.balance === 'number' ? d.balance : 0)
      setAwaiting(typeof d.awaiting === 'number' ? d.awaiting : 0)
      setLedger(Array.isArray(d.ledger) ? d.ledger : [])
    } catch { /* ignore */ }
    setLoading(false)
  }, [])
  useEffect(() => { const t = setTimeout(() => { void load() }, 0); return () => clearTimeout(t) }, [load])

  const low = balance != null && balance <= 5

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Package size={18} className="text-emerald-600" />
        <div>
          <h2 className="font-semibold text-slate-900">מלאי כרטיסים כללי</h2>
          <p className="text-xs text-slate-400">מלאי אחד לכל המערכת — יורד בכל אישור לידה, מתחדש בהוספת מלאי</p>
        </div>
      </div>

      {flash && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <CheckCircle2 size={15} /> {flash}
        </div>
      )}

      {/* כרטיס מלאי אונליין */}
      <div className={`rounded-2xl border px-6 py-5 flex items-center justify-between gap-4 ${low ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-100'}`}>
        <div>
          <p className={`text-sm font-medium ${low ? 'text-rose-600' : 'text-emerald-700'}`}>כרטיסים פנויים במלאי כרגע</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-4xl font-extrabold ${low ? 'text-rose-700' : 'text-emerald-800'}`}>
              {loading ? <Loader2 size={28} className="animate-spin inline" /> : (balance ?? 0)}
            </span>
            <span className={`text-sm ${low ? 'text-rose-500' : 'text-emerald-600'}`}>כרטיסים</span>
          </div>
          {low && !loading && (
            <p className="flex items-center gap-1.5 text-xs text-rose-600 font-medium mt-1.5">
              <AlertTriangle size={13} /> מלאי נמוך — מומלץ להוסיף כרטיסים
            </p>
          )}
          {!loading && awaiting > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-amber-700 font-medium mt-1.5">
              <Clock size={13} /> {awaiting} יולדות ממתינות למלאי
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-col gap-2">
            <button onClick={() => setModal('add')}
              className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg px-4 py-2 whitespace-nowrap">
              <Plus size={15} /> הוסף מלאי
            </button>
            <button onClick={() => setModal('remove')}
              className="inline-flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-sm font-semibold rounded-lg px-4 py-2 whitespace-nowrap">
              <Minus size={15} /> הורדת כרטיס
            </button>
          </div>
        )}
      </div>

      {/* יומן תנועות */}
      <div>
        <button onClick={() => setShowHistory(h => !h)}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 font-medium">
          <History size={15} /> {showHistory ? 'הסתר' : 'הצג'} יומן תנועות ({ledger.length})
        </button>
        {showHistory && (
          <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden">
            {ledger.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">אין תנועות עדיין</p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-right text-[13px] font-bold text-slate-500 border-b border-slate-200">
                      <th className="px-4 py-2.5 font-bold">תאריך</th>
                      <th className="px-4 py-2.5 font-bold">פעולה</th>
                      <th className="px-4 py-2.5 font-bold">שינוי</th>
                      <th className="px-4 py-2.5 font-bold">פרטים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map(r => {
                      const name = benName(r)
                      const zeout = benId(r)
                      const aidId = r.aid?.id
                      // שורה הקשורה ליולדת → לחיצה פותחת את כרטסת הלידה
                      const clickable = !!aidId
                      return (
                        <tr key={r.id}
                          onClick={clickable ? () => router.push(`/admin/maternity/${aidId}`) : undefined}
                          className={`border-b border-slate-100 ${clickable ? 'cursor-pointer hover:bg-emerald-50/40' : ''}`}>
                          <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                            <span className="ltr-num">{fmtDate(r.created_at)}</span>
                            <span className="text-slate-300 mx-1.5">·</span>
                            <span className="ltr-num">{fmtTime(r.created_at)}</span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-700">{REASON_LABEL[r.reason]}</td>
                          <td className={`px-4 py-2.5 font-bold ${r.delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            <span className="ltr-num">{r.delta > 0 ? `+${r.delta}` : r.delta}</span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-500">
                            {name ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="text-slate-700 font-medium">{name}</span>
                                {zeout && <span className="ltr-num text-xs text-slate-400">{zeout}</span>}
                              </span>
                            ) : (r.note || '—')}
                            {name && r.note ? <span className="text-slate-400"> · {r.note}</span> : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {modal && (
        <StockMovementModal
          mode={modal}
          currentBalance={balance ?? 0}
          awaiting={awaiting}
          onClose={() => setModal(null)}
          onDone={(msg) => { setModal(null); setFlash(msg); setTimeout(() => setFlash(''), 4000); load() }}
          onRefresh={load}
        />
      )}
    </div>
  )
}

// מודאל הוספת / הורדת מלאי
function StockMovementModal({ mode, currentBalance, awaiting, onClose, onDone, onRefresh }: {
  mode: 'add' | 'remove'; currentBalance: number; awaiting: number
  onClose: () => void; onDone: (msg: string) => void; onRefresh: () => void
}) {
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const isAdd = mode === 'add'

  // ── חישוב הסיכום ──
  // ⚠️ המלאי אחרי הוספה אינו balance+qty: הכרטיסים מחולקים תחילה ליולדות
  // הממתינות (processAwaitingStock, FIFO), ורק מה שנשאר יושב במלאי.
  const qtyNum = Math.max(0, Math.trunc(Number(qty) || 0))
  const poolAfterAdd = currentBalance + qtyNum          // המלאי הזמין לחלוקה
  const toWaiting = isAdd ? Math.min(awaiting, poolAfterAdd) : 0
  const stillWaiting = isAdd ? Math.max(0, awaiting - toWaiting) : 0
  const finalBalance = isAdd
    ? poolAfterAdd - toWaiting
    : Math.max(0, currentBalance - qtyNum)

  const submit = async () => {
    const n = Math.trunc(Number(qty))
    if (!n || n <= 0) { setErr('יש להזין כמות חיובית'); return }
    if (!isAdd && n > currentBalance) { setErr(`במלאי יש רק ${currentBalance} כרטיסים`); return }
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/admin/card-stock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta: isAdd ? n : -n, note: note.trim() || undefined }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'שגיאה'); setBusy(false); return }

      // ⚠️ כשל בשיוך לממתינות אינו כשל של הוספת המלאי — המלאי כן נוסף.
      // מציגים אותו במודאל במקום לסגור עם הודעת הצלחה מטעה.
      if (isAdd && (d.notConfigured || d.failed > 0)) {
        const detail = Array.isArray(d.errors) && d.errors.length ? ` (${d.errors[0]})` : ''
        setErr(d.notConfigured
          ? `נוספו ${n} כרטיסים, אך השיוך לממתינות נכשל — נדרים אינו מוגדר${detail}`
          : `נוספו ${n} כרטיסים. ${d.processed} יולדות קיבלו שובר, ${d.failed} נכשלו${detail}`)
        setBusy(false)
        onRefresh()
        return
      }

      const processedMsg = isAdd && d.processed > 0 ? ` — ${d.processed} יולדות מרשימת ההמתנה קיבלו שובר` : ''
      onDone(isAdd ? `נוספו ${n} כרטיסים למלאי${processedMsg}` : `הורדו ${n} כרטיסים מהמלאי`)
    } catch { setErr('שגיאת רשת'); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            {isAdd ? <Plus size={17} className="text-emerald-600" /> : <Minus size={17} className="text-rose-600" />}
            {isAdd ? 'הוספת מלאי כרטיסים' : 'הורדת כרטיסים מהמלאי'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">כמות כרטיסים <span className="text-red-500">*</span></label>
            <input value={qty} onChange={e => setQty(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" dir="ltr" autoFocus
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-lg font-semibold text-center focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="0" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">הערה (לא חובה)</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder={isAdd ? 'לדוגמה: קבלת 50 כרטיסים חדשים' : 'לדוגמה: נשלח ידנית ליולדת פלונית'} />
          </div>
          {/* סיכום חי — מה קורה למלאי אחרי העדכון.
              בהוספה: הכרטיסים מחולקים קודם לממתינות (FIFO), והיתרה נשארת במלאי. */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 flex flex-col gap-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">כמות המלאי הקיימת במערכת</span>
              <span className="font-semibold text-slate-800 ltr-num">{currentBalance}</span>
            </div>

            {isAdd && awaiting > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-amber-700">יולדות הממתינות למלאי</span>
                <span className="font-semibold text-amber-700 ltr-num">{awaiting}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-slate-500">{isAdd ? 'כמות הכרטיסים שהינך מוסיף כעת' : 'כמות הכרטיסים שהינך מוריד כעת'}</span>
              <span className={`font-semibold ltr-num ${isAdd ? 'text-emerald-600' : 'text-rose-600'}`}>
                {qtyNum > 0 ? (isAdd ? `+${qtyNum}` : `-${qtyNum}`) : '—'}
              </span>
            </div>

            {isAdd && qtyNum > 0 && toWaiting > 0 && (
              <div className="flex items-center justify-between text-amber-700">
                <span>מתוכם יחולקו מיד לממתינות</span>
                <span className="font-semibold ltr-num">{toWaiting}</span>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 mt-0.5">
              <span className="font-medium text-slate-700">סך הכל יהיה במלאי אחרי העדכון</span>
              {/* dir=rtl על העטיפה — אחרת ltr-num מציב את המילה לפני המספר
                  ("כרטיסים 10"). המספר עצמו נשאר LTR. */}
              <span className="font-bold text-slate-900" dir="rtl">
                <span className="ltr-num">{finalBalance}</span> כרטיסים
              </span>
            </div>

            {isAdd && qtyNum > 0 && stillWaiting > 0 && (
              <p className="text-xs text-amber-700 pt-0.5">
                {stillWaiting} יולדות עדיין יישארו בהמתנה — אין מספיק כרטיסים לכולן.
              </p>
            )}
          </div>

          {isAdd && (
            <p className="text-xs text-slate-500 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              יולדות שממתינות למלאי ישויכו אוטומטית לפי סדר הוותק ויקבלו שובר במייל.
            </p>
          )}
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">ביטול</button>
            <button onClick={submit} disabled={busy || !qty}
              className={`inline-flex items-center gap-1.5 text-white text-sm font-semibold rounded-lg px-5 py-2 disabled:opacity-50 ${isAdd ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : isAdd ? <Plus size={15} /> : <Minus size={15} />}
              {isAdd ? 'הוסף למלאי' : 'הורד מהמלאי'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
