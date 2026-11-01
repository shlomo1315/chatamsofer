import { EligibilityStatus, LoanStatus, MaternityStatus, DistributionStatus } from '@/types'

type Status = EligibilityStatus | LoanStatus | MaternityStatus | DistributionStatus | string

const statusConfig: Record<string, { label: string; classes: string; dotColor: string }> = {
  pending:      { label: 'ממתין',                    classes: 'bg-[#FBF1D6] text-[#7A5A12] border-[#EBD9A6]',     dotColor: 'bg-amber-500' },
  approved:     { label: 'מאושר',                    classes: 'bg-[#E0EFE4] text-[#22663A] border-[#BFDDC8]', dotColor: 'bg-emerald-500' },
  rejected:     { label: 'נדחה',                     classes: 'bg-[#F8E3E1] text-[#8E2B22] border-[#EBC1BC]',           dotColor: 'bg-red-500' },
  review:       { label: 'ממתין לאישור מסמכים',       classes: 'bg-[#E3E8F4] text-[#243B73] border-[#C5CFE6]', dotColor: 'bg-violet-500' },
  docs_pending: { label: 'השלמת מסמכים',              classes: 'bg-[#E3E8F4] text-[#243B73] border-[#C5CFE6]',       dotColor: 'bg-blue-500' },
  docs_returned: { label: 'הוחזר תיקון — לבדיקה',      classes: 'bg-[#E3E8F4] text-[#243B73] border-[#C5CFE6]',       dotColor: 'bg-teal-500' },
  active:       { label: 'פעיל',                     classes: 'bg-[#E0EFE4] text-[#22663A] border-[#BFDDC8]', dotColor: 'bg-emerald-500' },
  completed:    { label: 'הושלם',                    classes: 'bg-sand text-ink-soft border-line',       dotColor: 'bg-zinc-400' },
  cancelled:    { label: 'בוטל',                     classes: 'bg-[#F8E3E1] text-[#8E2B22] border-[#EBC1BC]',           dotColor: 'bg-red-500' },
  defaulted:    { label: 'בפיגור',                   classes: 'bg-[#FBE9D6] text-[#8A4A12] border-[#EBCBA6]',  dotColor: 'bg-orange-500' },
  planning:     { label: 'בתכנון',                   classes: 'bg-[#E3E8F4] text-[#243B73] border-[#C5CFE6]',  dotColor: 'bg-purple-500' },
}

interface StatusBadgeProps {
  status: Status
  customLabel?: string
  size?: 'sm' | 'md'
}

export default function StatusBadge({ status, customLabel, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status,
    classes: 'bg-sand text-ink-soft border-line',
    dotColor: 'bg-zinc-400',
  }

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full font-semibold border
        ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs'}
        ${config.classes}
      `}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${config.dotColor}`} />
      {customLabel ?? config.label}
    </span>
  )
}
