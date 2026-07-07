'use client'
import { useState, useEffect } from 'react'
import { X, Building2 } from 'lucide-react'

const CONFETTI_COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f59e0b', '#22c55e', '#3b82f6', '#ef4444', '#14b8a6']

interface ConfettiPiece { left: number; delay: number; duration: number; size: number; color: string; rounded: boolean }

export default function WelcomeModal() {
  const [name, setName] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [closing, setClosing] = useState(false)
  const [logoError, setLogoError] = useState(false)
  // מחושב פעם אחת (ב-initializer של useState) ולא בכל render — כך Math.random
  // אינו נקרא בזמן render, והקונפטי יציב ולא "מתרנדם" מחדש בכל רינדור.
  const [pieces] = useState<ConfettiPiece[]>(() =>
    Array.from({ length: 60 }, (_, i) => ({
      left: 20 + Math.random() * 60,
      delay: Math.random() * 1.0,
      duration: 2.0 + Math.random() * 1.5,
      size: 6 + Math.random() * 8,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rounded: Math.random() > 0.4,
    }))
  )

  useEffect(() => {
    const stored = sessionStorage.getItem('welcomeUser')
    if (stored) {
      sessionStorage.removeItem('welcomeUser')
      setName(stored)
      setVisible(true)
    }
  }, [])

  const startClose = () => {
    setClosing(true)
    setTimeout(() => setVisible(false), 400)
  }

  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => startClose(), 2500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  if (!visible || !name) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backdropFilter: 'blur(6px)',
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        animation: closing ? 'welcome-out 0.4s ease-in forwards' : 'welcome-in 0.4s ease-out forwards',
      }}
    >
      {/* Confetti — scoped inside modal area */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pieces.map((p, i) => (
          <span key={i} style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: '-4%',
            width: p.size,
            height: p.size * (p.rounded ? 1 : 1.7),
            background: p.color,
            borderRadius: p.rounded ? '9999px' : '2px',
            opacity: 0.9,
            animation: `confetti-fall ${p.duration}s linear ${p.delay}s forwards`,
          }} />
        ))}
      </div>

      {/* Modal card */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-auto overflow-hidden"
        style={{ animation: closing ? 'welcome-out 0.35s ease-in forwards' : 'pop-in 0.35s ease-out forwards' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={startClose}
          className="absolute top-3 left-3 z-10 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Purple header */}
        <div className="bg-gradient-to-l from-indigo-600 to-violet-600 px-6 pt-8 pb-10 text-center text-white">
          {/* Logo */}
          <div className="w-20 h-20 bg-white rounded-xl flex items-center justify-center mx-auto mb-4 shadow-lg overflow-hidden p-1.5">
            {logoError ? (
              <Building2 size={36} className="text-indigo-600" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/logo.jpg"
                alt="לוגו"
                className="w-full h-full object-contain"
                onError={() => setLogoError(true)}
              />
            )}
          </div>
          <h2 className="text-2xl font-bold drop-shadow">שלום, {name} 👋</h2>
          <p className="text-indigo-100 mt-1 text-sm">ברוכים הבאים לתוכנת הניהול</p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 text-center">
          <p className="text-lg font-bold text-slate-800">היכל החתם סופר</p>
          <p className="text-sm text-slate-500 mt-1">מיד תועבר לניהול האתר...</p>

          {/* Progress bar */}
          <div className="mt-4 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ animation: 'shrink 2.5s linear forwards' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
