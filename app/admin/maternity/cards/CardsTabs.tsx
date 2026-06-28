'use client'
import { useState } from 'react'
import { Warehouse, CreditCard } from 'lucide-react'
import NedarimFamilies from './NedarimFamilies'

export default function CardsTabs({ internal }: { internal: React.ReactNode }) {
  // בהגעה מקישור "ניהול הכרטיס" (?zeout=...) פותחים ישירות את טאב נדרים קארד
  const [tab, setTab] = useState<'internal' | 'nedarim'>(() => {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search)
      if (p.get('zeout') || p.get('tab') === 'nedarim') return 'nedarim'
    }
    return 'internal'
  })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1 border-b border-slate-200">
        {([
          { id: 'internal', label: 'מוקדי מלאי פנימיים', icon: Warehouse },
          { id: 'nedarim', label: 'נדרים קארד', icon: CreditCard },
        ] as const).map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
                ${active ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <Icon size={16} /> {t.label}
            </button>
          )
        })}
      </div>

      <div className={tab === 'internal' ? '' : 'hidden'}>{internal}</div>
      {tab === 'nedarim' && <NedarimFamilies />}
    </div>
  )
}
