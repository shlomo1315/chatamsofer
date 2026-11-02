'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Family } from '@/types'
import RecordModal, { modalBtn } from '@/components/admin/system/RecordModal'

// כרטסת משפחה: הגדרות בלבד, התצוגה ב-RecordModal המשותף.
// ⚠️ אין בטבלת המשפחות שרשור הודעות, ולכן לא נבנה כאן.

type Member = { id: string; full_name: string; family_name: string | null; id_number: string | null; phone: string | null; city: string | null }
type FamilyWithCount = Family & { member_count: number }

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')

export default function FamilyCardModal({ rows, index, onIndex, onClose }: {
  rows: FamilyWithCount[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const f = rows[index]
  const [loaded, setLoaded] = useState<{ id: string; members: Member[] } | null>(null)
  const members = loaded && loaded.id === f.id ? loaded.members : null

  useEffect(() => {
    let alive = true
    createClient().from('beneficiaries')
      .select('id, full_name, family_name, id_number, phone, city')
      .eq('family_id', f.id)
      .then(({ data }) => { if (alive && data) setLoaded({ id: f.id, members: data as Member[] }) })
    return () => { alive = false }
  }, [f.id])

  return (
    <RecordModal
      kind="משפחה"
      crumb={`משפחות / ${f.family_name}`}
      title={f.family_name}
      meta={[{ label: 'בני משפחה', value: String(f.member_count) }]}
      statusLabel={f.member_count > 0 ? 'פעילה' : 'ללא בני משפחה'}
      statusTone={f.member_count > 0 ? 'ok' : 'wait'}
      stampDate={fmt(f.created_at)}
      facts={[
        { label: 'בני משפחה', value: String(f.member_count) },
        { label: 'נוצרה', value: fmt(f.created_at) },
        { label: 'עודכנה', value: fmt(f.updated_at) },
      ]}
      sections={[{ title: 'פרטי המשפחה', wide: true, fields: [
        { label: 'שם משפחה', value: f.family_name },
        { label: 'הערות', value: f.notes, full: true },
      ] }]}
      tabs={[{ key: 'members', label: 'בני משפחה', count: f.member_count, content: (
        <ul className="divide-y divide-line text-sm">
          {members === null && <li className="py-6 text-center text-ink-faint">טוען…</li>}
          {members?.length === 0 && <li className="py-6 text-center text-ink-faint">אין בני משפחה משויכים</li>}
          {members?.map(m => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
              <Link href={`/admin/beneficiaries/${m.id}`} className="font-medium text-navy hover:underline">
                {[m.family_name, m.full_name].filter(Boolean).join(' ')}
              </Link>
              <span className="text-ink-soft tabular-nums" dir="ltr">{m.id_number ?? ''}</span>
            </li>
          ))}
        </ul>
      ) }]}
      actions={<Link href={`/admin/families/${f.id}`} className={modalBtn.primary}><ExternalLink size={14} /> לדף המשפחה</Link>}
      index={index}
      total={rows.length}
      onIndex={onIndex}
      onClose={onClose}
    />
  )
}
