'use client'
import { useState, useEffect } from 'react'
import { Warehouse, CreditCard, PackageOpen } from 'lucide-react'
import NedarimFamilies from './NedarimFamilies'
import UnloadsPanel from './UnloadsPanel'
import { useIsAdmin } from '@/components/StaffPermissions'

export default function CardsTabs({ internal }: { internal: React.ReactNode }) {
  const [tab, setTab] = useState<'internal' | 'nedarim' | 'unloads'>('internal')
  // 🔒 לשוניות הכסף (מלאי ופריקות) למנהל בלבד — הן חושפות סכומים
  // שחזרו לקופה ומלאי ארגוני. ⚠️ ההסתרה כאן משלימה את הגנת השרת
  // ואינה מחליפה אותה.
  const isAdmin = useIsAdmin()
  // בהגעה מקישור "ניהול הכרטיס" (?zeout=...) פותחים ישירות את טאב נדרים קארד.
  // נעשה ב-useEffect (צד-לקוח) — ב-SSR אין window, ולכן initializer לבדו לא מספיק.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    if (p.get('zeout') || p.get('tab') === 'nedarim') setTab('nedarim')
    else if (p.get('tab') === 'unloads' && isAdmin) setTab('unloads')
    // ⚠️ מי שאינו מנהל אינו רואה את לשונית המלאי, ולכן ברירת המחדל
    // 'internal' הייתה מציגה לו מסך ריק לגמרי.
    else if (!isAdmin) setTab('nedarim')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-1 border-b border-slate-200">
        {([
          ...(isAdmin ? [{ id: 'internal' as const, label: 'מוקדי מלאי פנימיים', icon: Warehouse }] : []),
          { id: 'nedarim' as const, label: 'נדרים קארד', icon: CreditCard },
          ...(isAdmin ? [{ id: 'unloads' as const, label: 'פריקות', icon: PackageOpen }] : []),
        ]).map(t => {
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

      {isAdmin && <div className={tab === 'internal' ? '' : 'hidden'}>{internal}</div>}
      {tab === 'nedarim' && <NedarimFamilies />}
      {isAdmin && tab === 'unloads' && <UnloadsPanel />}
    </div>
  )
}
