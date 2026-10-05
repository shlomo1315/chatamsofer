'use client'
import { useState } from 'react'
import { ilDateTime } from '@/lib/israelTime'
import { useRouter } from 'next/navigation'
import { Loader2, CreditCard, AlertTriangle, RotateCcw } from 'lucide-react'
import type {
  BookFairOrder, BookFairOrderStatus, BookFairOrderItem,
} from '@/types/bookFair'
import { BOOK_FAIR_STATUS_LABELS } from '@/types/bookFair'
import { fmtAgorot } from '@/lib/bookFairPricing'
import { canRefund } from '@/lib/bookFairRefund'
import { useCan } from '@/components/StaffPermissions'

// פאנל הפעולות בכרטיס ההזמנה.
//
// 🔴 אימות הכתובת מההקלטה הוא הלב כאן: הזמנה טלפונית למשלוח מגיעה עם
// הקלטה של הלקוח, והמשרד מקליד ממנה. עד שזה נעשה, ההזמנה אינה ניתנת
// למשלוח — וכך היא מסומנת בטבלה.

type Payment = {
  id: string; status: string; amount_agorot: number
  transaction_id: string | null; created_at: string; error_message: string | null
}

/**
 * מעברי הסטטוס המותרים — חייב להיות זהה לשרת, אחרת כפתור יחזיר שגיאה.
 *
 * ⚠️ סטטוסי הזיכוי הוסרו מכאן במכוון. הם אינם מעבר סטטוס אלא תוצאה של
 * פעולה כספית, ויש להם סקשן משלהם למטה — השרת דוחה אותם ב-PATCH.
 */
const NEXT: Partial<Record<BookFairOrderStatus, BookFairOrderStatus[]>> = {
  pending_payment:  ['cancelled', 'failed'],
  payment_mismatch: ['paid', 'cancelled'],
  paid:             ['picking', 'cancelled'],
  picking:          ['packed', 'paid', 'cancelled'],
  packed:           ['shipped', 'delivered', 'picking'],
  shipped:          ['delivered', 'packed'],
  // ביטול מסירה — לאיסוף עצמי בלבד (מסונן למטה)
  delivered:        ['paid'],
  failed:           ['cancelled'],
}

export default function OrderPanel({ order, items, payments }: {
  order: BookFairOrder
  items: BookFairOrderItem[]
  payments: Payment[]
}) {
  const router = useRouter()
  const canEdit = useCan('book_fair', 'edit')

  const [notes, setNotes] = useState(order.notes ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  /** כתובת לשליחה חוזרת — ריק = הכתובת ששמורה בהזמנה. */
  const [resendTo, setResendTo] = useState('')
  const [error, setError] = useState('')

  // ── זיכוי ──
  const [refundOpen, setRefundOpen] = useState(false)
  /** כמה עותקים להחזיר מכל שורה, לפי מזהה שורה. */
  const [back, setBack] = useState<Record<string, number>>({})
  const [refundShip, setRefundShip] = useState(false)
  const [restock, setRestock] = useState(true)
  const [refundReason, setRefundReason] = useState('')
  const [refundNote, setRefundNote] = useState('')

  const refundable = canRefund(order.status)
  const remaining = order.total_agorot - order.refunded_agorot

  // ⚠️ מחושב מהבחירה ולא נשמר ב-state: state נגזר שמתעדכן ב-effect הוא
  // בדיוק הדפוס שגרם ללולאת רינדור במסך החלוקה.
  const picked = Object.entries(back).filter(([, q]) => q > 0)
  const linesTotal = picked.reduce((s, [id, q]) => {
    const it = items.find(i => i.id === id)
    return s + (it ? it.unit_price_agorot * q : 0)
  }, 0)
  const refundTotal = linesTotal + (refundShip ? order.shipping_agorot : 0)
  // בלי בחירה כלל — זיכוי מלא של היתרה.
  const effectiveRefund = picked.length || refundShip ? refundTotal : remaining
  const refundValid = effectiveRefund > 0 && effectiveRefund <= remaining

  const needsAddress = order.delivery_method === 'shipping' && !order.address_confirmed


  /** @returns האם נשמר — כדי שעורך פתוח לא ייסגר ויאבד טקסט על כישלון. */
  async function patch(body: Record<string, unknown>, tag: string): Promise<boolean> {
    setBusy(tag); setError('')
    try {
      const res = await fetch(`/api/admin/book-fair/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'הפעולה נכשלה'); return false }
      router.refresh()
      return true
    } catch {
      setError('הפעולה נכשלה — בדקו את החיבור')
      return false
    } finally {
      setBusy(null)
    }
  }

  /**
   * מבצע זיכוי.
   *
   * 🔴 אישור מפורש עם הסכום בתוכו: זו פעולה כספית שאינה הפיכה בלחיצה,
   * ו"האם אתה בטוח?" בלי מספר אינו אישור אלא טקס.
   */
  async function doRefund() {
    if (!refundValid) return
    const full = effectiveRefund >= remaining
    const msg = `לזכות ${fmtAgorot(effectiveRefund)}` +
      (full ? ' (זיכוי מלא של היתרה)' : ' (זיכוי חלקי)') +
      (restock && picked.length ? ' ולהחזיר את העותקים למלאי' : '') + '?'
    if (!window.confirm(msg)) return

    setBusy('refund'); setError('')
    try {
      const res = await fetch(`/api/admin/book-fair/orders/${order.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // ⚠️ בלי בחירת שורות נשלח undefined ולא 0 — השרת מפרש חסר
          // כ"היתרה המלאה", ו-0 כשגיאה.
          amount_agorot: picked.length || refundShip ? effectiveRefund : undefined,
          lines: picked.map(([id, q]) => ({ itemId: id, quantity: q })),
          include_shipping: refundShip,
          restock,
          reason: [refundReason, refundNote].filter(Boolean).join(' — ') || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'הזיכוי נכשל'); return }

      // ⚠️ זיכוי ידני נאמר במפורש: הסטטוס השתנה אבל הכסף *לא* חזר
      // מעצמו, ומי שלא יידע זאת יסגור את הפנייה בלי להעביר תשלום.
      if (json.manualRequired) {
        window.alert(
          `נרשם זיכוי של ${fmtAgorot(json.amountAgorot)}.\n\n` +
          '⚠️ הכסף לא הוחזר אוטומטית — יש לבצע את ההעברה ללקוח ידנית.',
        )
      }
      // ⚠️ מכירת דוכן: הספרים לא הוחזרו למלאי אוטומטית (ראו route).
      if (json.standRestockManual) {
        window.alert('מכירת דוכן — הספרים שהוחזרו לא נוספו למלאי אוטומטית.\n\nיש להחזיר אותם למלאי הדוכן ידנית במסך הקטלוג.')
      }
      setRefundOpen(false); setBack({}); setRefundShip(false); setRefundReason(''); setRefundNote('')
      router.refresh()
    } catch {
      setError('הזיכוי נכשל — בדקו את החיבור')
    } finally {
      setBusy(null)
    }
  }

  /**
   * שליחה חוזרת של מייל האישור.
   *
   * 🔴 המייל נשלח רק מתוך קולבק התשלום. הזמנה שסומנה כשולמה בדרך
   * אחרת — תיקון ידני אחרי כשל קולבק, או מכירה בדוכן — לא קיבלה
   * מייל כלל, ולא הייתה דרך לשלוח אותו בדיעבד.
   */
  async function resendConfirmation() {
    const to = resendTo.trim() || order.customer_email || ''
    if (!to) { setError('אין כתובת מייל — הזינו כתובת'); return }
    if (!window.confirm(`לשלוח את אישור ההזמנה אל ${to}?`)) return

    setBusy('resend'); setError('')
    try {
      const res = await fetch(`/api/admin/book-fair/orders/${order.id}/resend-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resendTo.trim() ? { to: resendTo.trim() } : {}),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'שליחת המייל נכשלה'); return }
      window.alert(`אישור ההזמנה נשלח אל ${json.to}`)
      setResendTo('')
      router.refresh()
    } catch {
      setError('שליחת המייל נכשלה — בדקו את החיבור')
    } finally {
      setBusy(null)
    }
  }

  // ⚠️ ביטול מסירה רק באיסוף עצמי — השרת אוכף זאת גם הוא.
  const nextStatuses = order.status === 'delivered' && order.delivery_method !== 'pickup'
    ? []
    : NEXT[order.status] ?? []

  return (
    <div className="flex flex-col gap-5">
      {/* ⚠️ ההקלטות, התמלולים ואימות הכתובת עברו לכרטיס "פרטי הלקוח"
          (CustomerCard) — כל פרטי הלקוח במקום אחד (05.10). */}

      {/* ── שינוי סטטוס ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 font-semibold text-slate-900">מצב ההזמנה</h2>
        {order.picked_up_at && (
          <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            נאספה בדוכן ע״י {order.picked_up_by || 'מוכר'} ·{' '}
            {new Date(order.picked_up_at).toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem', dateStyle: 'short', timeStyle: 'short' })}
          </p>
        )}
        {nextStatuses.length ? (
          <div className="flex flex-col gap-2">
            {nextStatuses.map(s => (
              <button
                key={s}
                onClick={() => patch({ status: s }, `st-${s}`)}
                disabled={!canEdit || !!busy}
                className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
              >
                <span>{order.status === 'delivered' && s === 'paid' ? 'ביטול המסירה (חזרה לממתין לאיסוף)' : BOOK_FAIR_STATUS_LABELS[s]}</span>
                {busy === `st-${s}` && <Loader2 size={14} className="animate-spin" />}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">אין מעברים אפשריים ממצב זה.</p>
        )}
        {needsAddress && order.status === 'paid' && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            מומלץ לאמת את הכתובת לפני העברה לליקוט.
          </p>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────────────
          ── זיכוי ──

          🔴 סקשן נפרד ולא כפתור סטטוס. עד היום "זוכה" היה מעבר סטטוס
          רגיל: הסטטוס השתנה, refunded_agorot נשאר 0, וההכנסות המשיכו
          לספור את הסכום המלא. כאן הכסף באמת חוזר ונרשם.
          ───────────────────────────────────────────────────────────── */}
      {refundable && (
        <section className="rounded-2xl border border-orange-200 bg-orange-50/40 p-5">
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
            <RotateCcw size={16} className="text-orange-600" /> זיכוי
          </h2>
          <p className="mb-3 text-sm text-slate-600">
            שולם {fmtAgorot(order.total_agorot)}
            {order.refunded_agorot > 0 && <> · זוכה עד כה {fmtAgorot(order.refunded_agorot)}</>}
            {' · '}<strong className="text-slate-800">ניתן לזכות {fmtAgorot(remaining)}</strong>
          </p>

          {!refundOpen ? (
            <button
              onClick={() => setRefundOpen(true)}
              disabled={!canEdit}
              className="rounded-xl border border-orange-300 bg-white px-4 py-2 text-sm font-medium text-orange-800 transition hover:bg-orange-50 disabled:opacity-40"
            >
              ביצוע זיכוי
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              {/* ⚠️ בחירת שורות היא גם מה שחוזר למלאי וגם מה שמחשב את
                  הסכום. בלי בחירה — זיכוי מלא של היתרה בלי החזרת מלאי. */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-medium text-slate-500">מה חוזר? (ריק = זיכוי כספי מלא בלי החזרת ספרים)</p>
                {items.map(it => {
                  const q = back[it.id] ?? 0
                  return (
                    <div key={it.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-800">{it.title_snapshot}</p>
                        <p className="text-xs text-slate-500">
                          {it.quantity} × {fmtAgorot(it.unit_price_agorot)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() => setBack(b => ({ ...b, [it.id]: Math.max(0, q - 1) }))}
                          disabled={q <= 0}
                          className="h-7 w-7 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30"
                        >−</button>
                        <span className="w-7 text-center text-sm tabular-nums">{q}</span>
                        <button
                          onClick={() => setBack(b => ({ ...b, [it.id]: Math.min(it.quantity, q + 1) }))}
                          disabled={q >= it.quantity}
                          className="h-7 w-7 rounded-lg border border-slate-200 text-slate-600 disabled:opacity-30"
                        >+</button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {order.shipping_agorot > 0 && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={refundShip} onChange={e => setRefundShip(e.target.checked)} className="rounded" />
                  לזכות גם את דמי המשלוח ({fmtAgorot(order.shipping_agorot)})
                </label>
              )}

              {picked.length > 0 && (
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} className="rounded" />
                  להחזיר את העותקים למלאי
                  {/* ⚠️ ברירת המחדל מסומנת, אך ספר פגום אינו חוזר למדף. */}
                  <span className="text-xs text-slate-400">(בטלו אם הספרים פגומים)</span>
                </label>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={refundReason}
                  onChange={e => setRefundReason(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">סיבת הזיכוי…</option>
                  <option value="ביטול הזמנה">ביטול הזמנה</option>
                  <option value="ספר פגום">ספר פגום</option>
                  <option value="ספר חסר במלאי">ספר חסר במלאי</option>
                  <option value="טעות בהזמנה">טעות בהזמנה</option>
                  <option value="אחר">אחר</option>
                </select>
                <input
                  value={refundNote}
                  onChange={e => setRefundNote(e.target.value)}
                  placeholder="פירוט (לא חובה)"
                  className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5">
                <span className="text-sm text-slate-600">סכום הזיכוי</span>
                <span className="text-lg font-semibold tabular-nums text-orange-700">
                  {fmtAgorot(effectiveRefund)}
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={doRefund}
                  disabled={!canEdit || !!busy || !refundValid}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-orange-700 disabled:opacity-40"
                >
                  {busy === 'refund' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  אישור הזיכוי
                </button>
                <button
                  onClick={() => { setRefundOpen(false); setBack({}); setRefundShip(false) }}
                  disabled={!!busy}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 disabled:opacity-40"
                >
                  ביטול
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── מייל אישור ──
          ⚠️ מוצג רק להזמנה ששולמה: אישור על הזמנה שלא שולמה הוא שקר. */}
      {canEdit && ['paid','picking','packed','shipped','delivered'].includes(order.status) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-1 font-semibold text-slate-900">מייל אישור</h2>
          <p className="mb-3 text-sm text-slate-500">
            {order.customer_email
              ? `נשלח אל ${order.customer_email}`
              : 'אין כתובת מייל בהזמנה — הזינו כתובת לשליחה'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="email"
              dir="ltr"
              value={resendTo}
              onChange={e => setResendTo(e.target.value)}
              placeholder={order.customer_email ?? 'name@example.com'}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              onClick={() => void resendConfirmation()}
              disabled={busy === 'resend'}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy === 'resend'
                ? <><Loader2 size={14} className="animate-spin" /> שולח…</>
                : 'שליחת אישור'}
            </button>
          </div>
        </section>
      )}

      {/* ── הערות ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-2 font-semibold text-slate-900">הערות פנימיות</h2>
        <textarea
          value={notes} onChange={e => setNotes(e.target.value)}
          disabled={!canEdit} rows={3}
          placeholder="לא מוצג ללקוח"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
        <button
          onClick={() => patch({ notes }, 'notes')}
          disabled={!canEdit || !!busy || notes === (order.notes ?? '')}
          className="mt-2 w-full rounded-xl bg-slate-100 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:opacity-40"
        >
          {busy === 'notes' ? <Loader2 size={14} className="mx-auto animate-spin" /> : 'שמירת הערות'}
        </button>
      </section>

      {/* ── היסטוריית תשלומים ── */}
      {payments.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
            <CreditCard size={16} /> תשלומים
          </h2>
          <ul className="flex flex-col gap-2 text-sm">
            {payments.map(p => (
              <li key={p.id} className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2 last:border-0">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800">
                    {p.status === 'success' ? 'הצליח' : p.status === 'failed' ? 'נכשל' : p.status === 'refunded' ? 'זוכה' : 'נפתח'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {ilDateTime(p.created_at)}
                  </div>
                  {p.error_message && (
                    <div className="mt-1 text-xs text-red-600">{p.error_message}</div>
                  )}
                </div>
                <span className="whitespace-nowrap tabular-nums text-slate-700">
                  {fmtAgorot(p.amount_agorot)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {order.status === 'payment_mismatch' && (
        <div className="flex items-start gap-2 rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle size={17} className="mt-0.5 flex-shrink-0" />
          <span>
            הסכום שנגבה אינו תואם לסכום ההזמנה. בדקו מול ממשק הסליקה לפני אישור או זיכוי.
          </span>
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>
      )}
    </div>
  )
}
