'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Beneficiary, ELIGIBILITY_LABELS } from '@/types'
import { registrationSourceLabel } from '@/lib/distributionSources'
import RecordModal, { modalBtn, type RecordTone } from '@/components/admin/system/RecordModal'

// כרטסת צאצא: הגדרות בלבד, התצוגה והמקלדת ב-RecordModal המשותף.
// ⚠️ ילדים ושרשרת יוחסין לא נטענים עם הרשימה (שדות כבדים), לכן נשלפים כאן לפי המזהה.
// ⚠️ אישור והעברה לבדיקה מעמיקה מתבצעים בכרטסת המלאה: שם רצה האזהרה על אישור
// אבות ממתינים, שליחת המייל וסנכרון נדרים. אין לשכפל את הלוגיקה הזו כאן.

type Extra = Pick<Beneficiary, 'children' | 'lineage_chain' | 'notes'>
type Log = { id: string; action: string; created_at: string }

const TONE: Record<string, RecordTone> = {
  pending: 'wait', review: 'chk', docs_pending: 'chk', docs_returned: 'chk',
  deep_review: 'chk', approved: 'ok', rejected: 'no',
}
const STEPS = ['נרשם', 'אישור ראשוני', 'בדיקה מעמיקה', 'מאושר']
const STEP_OF: Record<string, number> = {
  pending: 1, review: 1, docs_pending: 1, docs_returned: 1, deep_review: 2, approved: 3, rejected: 2,
}

const fullName = (b: Beneficiary) => [b.family_name, b.full_name].filter(Boolean).join(' ') || b.full_name
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')

const Empty = ({ children }: { children: React.ReactNode }) => <p className="mt-4 text-sm text-[#6B6352]">{children}</p>

export default function BeneficiaryCardModal({ rows, index, onIndex, onClose }: {
  rows: Beneficiary[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const b = rows[index]
  const [loaded, setLoaded] = useState<{ id: string; data: Extra; log: Log[] } | null>(null)
  const ready = loaded && loaded.id === b.id ? loaded : null

  useEffect(() => {
    let alive = true
    const sb = createClient()
    Promise.all([
      sb.from('beneficiaries').select('children, lineage_chain, notes').eq('id', b.id).single(),
      sb.from('activity_log').select('id, action, created_at').eq('entity_id', b.id).order('created_at', { ascending: false }).limit(30),
    ]).then(([a, l]) => {
      if (alive && a.data) setLoaded({ id: b.id, data: a.data as Extra, log: (l.data as Log[] | null) ?? [] })
    })
    return () => { alive = false }
  }, [b.id])

  const status = b.eligibility_status
  const children = ready?.data.children ?? []
  const chain = [...(ready?.data.lineage_chain ?? [])].sort((x, y) => x.generation - y.generation)
  const href = `/admin/beneficiaries/${b.id}`
  const loading = <Empty>טוען…</Empty>

  return (
    <RecordModal
      kind="צאצא"
      title={fullName(b)}
      subtitle={[b.city, b.marital_status].filter(Boolean).join(' · ') || undefined}
      statusLabel={ELIGIBILITY_LABELS[status as keyof typeof ELIGIBILITY_LABELS] ?? status}
      statusTone={TONE[status] ?? 'wait'}
      summary={[
        { label: 'ת״ז', value: b.id_number || '—' },
        { label: 'נרשם', value: fmt(b.created_at) },
        { label: 'אופן רישום', value: registrationSourceLabel(b.registration_source) || '—' },
        { label: 'ילדים', value: String(b.children_count ?? 0) },
      ]}
      steps={{ labels: STEPS, current: STEP_OF[status] ?? 1, rejected: status === 'rejected' }}
      sections={[
        { title: 'פרטים אישיים', fields: [
          { label: 'שם מלא', value: fullName(b), lock: 'שינוי בבקשה' },
          { label: 'ת״ז', value: b.id_number, ltr: true, lock: 'נעול' },
          { label: 'מצב משפחתי', value: b.marital_status },
        ] },
        { title: 'יצירת קשר', fields: [
          { label: 'טלפון', value: b.phone, ltr: true },
          { label: 'מייל', value: b.email, ltr: true },
          { label: 'עיר', value: b.city },
        ] },
        { title: 'בת זוג', fields: [
          { label: 'שם', value: b.spouse_name },
          { label: 'ת״ז', value: b.spouse_id_number, ltr: true },
        ] },
      ]}
      note={{ title: 'הערת משרד', text: (ready?.data.notes ?? b.notes ?? '').trim() }}
      tabs={[
        { key: 'children', label: 'ילדים', count: b.children_count ?? 0, content: !ready ? loading : children.length === 0 ? <Empty>אין פרטי ילדים</Empty> : (
          <div className="mt-4 flex flex-wrap gap-2">
            {children.map((c, i) => <span key={i} className="rounded-full border border-[#E6DFCF] bg-white px-3 py-1 text-[13px] text-[#1B2338]">{c.name || '[להשלים]'}</span>)}
          </div>
        ) },
        { key: 'lineage', label: 'שרשרת יוחסין', content: !ready ? loading : chain.length === 0 ? <Empty>לא נקבעה שרשרת</Empty> : (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm font-medium text-[#14213D]">
            {chain.map((c, i) => <span key={i} className="flex items-center gap-2">{i > 0 && <span className="text-[#C0912F]">‹</span>}{c.name}</span>)}
          </div>
        ) },
        { key: 'history', label: 'היסטוריה', content: !ready ? loading : ready.log.length === 0 ? <Empty>אין פעולות מתועדות</Empty> : (
          <div className="mt-4 border-r-2 border-[#E6DFCF] pr-4">
            {ready.log.map((l) => <div key={l.id} className="py-2 text-[13px] text-[#6B6352]"><b className="font-medium text-[#1B2338]">{fmt(l.created_at)}</b> · {l.action}</div>)}
          </div>
        ) },
      ]}
      actions={<>
        <Link href={href} title="האישור והבדיקה המעמיקה מתבצעים בכרטסת המלאה" className={modalBtn.primary}><Check size={18} />אישור</Link>
        <Link href={href} title="הבדיקה המעמיקה מתבצעת בכרטסת המלאה" className={modalBtn.ghost}>העבר לבדיקה מעמיקה</Link>
        <Link href={href} className={modalBtn.ghost}>פתיחת כרטסת מלאה</Link>
      </>}
      index={index}
      total={rows.length}
      onIndex={onIndex}
      onClose={onClose}
    />
  )
}
