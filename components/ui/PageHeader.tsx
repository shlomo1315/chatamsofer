import { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  children?: ReactNode
}

export default function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-0">
      <div className="flex items-center justify-between gap-4 py-4">
        {/* Right side (RTL start): accent bar + text */}
        <div className="flex items-stretch gap-3 min-w-0">
          <div className="w-[3px] self-stretch rounded-full bg-indigo-500 flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 leading-tight">{title}</h1>
            {subtitle && (
              <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {/* Left side (RTL end): action buttons slot */}
        {children && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {children}
          </div>
        )}
      </div>
      <div className="h-px bg-slate-200" />
    </div>
  )
}
