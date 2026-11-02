'use client'
import Link from 'next/link'
import RecordModal, { modalBtn, type RecordTone } from '@/components/admin/system/RecordModal'
import { SOURCE_LABEL } from '@/lib/distributionSources'
import type { HolidayRow } from './HolidayRecipientsTable'

// כרטסת נרשם בחלוקת חגים: הגדרות בלבד, התצוגה ב-RecordModal המשותף.
// ⚠️ אישור, דחייה וטעינת כרטיס (כסף אמיתי) נשארים בטבלה ובפעולות הקבוצתיות ולא משוכפלים כאן.

const APPROVAL: Record<HolidayRow['approval_status'], { label: string; tone: RecordTone; step: number }> = {
  pending: { label: 'ממתין לאישור', tone: 'wait', step: 0 },
  approved: { label: 'מאושר', tone: 'ok', step: 1 },
  rejected: { label: 'נדחה', tone: 'no', step: 1 },
}
const LOAD: Record<string, string> = { loaded: 'נטען', pending: 'בתהליך', failed: 'נכשל' }
const STEPS = ['נרשם', 'הוכרע', 'כרטיס מקושר', 'נטען']

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')

export default function RegistrationCardModal({ rows, index, onIndex, onClose, distributionId, amount }: {
  rows: HolidayRow[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  distributionId?: string
  amount?: number | null
}) {
  const r = rows[index]
  const a = APPROVAL[r.approval_status]
  const label = r.approval_label?.name
  const loaded = r.load_status === 'loaded'
  const step = loaded ? 3 : r.card_number ? 2 : a.step
  return (
    <RecordModal
      kind="נרשם לחלוקה"
      crumb={`חלוקת חגים / נרשם ${r.id.slice(0, 8)}`}
      title={r.name || '—'}
      meta={[
        { label: 'ת״ז', value: r.id_number || '—', ltr: true },
        { label: 'ערוץ', value: SOURCE_LABEL[r.source] ?? r.source },
        ...(label ? [{ label: 'סיבת אישור', value: String(label) }] : []),
      ]}
      statusLabel={a.label}
      statusTone={a.tone}
      stampDate={fmt(r.registered_at)}
      facts={[
        { label: 'נרשם', value: fmt(r.registered_at) },
        { label: 'סכום למשפחה', value: amount != null ? `₪${Number(amount).toLocaleString('he-IL')}` : '—' },
        { label: 'כרטיס', value: r.card_number ? '•••' + r.card_number.slice(-4) : '—', ltr: true },
        { label: 'מוקד', value: r.center_name || '—' },
      ]}
      readiness={[
        { label: 'מאושר', ok: r.approval_status === 'approved' },
        { label: 'כרטיס מקושר', ok: !!r.card_number },
        { label: 'נשלחה הודעה', ok: !!r.notified_at },
        { label: 'מוקד נבחר', ok: !!r.center_id },
      ]}
      steps={{ labels: STEPS, current: step, rejected: r.approval_status === 'rejected', dates: [fmt(r.registered_at)] }}
      sections={[
        { title: 'פרטי הנרשם', fields: [
          { label: 'שם', value: r.name },
          { label: 'ת״ז', value: r.id_number, ltr: true, copy: true },
          { label: 'שם בן/בת הזוג', value: r.spouse_name },
          { label: 'ילדים', value: r.children_count != null ? String(r.children_count) : null },
          { label: 'גיל', value: r.age != null ? String(r.age) : null },
        ] },
        { title: 'יצירת קשר', fields: [
          { label: 'טלפון', value: r.phone || r.ben_phone, ltr: true, copy: true },
          { label: 'מייל', value: r.email, ltr: true, copy: true },
          { label: 'עיר', value: r.city },
          { label: 'כתובת', value: r.address },
        ] },
        { title: 'כרטיס ומוקד', wide: true, fields: [
          { label: 'מוקד חלוקה', value: r.center_name },
          { label: 'טעינת כרטיס', value: r.load_status ? (LOAD[r.load_status] ?? r.load_status) : 'טרם' },
          { label: 'שגיאת קישור כרטיס', value: r.card_link_error, full: true },
          { label: 'שגיאת הודעה', value: r.notify_error, full: true },
          { label: 'שגיאת טעינה', value: r.load_error, full: true },
        ] },
      ]}
      actions={r.beneficiary_id ? (
        <Link href={`/admin/beneficiaries/${r.beneficiary_id}`} className={modalBtn.ghost}>פתיחת כרטסת הצאצא</Link>
      ) : distributionId ? (
        <Link href={`/admin/distributions/${distributionId}`} className={modalBtn.ghost}>לחלוקה</Link>
      ) : undefined}
      index={index}
      total={rows.length}
      onIndex={onIndex}
      onClose={onClose}
    />
  )
}
