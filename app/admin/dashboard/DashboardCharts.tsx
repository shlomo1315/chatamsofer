'use client'
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts'
import Card from '@/components/ui/Card'

export interface MonthlyPoint { month: string; נתמכים: number; הלוואות: number }
export interface SlicePoint { name: string; value: number; color: string }

export default function DashboardCharts({
  statusData,
}: {
  monthly?: MonthlyPoint[]
  statusData: SlicePoint[]
}) {
  const hasStatus = statusData.some(s => s.value > 0)

  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-700 mb-4">סטטוס נתמכים</h2>
      {hasStatus ? (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={statusData.filter(s => s.value > 0)} cx="50%" cy="45%" innerRadius={58} outerRadius={88} paddingAngle={3} dataKey="value">
              {statusData.filter(s => s.value > 0).map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Pie>
            <Legend iconType="circle" iconSize={8} formatter={(v) => <span style={{ fontSize: 12, color: '#475569' }}>{v}</span>} />
            <Tooltip formatter={(value) => [`${value}`, 'נתמכים']} contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[260px] flex items-center justify-center text-sm text-slate-400">אין נתונים להצגה</div>
      )}
    </Card>
  )
}
