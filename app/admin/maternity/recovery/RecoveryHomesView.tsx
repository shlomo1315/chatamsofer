'use client'
import { useState, useMemo } from 'react'
import { Home, Clock, CheckCircle2 } from 'lucide-react'
import type { MaternityAid } from '@/types'
import MaternityTable from '../MaternityTable'

// פעיל = בתוך 6 שבועות מהלידה (six_weeks_end בעתיד); לא פעיל = כבר עבר.
function isWithinSixWeeks(aid: MaternityAid): boolean {
  const end = aid.six_weeks_end
    ? new Date(aid.six_weeks_end)
    : (aid.birth_date ? new Date(new Date(aid.birth_date).getTime() + 42 * 86400000) : null)
  if (!end) return false
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return end >= today
}

export default function RecoveryHomesView({ aids, homes }: { aids: MaternityAid[]; homes: string[] }) {
  const [home, setHome] = useState<string>('all')
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active')

  // איחוד בתי החלמה מהרשימה + מה שמופיע בפועל ברשומות
  const allHomes = useMemo(() => {
    const set = new Set<string>(homes)
    aids.forEach(a => { if (a.recovery_home) set.add(a.recovery_home) })
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'he'))
  }, [homes, aids])

  const byHome = useMemo(() => (home === 'all' ? aids : aids.filter(a => a.recovery_home === home)), [aids, home])

  const filtered = useMemo(() => byHome.filter(a => {
    if (status === 'all') return true
    const active = isWithinSixWeeks(a)
    return status === 'active' ? active : !active
  }), [byHome, status])

  const activeCount = byHome.filter(isWithinSixWeeks).length
  const inactiveCount = byHome.length - activeCount

  return (
    <div className="flex flex-col gap-4">
      {/* שורה אחת: טאבי בתי החלמה | סינון פעיל/לא פעיל */}
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={() => setHome('all')}
          className={`text-sm font-medium px-4 py-2 rounded-xl border transition-colors ${home === 'all' ? 'bg-pink-100 text-pink-800 border-pink-300' : 'bg-white text-slate-600 border-slate-200 hover:border-pink-200'}`}>
          כל בתי ההחלמה <span className="opacity-70">{aids.length}</span>
        </button>
        {allHomes.map(h => {
          const cnt = aids.filter(a => a.recovery_home === h).length
          return (
            <button key={h} onClick={() => setHome(h)}
              className={`inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl border transition-colors ${home === h ? 'bg-pink-100 text-pink-800 border-pink-300' : 'bg-white text-slate-600 border-slate-200 hover:border-pink-200'}`}>
              <Home size={14} /> {h} <span className="opacity-70">{cnt}</span>
            </button>
          )
        })}

        {/* מפריד */}
        <div className="h-7 w-px bg-slate-300 mx-2" />

        {([
          { key: 'active', label: 'פעיל (בתוך 6 שבועות)', count: activeCount, icon: CheckCircle2, sel: 'bg-green-100 text-green-800 border-green-400' },
          { key: 'inactive', label: 'לא פעיל (עבר 6 שבועות)', count: inactiveCount, icon: Clock, sel: 'bg-red-100 text-red-800 border-red-400' },
          { key: 'all', label: 'הכל', count: byHome.length, icon: null, sel: 'bg-slate-200 text-slate-800 border-slate-400' },
        ] as const).map(s => {
          const sel = status === s.key
          const Icon = s.icon
          return (
            <button key={s.key} onClick={() => setStatus(s.key)}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${sel ? s.sel : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
              {Icon && <Icon size={13} />} {s.label} <span className="opacity-70">{s.count}</span>
            </button>
          )
        })}
      </div>

      <MaternityTable data={filtered} hideFilters />
    </div>
  )
}
