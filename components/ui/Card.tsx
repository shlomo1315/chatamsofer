import { ReactNode } from 'react'
import Link from 'next/link'

type AccentColor = 'indigo' | 'violet' | 'blue' | 'emerald' | 'amber' | 'red'

interface CardProps {
  children: ReactNode
  className?: string
  padding?: 'none' | 'sm' | 'md' | 'lg'
  accent?: AccentColor
}

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: ReactNode
  iconBg?: string
  trend?: { value: number; label: string }
  href?: string
}

const accentBorder: Record<AccentColor, string> = {
  indigo:  'border-t-[3px] border-t-navy',
  violet:  'border-t-[3px] border-t-navy',
  blue:    'border-t-[3px] border-t-navy',
  emerald: 'border-t-[3px] border-t-emerald-700',
  amber:   'border-t-[3px] border-t-gold',
  red:     'border-t-[3px] border-t-red-700',
}

// כרטיס v4: משטח בז' עם מסגרת דקה, בלי צל כבד.
const SOFT_SHADOW = 'shadow-[0_1px_2px_rgba(20,33,61,0.05)]'

export default function Card({ children, className = '', padding = 'md', accent }: CardProps) {
  const padClasses = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' }
  return (
    <div
      className={`
        bg-white rounded-[12px] border border-line ${SOFT_SHADOW}
        ${accent ? accentBorder[accent] : ''}
        ${padClasses[padding]}
        ${className}
      `}
    >
      {children}
    </div>
  )
}

export function StatCard({ title, value, subtitle, icon, iconBg, trend, href }: StatCardProps) {
  const iconContainer = iconBg ?? 'bg-navy'
  const iconEl = (
    <div className={`flex-shrink-0 rounded-[10px] p-3 ${iconContainer} flex items-center justify-center`}>
      <span className="[&>svg]:text-white [&>svg]:stroke-white">{icon}</span>
    </div>
  )

  const inner = (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-soft truncate">{title}</p>
        <p className="mt-1 text-2xl font-bold text-navy ltr-num">{value}</p>
        {subtitle && <p className="mt-1 text-xs text-ink-soft">{subtitle}</p>}
        {trend && (
          <p className={`mt-1 text-xs font-medium ${trend.value >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
          </p>
        )}
      </div>
      {iconEl}
    </div>
  )

  if (href) {
    return (
      <Link
        href={href}
        className={`block bg-white rounded-[12px] border border-line ${SOFT_SHADOW} p-5 transition-colors hover:border-gold group`}
      >
        {inner}
        <p className="mt-2 text-xs text-gold opacity-0 group-hover:opacity-100 transition-opacity">לחץ לצפייה ←</p>
      </Link>
    )
  }

  return (
    <div className={`bg-white rounded-[12px] border border-line ${SOFT_SHADOW} p-5`}>
      {inner}
    </div>
  )
}
