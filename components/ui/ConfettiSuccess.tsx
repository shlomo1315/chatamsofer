'use client'
import { CheckCircle2 } from 'lucide-react'

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ec4899', '#3b82f6', '#a855f7', '#ef4444', '#14b8a6']

// חלונית הצלחה עם קונפיטי — נסגרת מעצמה ע"י ההורה (setTimeout)
export default function ConfettiSuccess({
  title,
  subtitle,
  details = [],
}: {
  title: string
  subtitle?: string
  details?: string[]
}) {
  const pieces = Array.from({ length: 70 })
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      {/* Confetti layer */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pieces.map((_, i) => {
          const left = Math.random() * 100
          const delay = Math.random() * 0.8
          const duration = 2.2 + Math.random() * 1.8
          const size = 6 + Math.random() * 8
          const color = COLORS[i % COLORS.length]
          const rounded = Math.random() > 0.5
          return (
            <span key={i}
              style={{
                position: 'absolute',
                left: `${left}%`,
                top: '-5%',
                width: size,
                height: size * (rounded ? 1 : 1.6),
                background: color,
                borderRadius: rounded ? '9999px' : '2px',
                animation: `confetti-fall ${duration}s linear ${delay}s forwards`,
              }}
            />
          )
        })}
      </div>

      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 p-7 w-full max-w-sm mx-4 text-center"
        style={{ animation: 'pop-in 0.25s ease-out' }}>
        <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 size={34} />
        </div>
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        {details.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-1.5">
            {details.map((d, i) => (
              <span key={i} className="text-xs text-slate-600 bg-slate-100 rounded-full px-2.5 py-1">{d}</span>
            ))}
          </div>
        )}
        <div className="mt-5 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-green-500" style={{ animation: 'shrink 3s linear forwards' }} />
        </div>
      </div>
    </div>
  )
}
