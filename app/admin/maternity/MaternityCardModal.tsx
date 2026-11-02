'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCan } from '@/components/StaffPermissions'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { MaternityAid } from '@/types'
import { babyNameLabel, type AidNameFields } from '@/lib/babyNames'
import { STATUS_PILL, type MotherRef } from './maternityStatus'
import RecordModal, { modalBtn, type RecordTone } from '@/components/admin/system/RecordModal'

// כרטסת לידה: הגדרות בלבד, התצוגה ב-RecordModal המשותף.
// ⚠️ אישור, דחייה, הארכת זכאות וטעינת כרטיס מתבצעים בכרטסת המלאה ולא משוכפלים כאן.
// ⚠️ ליולדות אין שרשור התכתבות במסד (שליחת קישור תיקון שם בלבד), ולכן אין לשונית התכתבות.

type Extra = Partial<MaternityAid> & { beneficiary?: (MotherRef & { email?: string; city?: string; address?: string }) | null }

type FixHistory = { requestedAt: string; requestedBy: string | null; notes: string | null; complete: boolean; items: { docType: string; label: string; doneAt: string | null }[] }

const TONE:Record<string, RecordTone> = { pending: 'wait', deep_review: 'chk', active: 'ok', completed: 'ok', cancelled: 'no' }
const STEP_OF: Record<string, number> = { pending: 0, deep_review: 1, active: 2, completed: 3, cancelled: 1 }
const STEPS = ['התקבלה', 'בדיקה', 'מאושרת', 'הושלמה']

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')
const fmtTime = (d?: string | null) => (d ? new Date(d).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const motherName =(m?: MotherRef) => {
  if (!m) return '—'
  if (m.spouse_name) return [m.family_name, m.spouse_name].filter(Boolean).join(' ')
  return [m.family_name, m.full_name].filter(Boolean).join(' ') || '—'
}

export default function MaternityCardModal({ rows, index, onIndex, onClose }: {
  rows: MaternityAid[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const a = rows[index]
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const canEdit = useCan('maternity', 'edit')
  const [now] = useState(() => Date.now())
  const [loaded, setLoaded] = useState<{ id: string; data: Extra } | null>(null)
  const ready = loaded && loaded.id === a.id ? loaded.data : null

  useEffect(() => {
    let alive = true
    createClient().from('maternity_aids')
      .select('*, beneficiary:beneficiaries(email, city, address)')
      .eq('id', a.id).single()
      .then(({ data }) => { if (alive && data) setLoaded({ id: a.id, data: data as unknown as Extra }) })
    return () => { alive = false }
  }, [a.id])

  const [fixes, setFixes] = useState<{ id: string; list: FixHistory[] } | null>(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/admin/maternity/docs-history?aidId=${a.id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d?.history) setFixes({ id: a.id, list: d.history }) })
      .catch(() => {})
    return () => { alive = false }
  }, [a.id])
  const fixList = fixes && fixes.id === a.id ? fixes.list : []

  const m = a.beneficiary as MotherRef | undefined
  const email = ((ready?.beneficiary as { email?: string } | null | undefined)?.email ?? '').trim()
  const merged = { ...a, ...(ready ?? {}) } as MaternityAid
  const baby = babyNameLabel(merged as AidNameFields)
  const days = Math.max(0, Math.floor((now - new Date(a.created_at).getTime()) / 86400000))
  const cert = merged.birth_certificate_url
  const cert2 = merged.birth_certificate_url_2
  const pill = STATUS_PILL[a.status]
  const full = `/admin/maternity/${a.id}`

  // "בקש": שליחת קישור ייחודי ליולדת במייל להשלמת שם התינוק (אותה פעולה של הכרטסת המלאה).
  const askName = async () => {
    if (!(await confirm({ message: 'לשלוח ליולדת במייל קישור להשלמת שם התינוק?' }))) return
    try {
      const res = await fetch('/api/admin/maternity/send-name-fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aidId: a.id }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'השליחה נכשלה')
      toast.success('הקישור נשלח ליולדת')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'השליחה נכשלה') }
  }

  return (<>
    <RecordModal
      kind="לידה"
      crumb={`יולדות / תיק ${a.id.slice(0, 8)}`}
      title={motherName(m)}
      meta={[
        { label: 'ת״ז יולדת', value: m?.spouse_id_number || '—', ltr: true },
        { label: 'תאריך לידה', value: fmt(a.birth_date) },
        { label: 'תינוק', value: baby.text || '—' },
      ]}
      statusLabel={pill?.label ?? a.status}
      statusTone={TONE[a.status] ?? 'wait'}
      stampDate={fmt(a.created_at)}
      facts={[
        { label: 'תיק', value: `#${a.id.slice(0, 6)}`, ltr: true },
        { label: 'תינוקות', value: String(merged.babies?.length || 1) },
        { label: 'תאריך אישור', value: a.approved_at ? fmt(a.approved_at) : '—' },
        { label: 'סוף זכאות', value: fmt(merged.six_weeks_end) },
        { label: 'ימים בטיפול', value: String(days) },
      ]}
      readiness={[
        { label: 'ת״ז הוזנה', ok: !!(m?.spouse_id_number || m?.id_number) },
        { label: 'שם התינוק', ok: !baby.missing && !baby.pending, onAsk: canEdit && !!email ? askName : undefined },
        { label: 'אישור לידה', ok: !!cert },
        { label: 'טלפון', ok: !!m?.phone },
      ]}
      steps={{ labels: STEPS, current: STEP_OF[a.status] ?? 0, rejected: a.status === 'cancelled', dates: [fmt(a.created_at)] }}
      sections={[
        { title: 'פרטי היולדת', fields: [
          { label: 'שם', value: motherName(m) },
          { label: 'ת״ז יולדת', value: m?.spouse_id_number, ltr: true, copy: true, lock: 'נעול' },
          { label: 'שם הבעל', value: m?.full_name },
          { label: 'ת״ז הבעל', value: m?.id_number, ltr: true, copy: true, lock: 'נעול' },
        ] },
        { title: 'יצירת קשר', fields: [
          { label: 'טלפון', value: m?.phone, ltr: true, copy: true },
          { label: 'מייל', value: email, ltr: true, copy: true },
          { label: 'עיר', value: ready?.beneficiary?.city },
          { label: 'כתובת', value: ready?.beneficiary?.address },
        ] },
        { title: 'הלידה וההטבות', wide: true, fields: [
          { label: 'תאריך לידה', value: fmt(a.birth_date) },
          { label: 'שם התינוק', value: baby.text },
          { label: 'כרטיס מזון', value: merged.wants_food_card === false ? 'לא ביקשה' : (merged.card_number ? `שויך · ${merged.card_number}` : 'ביקשה') },
          { label: 'בית החלמה', value: merged.wants_recovery === false ? 'לא ביקשה' : (merged.recovery_home || 'ביקשה') },
          { label: 'תאריך אישור', value: a.approved_at ? fmtTime(a.approved_at) : '—' },
          { label: 'סיבת דחייה', value: merged.rejection_reason, full: true },
        ] },
      ]}
      note={{ title: 'הערת משרד', text: (merged.notes ?? '').trim() }}
      tabs={[
        { key: 'docs', label: 'מסמכים', count: (cert ? 1 : 0) + (cert2 ? 1 : 0), content: !cert && !cert2 ? <p className="mt-4 text-sm text-[#6B6352]">לא צורף אישור לידה</p> : (
          <div className="mt-4 flex flex-wrap gap-2">
            {cert && <a href={cert} target="_blank" rel="noreferrer" className={modalBtn.ghost}><ExternalLink size={16} />אישור לידה</a>}
            {cert2 && <a href={cert2} target="_blank" rel="noreferrer" className={modalBtn.ghost}><ExternalLink size={16} />אישור לידה, תינוק שני</a>}
          </div>
        ) },
        ...(fixList.length ? [{ key: 'fixes', label: 'תיקונים', count: fixList.length, content: (
          <div className="mt-4 flex flex-col gap-3">
            {fixList.map(h => (
              <div key={h.requestedAt} className="rounded-xl border border-line bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-bold text-navy-dark">נשלחה בקשה · {fmtTime(h.requestedAt)}{h.requestedBy ? ` · ${h.requestedBy}` : ''}</span>
                  <span className={h.complete ? 'font-medium text-emerald-700' : 'font-medium text-amber-700'}>{h.complete ? 'כל המסמכים הושלמו' : 'חסרים מסמכים'}</span>
                </div>
                {h.notes && <p className="mt-1 text-xs text-[#6B6352]">{h.notes}</p>}
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {h.items.map(i => (
                    <li key={i.docType} className="flex items-center justify-between gap-2 border-t border-line pt-1">
                      <span>{i.label}</span>
                      <span className={i.doneAt ? 'text-emerald-700' : 'text-amber-700'}>{i.doneAt ? `הושלם · ${fmtTime(i.doneAt)}` : 'טרם הושלם'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) }] : []),
      ]}
      actions={<>
        <Link href={full} title="האישור מתבצע בכרטסת המלאה" className={modalBtn.primary}>טיפול בתיק</Link>
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
