'use client'
import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

// כרטיס מתקפל — כותרת לחיצה שמרחיבה/מצמצמת את התוכן. headerRight מוצג לצד הכותרת (מחוץ לכפתור).
export default function Collapsible({
  title, icon, defaultOpen = false, headerRight, children,
}: {
  title: string
  icon?: ReactNode
  defaultOpen?: boolean
  headerRight?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-3.5">
        <button type="button" onClick={() => setOpen(o => !o)} className="flex items-center gap-2 flex-1 text-right">
          {icon}
          <span className="text-xs font-semibold text-slate-500 uppercase">{title}</span>
          <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {headerRight}
      </div>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  )
}
