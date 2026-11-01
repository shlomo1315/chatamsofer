'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCan } from '@/components/StaffPermissions'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { FINANCIAL_AID_STATUS_LABELS, type FinancialAidRequest, type FinancialAidStatus } from '@/types'
import { AID_TYPE_LABELS, AID_AFFILIATION_LABELS, aidAffiliation } from '@/components/admin/AidTypeLabels'
import RecordModal, { modalBtn, type RecordTone } from '@/components/admin/system/RecordModal'
import RecordMessages, { postRecordMessage } from '@/components/admin/system/RecordMessages'

// כרטסת בקשת סיוע: הגדרות בלבד, התצוגה ב-RecordModal המשותף.
// ⚠️ ההחלטה (אישור, דחייה, שליחה לגורם מאשר) מתבצעת בכרטסת המלאה ולא משוכפלת כאן.

type Ben = { full_name?: string; family_name?: string; id_number?: string; spouse_id_number?: string; phone?: string; email?: string; city?: string; address?: string }
type Full = Pick<FinancialAidRequest, 'applicant_phone' | 'applicant_email' | 'applicant_city' | 'applicant_address' | 'applicant_id_number' | 'requested_amount' | 'relation' | 'referrer' | 'notes' | 'document_url' | 'document_name' | 'decision_email'> & { beneficiary?: Ben | null }

const TONE: Record<FinancialAidStatus, RecordTone> = { pending: 'wait', inquiry: 'chk', awaiting_decision: 'chk', approved: 'ok', rejected: 'no' }
const STEP_OF: Record<FinancialAidStatus, number> = { pending: 0, inquiry: 1, awaiting_decision: 2, approved: 3, rejected: 3 }
const STEPS = ['התקבלה', 'בבירור', 'נשלח לגורם מאשר', 'הוכרעה']

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')
const cur = (n?: number | null) => (n != null ? `₪${Number(n).toLocaleString('he-IL')}` : '—')

export default function AidCardModal({ rows, index, onIndex, onClose }: {
  rows: FinancialAidRequest[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const r = rows[index]
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const canEdit = useCan('financial_aid', 'edit')
  const [now] = useState(() => Date.now())
  const [loaded, setLoaded] = useState<{ id: string; data: Full } | null>(null)
  const [refresh, setRefresh] = useState(0)
  const ready = loaded && loaded.id === r.id ? loaded.data : null

  useEffect(() => {
    let alive = true
    createClient().from('financial_aid_requests')
      .select('applicant_phone, applicant_email, applicant_city, applicant_address, applicant_id_number, requested_amount, relation, referrer, notes, document_url, document_name, decision_email, beneficiary:beneficiaries(phone, email, city, address, id_number, spouse_id_number)')
      .eq('id', r.id).single()
      .then(({ data }) => { if (alive && data) setLoaded({ id: r.id, data: data as unknown as Full }) })
    return () => { alive = false }
  }, [r.id])

  const ben = (r.beneficiary ?? undefined) as Ben | undefined
  const b2 = ready?.beneficiary ?? undefined
  const name = ben ? ([ben.family_name, ben.full_name].filter(Boolean).join(' ') || ben.full_name) : r.applicant_name
  const idNum = b2?.id_number ?? ben?.id_number ?? b2?.spouse_id_number ?? ben?.spouse_id_number ?? ready?.applicant_id_number ?? r.applicant_id_number
  const phone = b2?.phone ?? ready?.applicant_phone
  const email = (b2?.email ?? ready?.applicant_email ?? '').trim()
  const city = b2?.city ?? ready?.applicant_city
  const address = b2?.address ?? ready?.applicant_address
  const hasDoc = !!(ready?.document_url ?? r.document_url)
  const days = Math.max(0, Math.floor((now - new Date(r.created_at).getTime()) / 86400000))
  const url = `/api/admin/aid/financial_aid_requests/${r.id}/messages`

  // "בקש": הודעת בירור אמיתית למבקש במייל, אחרי אישור. רק כשיש מייל והרשאה.
  const ask = (what: string, text: string) => async () => {
    if (!(await confirm({ message: `לשלוח למבקש במייל בקשה להשלמת ${what}?` }))) return
    try {
      await postRecordMessage(url, text)
      toast.success('הבקשה נשלחה למבקש')
      setRefresh((n) => n + 1)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'השליחה נכשלה') }
  }
  const canAsk = canEdit && !!email && !!ready

  return (<>
    <RecordModal
      kind="בקשת סיוע"
      crumb={`מחלקת סיוע / בקשה ${r.id.slice(0, 8)}`}
      title={name || '—'}
      meta={[
        { label: 'ת״ז', value: idNum || '—', ltr: true },
        { label: 'סוג', value: AID_TYPE_LABELS[r.aid_type ?? 'medical'] },
        { label: 'שיוך', value: AID_AFFILIATION_LABELS[aidAffiliation(r)] },
      ]}
      statusLabel={FINANCIAL_AID_STATUS_LABELS[r.status]}
      statusTone={TONE[r.status]}
      stampDate={fmt(r.created_at)}
      facts={[
        { label: 'בקשה', value: `#${r.id.slice(0, 6)}`, ltr: true },
        { label: 'סכום מבוקש', value: cur(ready?.requested_amount) },
        { label: 'סכום מאושר', value: r.status === 'approved' ? cur(r.amount) : '—' },
        { label: 'ימים בטיפול', value: String(days) },
      ]}
      readiness={[
        { label: 'ת״ז הוזנה', ok: !!idNum },
        { label: 'סיבת הבקשה', ok: !!r.reason?.trim(), onAsk: canAsk ? ask('סיבת הבקשה', 'שלום, לצורך הטיפול בבקשה נבקש שתפרט בתשובה את סיבת הבקשה. תודה.') : undefined },
        { label: 'מסמך מצורף', ok: hasDoc, onAsk: canAsk ? ask('מסמך', 'שלום, לצורך הטיפול בבקשה נבקש שתשלח בתשובה למייל זה את המסמך התומך בבקשה. תודה.') : undefined },
        { label: 'מייל לפנייה', ok: !!email },
      ]}
      steps={{ labels: STEPS, current: STEP_OF[r.status], rejected: r.status === 'rejected', dates: [fmt(r.created_at)] }}
      sections={[
        { title: 'פרטי המבקש', fields: [
          { label: 'שם', value: name },
          { label: 'ת״ז', value: idNum, ltr: true, copy: true, lock: 'נעול' },
          { label: 'קרבה', value: ready?.relation },
          { label: 'הופנה על ידי', value: ready?.referrer },
        ] },
        { title: 'יצירת קשר', fields: [
          { label: 'טלפון', value: phone, ltr: true, copy: true },
          { label: 'מייל', value: email, ltr: true, copy: true },
          { label: 'עיר', value: city },
          { label: 'כתובת', value: address },
        ] },
        { title: 'הבקשה', wide: true, fields: [
          { label: 'סיבת הבקשה', value: r.reason, full: true },
          { label: 'סכום מבוקש', value: cur(ready?.requested_amount) },
          { label: 'מייל הגורם המאשר', value: ready?.decision_email, ltr: true },
        ] },
      ]}
      note={{ title: 'הערת משרד', text: (ready?.notes ?? '').trim() }}
      tabs={[
        { key: 'messages', label: 'התכתבות', count: r.unread || undefined,
          content: <RecordMessages url={url} canSend={canEdit} hasEmail={!!email} staffLabel="מחלקת סיוע" peerLabel="המבקש · השיב במייל" refreshKey={refresh} /> },
        { key: 'docs', label: 'מסמכים', count: hasDoc ? 1 : 0, content: hasDoc ? (
          <div className="mt-4"><a href={ready?.document_url ?? r.document_url} target="_blank" rel="noreferrer" className={modalBtn.ghost}><ExternalLink size={16} />{ready?.document_name ?? r.document_name ?? 'מסמך הבקשה'}</a></div>
        ) : <p className="mt-4 text-sm text-[#6B6352]">לא צורף מסמך</p> },
      ]}
      actions={<>
        <Link href={`/admin/financial-aid/${r.id}`} title="ההחלטה מתבצעת בכרטסת המלאה" className={modalBtn.primary}>טיפול בבקשה</Link>
        <Link href={`/admin/financial-aid/${r.id}`} className={modalBtn.ghost}>פתיחת כרטסת מלאה</Link>
      </>}
      index={index}
      total={rows.length}
      onIndex={onIndex}
      onClose={onClose}
    />
    {confirmDialog}
  </>)
}
