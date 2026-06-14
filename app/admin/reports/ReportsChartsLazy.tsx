'use client'
import dynamic from 'next/dynamic'

// Lazy-load recharts (heavy) on the client only
const ReportsCharts = dynamic(() => import('./ReportsCharts'), {
  ssr: false,
  loading: () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {[0, 1].map((i) => (
        <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="h-4 w-40 bg-slate-100 rounded mb-4 animate-pulse" />
          <div className="h-[220px] bg-slate-50 rounded animate-pulse" />
        </div>
      ))}
    </div>
  ),
})

export default ReportsCharts
