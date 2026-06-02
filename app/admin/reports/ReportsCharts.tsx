'use client'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import Card from '@/components/ui/Card'

interface Props {
  byEligibility: { name: string; value: number }[]
  byCity: { name: string; value: number }[]
}

const COLORS = ['#6366f1', '#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6']

export default function ReportsCharts({ byEligibility, byCity }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <h2 className="text-sm font-semibold text-slate-700 mb-4">התפלגות לפי סטטוס זכאות</h2>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={byEligibility}
              cx="50%"
              cy="45%"
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
              label={({ name, value }) => value > 0 ? `${name}: ${value}` : ''}
              labelLine={false}
            >
              {byEligibility.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => [value, 'נתמכים']} />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-700 mb-4">נתמכים לפי עיר</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={byCity} layout="vertical" margin={{ top: 0, right: 20, left: 40, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
            <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 11, fill: '#64748b' }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            />
            <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} name="נתמכים" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
