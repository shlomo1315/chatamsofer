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
  indigo:  'border-t-[3px] border-t-indigo-500',
  violet:  'border-t-[3px] border-t-violet-500',
  blue:    'border-t-[3px] border-t-blue-500',
  emerald: 'border-t-[3px] border-t-emerald-500',
  amber:   'border-t-[3px] border-t-amber-500',
  red:     'border-t-[3px] border-t-red-500',
}

// צל מרובד עדין שנותן תחושת עומק "תלת-מימדי" נקייה ומקצועית.
const SOFT_SHADOW = 'shadow-[0_1px_2px_rgba(15,23,42,0.04),0_2px_8px_rgba(15,23,42,0.04),0_12px_28px_-12px_rgba(15,23,42,0.12)]'

export default function Card({ children, className = '', padding = 'md', accent }: CardProps) {
  const padClasses = { none: '', sm: 'p-4', md: 'p-5', lg: 'p-6' }
  return (
    <div
      className={`
        bg-white rounded-2xl border border-slate-200/80 ${SOFT_SHADOW}
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
  const iconContainer = iconBg ?? 'bg-gradient-to-br from-indigo-500 to-violet-600'
  const iconEl = (
    <div className={`flex-shrink-0 rounded-2xl p-3 ${iconContainer} flex items-center justify-center shadow-[0_6px_14px_-4px_rgba(79,70,229,0.5)]`}>
      <span className="[&>svg]:text-white [&>svg]:stroke-white">{icon}</span>
    </div>
  )

  const inner = (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-500 truncate">{title}</p>
        <p className="mt-1 text-2xl font-bold text-zinc-900 ltr-num">{value}</p>
        {subtitle && <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>}
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
        className={`block bg-white rounded-2xl border border-slate-200/80 ${SOFT_SHADOW} p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-[0_4px_12px_rgba(15,23,42,0.08),0_18px_36px_-16px_rgba(79,70,229,0.35)] group`}
      >
        {inner}
        <p className="mt-2 text-xs text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity">לחץ לצפייה ←</p>
      </Link>
    )
  }

  return (
    <div className={`bg-white rounded-2xl border border-slate-200/80 ${SOFT_SHADOW} p-5`}>
      {inner}
    </div>
  )
}
