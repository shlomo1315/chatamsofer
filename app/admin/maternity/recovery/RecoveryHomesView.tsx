'use client'
import { useState, useMemo } from 'react'
import { Home, Clock, CheckCircle2, Star } from 'lucide-react'
import type { MaternityAid } from '@/types'
import MaternityTable from '../MaternityTable'
import { isWithinRecoveryWindow } from '@/lib/maternity'

// פעיל = בתוך חלון הזכאות לבית החלמה (5 שבועות מהלידה — לא 6, שזה הכרטיס).

export type HomeRating = { avg: number; count: number }

// צבע הציון: 8+ מצוין, 6-8 סביר, מתחת ל-6 טעון שיפור
function ratingColor(avg: number): string {
  if (avg >= 8) return 'text-emerald-600'
  if (avg >= 6) return 'text-amber-600'
  return 'text-rose-600'
}

export default function RecoveryHomesView({ aids, homes, ratings = {} }: {
  aids: MaternityAid[]; homes: string[]; ratings?: Record<string, HomeRating>
}) {
  const [home, setHome] = useState<string>('all')
  const [status, setStatus] = useState<'active' | 'inactive' | 'all'>('active')
  const [arrivedFilter, setArrivedFilter] = useState<'all' | 'arrived' | 'not' | 'pending'>('all')

  // איחוד בתי החלמה מהרשימה + מה שמופיע בפועל ברשומות
  const allHomes = useMemo(() => {
    const set = new Set<string>(homes)
    aids.forEach(a => { if (a.recovery_home) set.add(a.recovery_home) })
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, 'he'))
  }, [homes, aids])

  const matchStatus = (a: MaternityAid) => {
    if (status === 'all') return true
    const active = isWithinRecoveryWindow(a)
    return status === 'active' ? active : !active
  }
  const matchHome = (a: MaternityAid) => home === 'all' || a.recovery_home === home

  // היקף נוכחי לפי בית החלמה + פעילות (לפני סינון הגעה)
  const scoped = useMemo(() => aids.filter(a => matchHome(a) && matchStatus(a)), [aids, home, status])

  // פילוח הגעה על ההיקף הנוכחי
  const arrivedCounts = {
    all: scoped.length,
    arrived: scoped.filter(a => a.recovery_arrived === true).length,
    not: scoped.filter(a => a.recovery_arrived === false).length,
    pending: scoped.filter(a => a.recovery_arrived !== true && a.recovery_arrived !== false).length,
  }
  const matchArrived = (a: MaternityAid) => {
    if (arrivedFilter === 'all') return true
    if (arrivedFilter === 'arrived') return a.recovery_arrived === true
    if (arrivedFilter === 'not') return a.recovery_arrived === false
    return a.recovery_arrived !== true && a.recovery_arrived !== false
  }
  const filtered = scoped.filter(matchArrived)

  // ספירת טאבי בתי החלמה — מכבדת את סינון הסטטוס הנוכחי (עקביות עם התוצאות)
  const homeCount = (h?: string) => aids.filter(a => (h ? a.recovery_home === h : true) && matchStatus(a)).length

  // ספירת פעיל/לא פעיל — מכבדת את בית החלמה הנבחר
  const byHome = useMemo(() => aids.filter(matchHome), [aids, home])
  const activeCount = byHome.filter(isWithinRecoveryWindow).length
  const inactiveCount = byHome.length - activeCount

  return (
    <div className="flex flex-col gap-4">
      {/* שורה אחת: טאבי בתי החלמה | סינון פעיל/לא פעיל */}
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={() => setHome('all')}
          className={`text-sm font-medium px-4 py-2 rounded-xl border transition-colors ${home === 'all' ? 'bg-pink-100 text-pink-800 border-pink-300' : 'bg-white text-slate-600 border-slate-200 hover:border-pink-200'}`}>
          כל בתי ההחלמה <span className="opacity-70">{homeCount()}</span>
        </button>
        {allHomes.map(h => {
          const cnt = homeCount(h)
          const rating = ratings[h]
          return (
            <button key={h} onClick={() => setHome(h)}
              className={`inline-flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl border transition-colors ${home === h ? 'bg-pink-100 text-pink-800 border-pink-300' : 'bg-white text-slate-600 border-slate-200 hover:border-pink-200'}`}>
              <Home size={14} /> {h} <span className="opacity-70">{cnt}</span>
              {rating && (
                // ציון המשוב מהיולדות ששהו כאן — ממוצע כל הציונים
                <span
                  className={`inline-flex items-center gap-0.5 mr-1 pr-2 border-r border-slate-200 font-bold ${ratingColor(rating.avg)}`}
                  title={`ציון ממוצע מ-${rating.count} תשובות`}
                >
                  <Star size={12} className="fill-current" />
                  {rating.avg}
                </span>
              )}
            </button>
          )
        })}

      </div>

      {/* שורה נפרדת מתחת: פעיל / לא פעיל */}
      <div className="flex gap-2 flex-wrap">
        {([
          { key: 'active', label: 'פעיל (בתוך 5 שבועות)', count: activeCount, icon: CheckCircle2, sel: 'bg-green-100 text-green-800 border-green-400' },
          { key: 'inactive', label: 'לא פעיל (עבר 5 שבועות)', count: inactiveCount, icon: Clock, sel: 'bg-red-100 text-red-800 border-red-400' },
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

      {/* פילוח הגעה — קוביות מספר + אחוז, גם מסננות */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { key: 'all', label: 'סה״כ בהיקף', count: arrivedCounts.all, bg: 'bg-slate-50 border-slate-200', num: 'text-slate-800', sel: 'ring-2 ring-slate-400' },
          { key: 'arrived', label: 'הגיעו', count: arrivedCounts.arrived, bg: 'bg-green-50 border-green-200', num: 'text-green-700', sel: 'ring-2 ring-green-400' },
          { key: 'not', label: 'לא הגיעו', count: arrivedCounts.not, bg: 'bg-red-50 border-red-200', num: 'text-red-700', sel: 'ring-2 ring-red-400' },
          { key: 'pending', label: 'טרם סומן', count: arrivedCounts.pending, bg: 'bg-amber-50 border-amber-200', num: 'text-amber-700', sel: 'ring-2 ring-amber-400' },
        ] as const).map(c => {
          const pct = arrivedCounts.all ? Math.round((c.count / arrivedCounts.all) * 100) : 0
          const active = arrivedFilter === c.key
          return (
            <button key={c.key} onClick={() => setArrivedFilter(c.key)}
              className={`rounded-2xl border px-4 py-3.5 text-right transition-all ${c.bg} ${active ? c.sel : 'hover:shadow-sm'}`}>
              <p className="text-xs text-slate-500 mb-1">{c.label}</p>
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-extrabold ${c.num}`}>{c.count}</span>
                {c.key !== 'all' && <span className="text-sm font-semibold text-slate-400">{pct}%</span>}
              </div>
            </button>
          )
        })}
      </div>

      <MaternityTable data={filtered} hideFilters showArrived emptyMessage="אין כרגע לידות מאושרות במצב הסינון הנוכחי" />
    </div>
  )
}
