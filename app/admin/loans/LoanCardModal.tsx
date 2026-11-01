'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCan } from '@/components/StaffPermissions'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { LOAN_STATUS_LABELS, type Loan, type LoanStatus } from '@/types'
import RecordModal, { modalBtn, type RecordTone } from '@/components/admin/system/RecordModal'
import RecordMessages, { postRecordMessage } from '@/components/admin/system/RecordMessages'

// כרטסת הלוואה: הגדרות בלבד, התצוגה ב-RecordModal המשותף.
// ⚠️ אישור, דחייה, שליחת שטר והפקדה מתבצעים בכרטסת המלאה ולא משוכפלים כאן.
// ⚠️ ההתכתבות של הלוואות היא loan_messages (lib/loanInquiry), לא aid_messages של סיוע.

type Ben = { full_name?: string; family_name?: string; spouse_name?: string; id_number?: string; spouse_id_number?: string; phone?: string; email?: string; city?: string; address?: string }
type Full = Pick<Loan, 'purpose_details' | 'document_urls' | 'rabbi_form_url' | 'notes' | 'office_notes' | 'rejection_reason' | 'approved_at' | 'monthly_payment' | 'start_date' | 'end_date' | 'note_sent_at' | 'disbursed_at'> & { beneficiary?: Ben | null }

const TONE: Record<LoanStatus, RecordTone> = {
  awaiting_rabbi_form: 'wait', pending: 'wait', inquiry: 'chk', approved: 'ok', active: 'ok', completed: 'ok', rejected: 'no', defaulted: 'no',
}
const STEPS = ['הוגשה', 'בירור', 'אושרה', 'שטר נשלח', 'הופקדה']

// 🔴 ההלוואות נקובות בדולר.
const usd = (n?: number | null) => (n != null ? `$${Math.round(Number(n) || 0).toLocaleString('he-IL')}` : '—')
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')

export default function LoanCardModal({ rows, index, onIndex, onClose }: {
  rows: Loan[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const l = rows[index]
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const canEdit = useCan('loans', 'edit')
  const [now] = useState(() => Date.now())
  const [loaded, setLoaded] = useState<{ id: string; data: Full } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const ready = loaded && loaded.id === l.id ? loaded.data : null

  useEffect(() => {
    let alive = true
    createClient().from('loans')
      .select('purpose_details, document_urls, rabbi_form_url, notes, office_notes, rejection_reason, approved_at, monthly_payment, start_date, end_date, note_sent_at, disbursed_at, beneficiary:beneficiaries(phone, email, city, address, id_number, spouse_id_number)')
      .eq('id', l.id).single()
      .then(({ data }) => { if (alive && data) setLoaded({ id: l.id, data: data as unknown as Full }) })
    return () => { alive = false }
  }, [l.id])

  const ben = (l.beneficiary ?? undefined) as Ben | undefined
  const b2 = ready?.beneficiary ?? undefined
  const name = ben ? ([ben.family_name, ben.full_name || ben.spouse_name].filter(Boolean).join(' ') || ben.full_name) : undefined
  const idNum = b2?.id_number ?? ben?.id_number ?? b2?.spouse_id_number ?? ben?.spouse_id_number
  const email = (b2?.email ?? '').trim()
  const docs = ready?.document_urls ?? []
  const noteSent = ready?.note_sent_at ?? l.note_sent_at
  const disbursed = ready?.disbursed_at ?? l.disbursed_at
  const current = l.status === 'rejected' ? 1
    : disbursed || ['active', 'completed', 'defaulted'].includes(l.status) ? 4
    : noteSent ? 3 : l.status === 'approved' ? 2 : l.status === 'inquiry' ? 1 : 0
  const days = Math.max(0, Math.floor((now - new Date(l.created_at).getTime()) / 86400000))
  const url = `/api/admin/loans/${l.id}/messages`

  // "בקש": הודעת בירור אמיתית ללווה במייל, אחרי אישור. רק כשיש מייל והרשאה.
  const ask = (what: string, text: string) => async () => {
    if (!(await confirm({ message: `לשלוח ללווה במייל בקשה להשלמת ${what}?` }))) return
    try {
      await postRecordMessage(url, text)
      toast.success('הבקשה נשלחה ללווה')
      setRefresh((n) => n + 1)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'השליחה נכשלה') }
  }
  const canAsk = canEdit && !!email && !!ready
  const full = `/admin/loans/${l.id}`

  return (<>
    <RecordModal
      kind="הלוואה"
      crumb={`הלוואות / בקשה ${l.id.slice(0, 8)}`}
      title={name || '—'}
      meta={[
        { label: 'ת״ז', value: idNum || '—', ltr: true },
        { label: 'הוגשה', value: fmt(l.created_at) },
        { label: 'מטרה', value: l.purpose || '—' },
      ]}
      statusLabel={LOAN_STATUS_LABELS[l.status]}
      statusTone={TONE[l.status]}
      stampDate={fmt(l.created_at)}
      facts={[
        { label: 'הלוואה', value: `#${l.id.slice(0, 6)}`, ltr: true },
        { label: 'סכום מבוקש', value: usd(l.amount) },
        { label: 'סכום מאושר', value: usd(l.approved_amount) },
        { label: 'ימים בטיפול', value: String(days) },
      ]}
      readiness={[
        { label: 'ת״ז הוזנה', ok: !!idNum },
        { label: 'טופס אישור רב', ok: !!ready?.rabbi_form_url, onAsk: canAsk ? ask('טופס אישור הרב', 'שלום, לצורך הטיפול בבקשת ההלוואה נבקש שתשלח בתשובה למייל זה את טופס אישור הרב החתום. תודה.') : undefined },
        { label: 'מסמכים מצורפים', ok: docs.length > 0, onAsk: canAsk ? ask('מסמכים', 'שלום, לצורך הטיפול בבקשת ההלוואה נבקש שתשלח בתשובה למייל זה את המסמכים הנדרשים. תודה.') : undefined },
        { label: 'מייל לפנייה', ok: !!email },
      ]}
      steps={{ labels: STEPS, current, rejected: l.status === 'rejected', dates: [fmt(l.created_at), undefined, fmt(ready?.approved_at), fmt(noteSent), fmt(disbursed)].map((d) => (d === '—' ? undefined : d)) }}
      sections={[
        { title: 'פרטי הלווה', fields: [
          { label: 'שם', value: name },
          { label: 'ת״ז', value: idNum, ltr: true, copy: true, lock: 'נעול' },
          { label: 'טלפון', value: b2?.phone, ltr: true, copy: true },
          { label: 'מייל', value: email, ltr: true, copy: true },
        ] },
        { title: 'פרטי ההלוואה', fields: [
          { label: 'סכום מבוקש', value: usd(l.amount) },
          { label: 'סכום מאושר', value: usd(l.approved_amount) },
          { label: 'תשלומים', value: String(l.installments) },
          { label: 'החזר חודשי', value: ready?.monthly_payment != null ? `₪${Math.round(ready.monthly_payment).toLocaleString('he-IL')}` : undefined },
        ] },
        { title: 'מטרה ומועדים', wide: true, fields: [
          { label: 'מטרה', value: l.purpose },
          { label: 'פירוט', value: ready?.purpose_details, full: true },
          { label: 'תחילת החזר', value: ready?.start_date ? fmt(ready.start_date) : undefined },
          { label: 'סיום החזר', value: ready?.end_date ? fmt(ready.end_date) : undefined },
          { label: 'סיבת דחייה', value: ready?.rejection_reason, full: true },
        ] },
      ]}
      note={{ title: 'הערת משרד', text: (ready?.office_notes ?? '').trim() }}
      tabs={[
        { key: 'messages', label: 'התכתבות', content: <RecordMessages url={url} canSend={canEdit} hasEmail={!!email} staffLabel="צוות ההלוואות" peerLabel="הלווה · השיב במייל" refreshKey={refresh} /> },
        { key: 'docs', label: 'מסמכים', count: docs.length + (ready?.rabbi_form_url ? 1 : 0), content: docs.length === 0 && !ready?.rabbi_form_url ? <p className="mt-4 text-sm text-[#6B6352]">לא צורפו מסמכים</p> : (
          <div className="mt-4 flex flex-wrap gap-2">
            {ready?.rabbi_form_url && <a href={ready.rabbi_form_url} target="_blank" rel="noreferrer" className={modalBtn.ghost}><ExternalLink size={16} />טופס אישור רב</a>}
            {docs.map((d, i) => <a key={i} href={d.url} target="_blank" rel="noreferrer" className={modalBtn.ghost}><ExternalLink size={16} />{d.name || 'מסמך'}{d.added_in_inquiry ? ' (הושלם בבירור)' : ''}</a>)}
          </div>
        ) },
      ]}
      actions={<>
        <Link href={full} title="ההחלטה מתבצעת בכרטסת המלאה" className={modalBtn.primary}>טיפול בבקשה</Link>
        <Link href={full} className={modalBtn.ghost}>פתיחת כרטסת מלאה</Link>
      </>}
      index={index}
      total={rows.length}
      onIndex={onIndex}
      onClose={onClose}
    />
    {confirmDialog}
  </>)
}
