'use client'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import {
  WIDOW_REQUEST_STATUS_LABELS, WIDOW_REQUEST_TYPE_LABELS, WIDOW_SUPPORT_TYPE_LABELS,
  type Beneficiary, type WidowRequest, type WidowSupportPayment,
} from '@/types'
import RecordModal, { modalBtn } from '@/components/admin/system/RecordModal'
import { approvalLabelOf } from '@/lib/approvalLabel'

// כרטסת תיק משפחה (אלמנות ויתומים): הגדרות בלבד, התצוגה ב-RecordModal המשותף.
// אין בטבלאות הקיימות שרשור הודעות לתיק, ולכן לא נבנה כאן.

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')
const cur = (n?: number | null) => (n != null ? `₪${Math.round(Number(n)).toLocaleString('he-IL')}` : '—')

export default function WidowCardModal({ rows, index, onIndex, onClose, payments, requests }: {
  rows: Beneficiary[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  payments: WidowSupportPayment[]
  requests: WidowRequest[]
}) {
  const w = rows[index]
  const name = [w.family_name, w.full_name].filter(Boolean).join(' ')
  const pays = payments.filter(p => p.beneficiary_id === w.id)
  const reqs = requests.filter(r => r.beneficiary_id === w.id)
  const pending = reqs.filter(r => r.status === 'pending').length
  const total = pays.reduce((s, p) => s + Number(p.amount || 0), 0)
  const label = approvalLabelOf(w)
  return (
    <RecordModal
      kind="תיק משפחה"
      crumb={`אלמנות ויתומים / ${name}`}
      title={name}
      meta={[
        { label: 'ת״ז', value: w.id_number || '—', ltr: true },
        ...(label ? [{ label: 'סיבת אישור', value: label.name }] : []),
      ]}
      statusLabel={pending > 0 ? `${pending} בקשות ממתינות` : 'ללא בקשות ממתינות'}
      statusTone={pending > 0 ? 'wait' : 'ok'}
      stampDate={fmt(w.created_at)}
      facts={[
        { label: 'תמיכה חודשית', value: cur(w.monthly_support) },
        { label: 'סך תמיכות', value: cur(total) },
        { label: 'ילדים', value: String(w.children_count ?? 0) },
        { label: 'בקשות', value: String(reqs.length) },
      ]}
      sections={[
        { title: 'פרטי המשפחה', fields: [
          { label: 'שם', value: name },
          { label: 'ת״ז', value: w.id_number, ltr: true, copy: true },
          { label: 'מצב משפחתי', value: w.marital_status },
          { label: 'ילדים', value: String(w.children_count ?? 0) },
        ] },
        { title: 'יצירת קשר', fields: [
          { label: 'טלפון', value: w.phone, ltr: true, copy: true },
          { label: 'מייל', value: w.email, ltr: true, copy: true },
          { label: 'עיר', value: w.city },
          { label: 'כתובת', value: w.address },
        ] },
      ]}
      tabs={[
        { key: 'pay', label: 'תמיכות', count: pays.length, content: (
          <ul className="divide-y divide-line text-sm">
            {pays.length === 0 && <li className="py-6 text-center text-ink-faint">אין תמיכות רשומות</li>}
            {pays.map(p => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-ink">{WIDOW_SUPPORT_TYPE_LABELS[p.type] ?? p.type}{p.note ? ` · ${p.note}` : ''}</span>
                <span className="flex items-center gap-4 tabular-nums"><span className="text-ink-soft">{fmt(p.paid_at)}</span><b className="text-navy">{cur(p.amount)}</b></span>
              </li>
            ))}
          </ul>
        ) },
        { key: 'req', label: 'בקשות', count: reqs.length, content: (
          <ul className="divide-y divide-line text-sm">
            {reqs.length === 0 && <li className="py-6 text-center text-ink-faint">אין בקשות</li>}
            {reqs.map(r => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
                <span className="text-ink">{WIDOW_REQUEST_TYPE_LABELS[r.request_type]}{r.description ? ` · ${r.description}` : ''}</span>
                <span className="shrink-0 text-ink-soft">{WIDOW_REQUEST_STATUS_LABELS[r.status]} · {fmt(r.created_at)}</span>
              </li>
            ))}
          </ul>
        ) },
      ]}
      actions={<Link href={`/admin/widows/${w.id}`} className={modalBtn.primary}><ExternalLink size={14} /> לתיק המלא</Link>}
      index={index}
      total={rows.length}
      onIndex={onIndex}
      onClose={onClose}
    />
  )
}
