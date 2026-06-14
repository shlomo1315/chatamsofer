'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export interface DayPoint { date: string; read: number; handled: number; replied: number }

function formatDay(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export default function DailyChart({ data }: { data: DayPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
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
  )
}
