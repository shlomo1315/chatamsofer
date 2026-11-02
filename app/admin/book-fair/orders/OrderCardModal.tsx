'use client'
import Link from 'next/link'
import type { BookFairOrder, BookFairOrderStatus } from '@/types/bookFair'
import { BOOK_FAIR_STATUS_LABELS, BOOK_FAIR_CHANNEL_LABELS, BOOK_FAIR_DELIVERY_LABELS } from '@/types/bookFair'
import { fmtAgorot } from '@/lib/bookFairPricing'
import RecordModal, { modalBtn, type RecordTone } from '@/components/admin/system/RecordModal'

// כרטסת הזמנת יריד: הגדרות בלבד, התצוגה ב-RecordModal המשותף.
// ⚠️ שינוי סטטוס, החזר וליקוט נשארים בדף ההזמנה המלא ולא משוכפלים כאן.
// אין טבלת התכתבות להזמנות, ולכן אין לשונית התכתבות.

const TONE: Record<BookFairOrderStatus, RecordTone> = {
  pending_payment: 'wait', payment_mismatch: 'chk', paid: 'new', picking: 'chk', packed: 'chk',
  shipped: 'ok', delivered: 'ok', failed: 'no', cancelled: 'no', refunded: 'no', partially_refunded: 'chk',
}
const STEPS = ['נוצרה', 'שולמה', 'בליקוט', 'נארזה', 'נמסרה']
const STEP_OF: Partial<Record<BookFairOrderStatus, number>> = {
  pending_payment: 0, payment_mismatch: 1, paid: 1, picking: 2, packed: 3, shipped: 4, delivered: 4,
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')

export default function OrderCardModal({ rows, index, onIndex, onClose }: {
  rows: BookFairOrder[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const o = rows[index]
  const ship = o.delivery_method === 'shipping'
  const closed = o.status === 'failed' || o.status === 'cancelled' || o.status === 'refunded'

  return (
    <RecordModal
      kind="הזמנת יריד"
      crumb={`יריד ספרים / הזמנה ${o.order_number}`}
      title={o.customer_name || 'ללא שם'}
      meta={[
        { label: 'הזמנה', value: o.order_number, ltr: true },
        { label: 'ערוץ', value: BOOK_FAIR_CHANNEL_LABELS[o.channel] },
        { label: 'מסירה', value: BOOK_FAIR_DELIVERY_LABELS[o.delivery_method] },
      ]}
      statusLabel={BOOK_FAIR_STATUS_LABELS[o.status]}
      statusTone={TONE[o.status]}
      stampDate={fmt(o.created_at)}
      facts={[
        { label: 'ספרים', value: fmtAgorot(o.items_total_agorot) },
        { label: 'משלוח', value: fmtAgorot(o.shipping_agorot) },
        { label: 'סה״כ', value: fmtAgorot(o.total_agorot) },
        { label: 'הוחזר', value: o.refunded_agorot ? fmtAgorot(o.refunded_agorot) : '—' },
      ]}
      readiness={[
        { label: 'שולמה', ok: !!o.paid_at },
        { label: 'טלפון', ok: !!o.customer_phone },
        ...(ship ? [{ label: 'כתובת אומתה', ok: o.address_confirmed }] : []),
      ]}
      steps={{ labels: STEPS, current: STEP_OF[o.status] ?? 0, rejected: closed, dates: [fmt(o.created_at), fmt(o.paid_at)] }}
      sections={[
        { title: 'פרטי הלקוח', fields: [
          { label: 'שם', value: o.customer_name },
          { label: 'טלפון', value: o.customer_phone, ltr: true, copy: true },
          { label: 'מייל', value: o.customer_email, ltr: true, copy: true },
        ] },
        { title: 'מסירה', fields: [
          { label: 'אופן', value: BOOK_FAIR_DELIVERY_LABELS[o.delivery_method] },
          { label: 'כתובת', value: ship ? o.address_text : null, full: true },
          { label: 'נמסרה בדוכן', value: o.picked_up_at ? fmt(o.picked_up_at) : null },
        ] },
        { title: 'תשלום', fields: [
          { label: 'שולם בתאריך', value: fmt(o.paid_at) },
          { label: 'אמצעי תשלום', value: o.payment_method },
          { label: 'כרטיס', value: o.card_last4 ? `•••• ${o.card_last4}` : null, ltr: true },
          { label: 'נמכר על ידי', value: o.sold_by },
        ] },
      ]}
      note={{ title: 'הערות', text: (o.notes ?? '').trim() }}
      actions={<>
        <Link href={`/admin/book-fair/orders/${o.id}`} className={modalBtn.primary}>פתיחת ההזמנה המלאה</Link>
      </>}
      index={index}
      total={rows.length}
      onIndex={onIndex}
      onClose={onClose}
    />
  )
}
