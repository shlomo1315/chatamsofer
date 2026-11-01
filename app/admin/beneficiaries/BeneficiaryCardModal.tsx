'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, ChevronRight, ChevronLeft, ShieldCheck, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Beneficiary, ELIGIBILITY_LABELS } from '@/types'
import { registrationSourceLabel } from '@/lib/distributionSources'

// כרטסת צאצא כפופאפ באמצע המסך — הרשימה מאחוריה מטושטשת. בטלפון עולה מלמטה.
// ⚠️ ילדים ושרשרת יוחסין לא נטענים עם הרשימה (שדות כבדים), לכן נשלפים כאן לפי המזהה.
// ⚠️ אישור והעברה לבדיקה מעמיקה מתבצעים בכרטסת המלאה: שם רצה האזהרה על אישור
// אבות ממתינים, שליחת המייל וסנכרון נדרים. אין לשכפל את הלוגיקה הזו כאן.

type Extra = Pick<Beneficiary, 'children' | 'lineage_chain' | 'notes'>

const STATUS_BAR: Record<string, string> = {
  approved: 'bg-[#E7F4EC] text-[#17663F] border-[#BFE0CC]',
  rejected: 'bg-[#FBE9E9] text-[#A32020] border-[#F0C4C4]',
  deep_review: 'bg-[#FCEBDD] text-[#A8470F] border-[#F2CDB0]',
}
const BAR_DEFAULT = 'bg-[#FDF3E1] text-[#9A5B00] border-[#F1DDB8]'

const fullName = (b: Beneficiary) => [b.family_name, b.full_name].filter(Boolean).join(' ') || b.full_name

function Box({ title, wide, children }: { title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-[#E7E3DB] ${wide ? 'md:col-span-2' : ''}`}>
      <h3 className="border-b border-[#F0EDE7] bg-[#FCFAF6] px-4 py-3 text-[13px] font-bold text-[#A9824A]">{title}</h3>
      {children}
    </div>
  )
}

function Row({ label, value, ltr }: { label: string; value?: string | null; ltr?: boolean }) {
  return (
    <div className="flex gap-3 border-b border-[#F0EDE7] px-4 py-3 last:border-0">
      <dt className="w-24 flex-none text-sm text-[#5F6470]">{label}</dt>
      <dd dir={ltr ? 'ltr' : undefined} className={`min-w-0 break-words font-semibold text-[#14213D] tabular-nums ${ltr ? 'text-right' : ''}`}>
        {value || '—'}
      </dd>
    </div>
  )
}

export default function BeneficiaryCardModal({ rows, index, onIndex, onClose }: {
  rows: Beneficiary[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const b = rows[index]
  const [loaded, setLoaded] = useState<{ id: string; data: Extra } | null>(null)
  const extra = loaded && loaded.id === b.id ? loaded.data : null
  const n = rows.length

  useEffect(() => {
    let alive = true
    createClient().from('beneficiaries').select('children, lineage_chain, notes').eq('id', b.id).single()
      .then(({ data }) => { if (alive && data) setLoaded({ id: b.id, data: data as Extra }) })
    return () => { alive = false }
  }, [b.id])

  useEffect(() => {
    const go = (s: number) => onIndex((index + s + n) % n)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      // RTL: חץ שמאלה = הבא, ימינה = הקודם
      else if (e.key === 'ArrowLeft') go(1)
      else if (e.key === 'ArrowRight') go(-1)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [index, n, onIndex, onClose])

  const status = b.eligibility_status
  const children = extra?.children ?? []
  const chain = [...(extra?.lineage_chain ?? [])].sort((x, y) => x.generation - y.generation)
  const href = `/admin/beneficiaries/${b.id}`
  const notes = (extra?.notes ?? b.notes ?? '').trim()

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-[#14213D]/30 backdrop-blur-[10px] md:place-items-center md:p-8"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[20px] bg-white shadow-[0_2px_6px_rgba(20,33,61,.08),0_32px_80px_rgba(20,33,61,.32)] md:max-h-[calc(100vh-64px)] md:max-w-[980px] md:rounded-[20px]">
        <div className="flex flex-none items-center gap-4 bg-[#14213D] px-4 py-5 text-white md:px-8 md:py-7">
          <div className="grid h-14 w-14 flex-none place-items-center rounded-full border-[1.5px] border-[#A9824A] text-[22px] font-bold text-[#E8D9BC] md:h-[72px] md:w-[72px] md:text-[28px]">
            {fullName(b).charAt(0)}
          </div>
          <div className="min-w-0">
            <h2 className="text-[22px] font-bold leading-tight md:text-[28px]">{fullName(b)}</h2>
            <p className="mt-1 text-sm text-[#B9C0D0] tabular-nums">
              ת״ז {b.id_number || '—'}{b.city ? ` · ${b.city}` : ''}{b.marital_status ? ` · ${b.marital_status}` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="סגירה" className="mr-auto grid h-11 w-11 flex-none place-items-center rounded-[10px] text-[#B9C0D0] hover:bg-white/10 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className={`flex flex-none items-center gap-2.5 border-b px-4 py-3 text-sm font-medium md:px-8 ${STATUS_BAR[status] ?? BAR_DEFAULT}`}>
          <ShieldCheck size={18} />
          {ELIGIBILITY_LABELS[status as keyof typeof ELIGIBILITY_LABELS] ?? status}
          {b.registration_source ? ` · ${registrationSourceLabel(b.registration_source)}` : ''}
        </div>

        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-3 md:px-8 md:pb-7 md:pt-6">
            <Box title="פרטים אישיים">
              <dl>
                <Row label="טלפון" value={b.phone} ltr />
                <Row label="מייל" value={b.email} ltr />
                <Row label="עיר" value={b.city} />
                <Row label="מצב משפחתי" value={b.marital_status} />
              </dl>
            </Box>
            <Box title="בת זוג">
              <dl>
                <Row label="שם" value={b.spouse_name} />
                <Row label="ת״ז" value={b.spouse_id_number} ltr />
                <Row label="אופן רישום" value={registrationSourceLabel(b.registration_source)} />
              </dl>
            </Box>
            <Box title={`ילדים · ${b.children_count ?? 0}`}>
              <div className="flex flex-wrap gap-2 p-4">
                {!extra && <span className="text-sm text-[#5F6470]">טוען…</span>}
                {extra && children.length === 0 && <span className="rounded-full border border-[#E7E3DB] px-3 py-1 text-[13px] text-[#5F6470]">אין פרטי ילדים</span>}
                {children.map((c, i) => (
                  <span key={i} className="rounded-full border border-[#E7E3DB] px-3 py-1 text-[13px] text-[#5F6470]">{c.name || '[להשלים]'}</span>
                ))}
              </div>
            </Box>
            <Box title="שרשרת יוחסין" wide>
              <div className="flex flex-wrap items-center gap-2 p-4 text-sm font-semibold text-[#14213D]">
                {!extra && <span className="font-normal text-[#5F6470]">טוען…</span>}
                {extra && chain.length === 0 && <span className="font-normal text-[#5F6470]">לא נקבעה שרשרת</span>}
                {chain.map((c, i) => (
                  <span key={i} className="flex items-center gap-2">
                    {i > 0 && <span className="text-[#A9824A]">‹</span>}
                    {c.name}
                  </span>
                ))}
              </div>
            </Box>
            <Box title="הערות משרד">
              <div className="p-4">
                <span className={`inline-block whitespace-pre-line rounded-[14px] border border-[#E7E3DB] px-3 py-1 text-[13px] text-[#5F6470] ${notes ? 'text-[#14213D]' : ''}`}>
                  {notes || 'אין הערות'}
                </span>
              </div>
            </Box>
          </div>
        </div>

        <div className="flex flex-none flex-wrap items-center gap-2.5 border-t border-[#E7E3DB] bg-[#FCFBF8] px-4 py-4 md:px-8">
          <div className="flex items-center gap-1.5 text-sm text-[#5F6470] tabular-nums">
            <button onClick={() => onIndex((index - 1 + n) % n)} aria-label="הקודם" className="grid h-10 w-10 place-items-center rounded-[9px] border border-[#E7E3DB] bg-white hover:border-[#14213D]">
              <ChevronRight size={18} />
            </button>
            {index + 1} מתוך {n}
            <button onClick={() => onIndex((index + 1) % n)} aria-label="הבא" className="grid h-10 w-10 place-items-center rounded-[9px] border border-[#E7E3DB] bg-white hover:border-[#14213D]">
              <ChevronLeft size={18} />
            </button>
            <span className="mr-2 hidden text-xs text-[#8A8F99] md:inline">חיצים במקלדת · Esc לסגירה</span>
          </div>
          <div className="flex w-full gap-2.5 md:mr-auto md:w-auto">
            <Link href={href} title="הבדיקה המעמיקה מתבצעת בכרטסת המלאה" className="inline-flex h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border border-[#E7E3DB] bg-white px-3 font-semibold text-[#14213D] hover:border-[#cfc8bb] md:flex-none">
              העבר לבדיקה מעמיקה
            </Link>
            <Link href={href} title="האישור והבדיקה המעמיקה מתבצעים בכרטסת המלאה" className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-[#17663F] px-4 font-semibold text-white hover:bg-[#105232] md:flex-none">
              <Check size={18} />
              אישור
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
