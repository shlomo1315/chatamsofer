import { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  children?: ReactNode
}

export default function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-0">
      <div className="flex items-center justify-between gap-4 py-5">
        {/* Right side (RTL start): gradient accent bar + text */}
        <div className="flex items-stretch gap-3 min-w-0">
          <div className="w-[3px] self-stretch rounded-full bg-gradient-to-b from-blue-500 to-indigo-600 flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-[1.65rem] font-bold text-zinc-900 leading-tight tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>
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
      <div className="h-px bg-gradient-to-l from-transparent via-slate-200 to-transparent" />
    </div>
  )
}
