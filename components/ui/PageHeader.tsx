import { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  children?: ReactNode
}

// כותרת מסך אחידה (v4): ללא גרדיאנט, קו זהב דק מתחת.
export default function PageHeader({ title, subtitle, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-0">
      <div className="flex items-center justify-between gap-4 py-5">
        <div className="flex items-stretch gap-3 min-w-0">
          <div className="w-[3px] self-stretch rounded-full bg-gold flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-[1.65rem] font-bold text-navy leading-tight tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-ink-soft mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {children && <div className="flex items-center gap-2 flex-shrink-0">{children}</div>}
      </div>
      <div className="h-px bg-line" />
    </div>
  )
}
