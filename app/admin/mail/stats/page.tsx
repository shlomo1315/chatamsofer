'use client'
import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Mail, CheckCircle2, Eye, Reply, AlertCircle, Loader2, ArrowRight } from 'lucide-react'
import Link from 'next/link'

interface DayPoint { date: string; read: number; handled: number; replied: number }
interface UserRow  { user_id: string; name: string; read: number; handled: number }

interface Stats {
  range: number
  totals: { total: number; read: number; handled: number; replied: number; unhandled: number }
  dailyChart: DayPoint[]
  byUser: UserRow[]
}

const RANGES = [
  { label: '7 ימים',  value: 7  },
  { label: '14 ימים', value: 14 },
  { label: '30 ימים', value: 30 },
]

function Tile({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-black text-slate-900">{value.toLocaleString()}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </div>
  )
}

function formatDay(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export default function MailStatsPage() {
  const [range, setRange]   = useState(7)
  const [stats, setStats]   = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/mail/stats?range=${range}`)
      .then(r => r.json())
      .then(d => setStats(d))
      .finally(() => setLoading(false))
  }, [range])

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/mail" className="p-2 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors">
          <ArrowRight size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-black text-slate-900">ניטור מיילים</h1>
          <p className="text-sm text-slate-500">פילוח קריאות וטיפול לפי מחלקה ומשתמש</p>
        </div>
        <div className="mr-auto flex items-center gap-2 bg-white border border-slate-200 rounded-xl p-1">
          {RANGES.map(r => (
            <button key={r.value} onClick={() => setRange(r.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                range === r.value ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-800'
              }`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64 gap-2 text-slate-400">
          <Loader2 size={20} className="animate-spin" /> טוען נתונים...
        </div>
      ) : stats ? (
        <div className="flex flex-col gap-6">

          {/* KPI tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Tile icon={Mail}         label="נכנסו למערכת" value={stats.totals.total}     color="bg-slate-500" />
            <Tile icon={Eye}          label="נקראו"         value={stats.totals.read}      color="bg-indigo-500" />
            <Tile icon={CheckCircle2} label="טופלו"         value={stats.totals.handled}   color="bg-green-500" />
            <Tile icon={AlertCircle}  label="ממתינים לטיפול" value={stats.totals.unhandled} color="bg-amber-500" />
          </div>

          {/* Daily chart */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="text-base font-bold text-slate-800 mb-4">פעילות יומית</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.dailyChart} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tickFormatter={formatDay} tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                  labelFormatter={(label) => formatDay(String(label))}
                  formatter={(v, name) => [v, name === 'read' ? 'נקראו' : name === 'handled' ? 'טופלו' : 'נענו']}
                />
                <Legend formatter={(v) => v === 'read' ? 'נקראו' : v === 'handled' ? 'טופלו' : 'נענו'} wrapperStyle={{ fontSize: 13 }} />
                <Bar dataKey="read"    fill="#6366f1" radius={[4,4,0,0]} />
                <Bar dataKey="handled" fill="#22c55e" radius={[4,4,0,0]} />
                <Bar dataKey="replied" fill="#f59e0b" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Per-user table */}
          {stats.byUser.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-800">פילוח לפי משתמש</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-right">
                    <th className="px-6 py-3 text-xs font-bold text-slate-500">משתמש</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500">נקראו</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500">טופלו</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500">אחוז טיפול</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byUser.map((u, i) => {
                    const pct = u.read > 0 ? Math.round((u.handled / u.read) * 100) : 0
                    return (
                      <tr key={u.user_id} className={`border-t border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                        <td className="px-6 py-3 font-semibold text-slate-800">{u.name}</td>
                        <td className="px-6 py-3 text-slate-600">{u.read}</td>
                        <td className="px-6 py-3 text-slate-600">{u.handled}</td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-200 rounded-full h-2 max-w-[80px]">
                              <div className="h-2 rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs font-semibold text-slate-600">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {stats.byUser.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <Reply size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500 text-sm">אין נתוני פעילות עדיין לתקופה זו</p>
              <p className="text-slate-400 text-xs mt-1">הנתונים יצטברו אוטומטית כשתתחיל לקרוא ולטפל במיילים</p>
            </div>
          )}

        </div>
      ) : (
        <p className="text-slate-500 text-sm">שגיאה בטעינת נתונים</p>
      )}
    </div>
  )
}
