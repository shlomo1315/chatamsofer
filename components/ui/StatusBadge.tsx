import { EligibilityStatus, LoanStatus, MaternityStatus, DistributionStatus } from '@/types'

type Status = EligibilityStatus | LoanStatus | MaternityStatus | DistributionStatus | string

const statusConfig: Record<string, { label: string; classes: string; dotColor: string }> = {
  pending:      { label: 'ממתין',                    classes: 'bg-amber-50 text-amber-700 border-amber-200',     dotColor: 'bg-amber-500' },
  approved:     { label: 'מאושר',                    classes: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotColor: 'bg-emerald-500' },
  rejected:     { label: 'נדחה',                     classes: 'bg-red-50 text-red-700 border-red-200',           dotColor: 'bg-red-500' },
  review:       { label: 'ממתין לאישור מסמכים',       classes: 'bg-violet-50 text-violet-700 border-violet-200', dotColor: 'bg-violet-500' },
  docs_pending: { label: 'השלמת מסמכים',              classes: 'bg-blue-50 text-blue-700 border-blue-200',       dotColor: 'bg-blue-500' },
  active:       { label: 'פעיל',                     classes: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotColor: 'bg-emerald-500' },
  completed:    { label: 'הושלם',                    classes: 'bg-zinc-100 text-zinc-600 border-zinc-200',       dotColor: 'bg-zinc-400' },
  cancelled:    { label: 'בוטל',                     classes: 'bg-red-50 text-red-700 border-red-200',           dotColor: 'bg-red-500' },
  defaulted:    { label: 'בפיגור',                   classes: 'bg-orange-50 text-orange-700 border-orange-200',  dotColor: 'bg-orange-500' },
  planning:     { label: 'בתכנון',                   classes: 'bg-purple-50 text-purple-700 border-purple-200',  dotColor: 'bg-purple-500' },
}

interface StatusBadgeProps {
  status: Status
  customLabel?: string
  size?: 'sm' | 'md'
}

export default function StatusBadge({ status, customLabel, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status,
    classes: 'bg-zinc-100 text-zinc-600 border-zinc-200',
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
