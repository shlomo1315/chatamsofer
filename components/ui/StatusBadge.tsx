import { EligibilityStatus, LoanStatus, MaternityStatus, DistributionStatus } from '@/types'

type Status = EligibilityStatus | LoanStatus | MaternityStatus | DistributionStatus | string

const statusConfig: Record<string, { label: string; classes: string; dotColor: string }> = {
  pending:      { label: 'ממתין',                    classes: 'bg-amber-100 text-amber-800 ring-amber-200',     dotColor: 'bg-amber-500' },
  approved:     { label: 'מאושר',                    classes: 'bg-green-100 text-green-800 ring-green-200',     dotColor: 'bg-green-500' },
  rejected:     { label: 'נדחה',                     classes: 'bg-red-100 text-red-800 ring-red-200',           dotColor: 'bg-red-500' },
  review:       { label: 'ממתין לאישור מסמכים',       classes: 'bg-violet-100 text-violet-800 ring-violet-200', dotColor: 'bg-violet-500' },
  docs_pending: { label: 'השלמת מסמכים',              classes: 'bg-indigo-100 text-indigo-800 ring-indigo-200', dotColor: 'bg-indigo-500' },
  active:       { label: 'פעיל',                     classes: 'bg-green-100 text-green-800 ring-green-200',     dotColor: 'bg-green-500' },
  completed:    { label: 'הושלם',                    classes: 'bg-slate-100 text-slate-700 ring-slate-200',     dotColor: 'bg-slate-400' },
  cancelled:    { label: 'בוטל',                     classes: 'bg-red-100 text-red-800 ring-red-200',           dotColor: 'bg-red-500' },
  defaulted:    { label: 'בפיגור',                   classes: 'bg-orange-100 text-orange-800 ring-orange-200',  dotColor: 'bg-orange-500' },
  planning:     { label: 'בתכנון',                   classes: 'bg-purple-100 text-purple-800 ring-purple-200',  dotColor: 'bg-purple-500' },
}

interface StatusBadgeProps {
  status: Status
  customLabel?: string
  size?: 'sm' | 'md'
}

export default function StatusBadge({ status, customLabel, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status] ?? {
    label: status,
    classes: 'bg-slate-100 text-slate-700 ring-slate-200',
    dotColor: 'bg-slate-400',
  }

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full font-medium ring-1
        ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs'}
        ${config.classes}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${config.dotColor}`} />
      {customLabel ?? config.label}
    </span>
  )
}
