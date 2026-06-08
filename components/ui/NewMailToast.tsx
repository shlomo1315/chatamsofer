'use client'
import { useEffect, useState } from 'react'
import { Mail, X } from 'lucide-react'

export interface MailToast {
  id: string
  from: string
  subject: string
  snippet: string
}

export default function NewMailToast({ toast, onClick, onClose }: {
  toast: MailToast
  onClick: () => void
  onClose: () => void
}) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Animate in
    const t1 = setTimeout(() => setVisible(true), 10)
    // Auto-dismiss after 5s
    const t2 = setTimeout(() => {
      setVisible(false)
      setTimeout(onClose, 300)
    }, 5000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onClose])

  return (
    <div
      className={`flex items-start gap-3 bg-white border border-slate-200 rounded-2xl shadow-xl px-4 py-3 w-80 cursor-pointer
        transition-all duration-300 ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`}
      onClick={onClick}
      dir="rtl"
    >
      <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Mail size={16} className="text-indigo-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-indigo-700 mb-0.5">מייל חדש</p>
        <p className="text-sm font-semibold text-slate-900 truncate">{toast.from || toast.subject}</p>
        <p className="text-xs text-slate-500 truncate">{toast.subject}</p>
        {toast.snippet && <p className="text-xs text-slate-400 truncate mt-0.5">{toast.snippet}</p>}
      </div>
      <button
        onClick={e => { e.stopPropagation(); setVisible(false); setTimeout(onClose, 300) }}
        className="flex-shrink-0 text-slate-300 hover:text-slate-500 mt-0.5"
      >
        <X size={14} />
      </button>

      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-100 rounded-b-2xl overflow-hidden">
        <div className="h-full bg-indigo-400 rounded-b-2xl" style={{ animation: 'shrink 5s linear forwards' }} />
      </div>
    </div>
  )
}

export function playMailSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    // Two-tone chime
    const play = (freq: number, start: number, duration: number, gain: number) => {
      const osc = ctx.createOscillator()
      const g   = ctx.createGain()
      osc.connect(g)
      g.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start)
      g.gain.setValueAtTime(0, ctx.currentTime + start)
      g.gain.linearRampToValueAtTime(gain, ctx.currentTime + start + 0.02)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration)
      osc.start(ctx.currentTime + start)
      osc.stop(ctx.currentTime + start + duration)
    }
    play(880, 0,    0.3, 0.18)
    play(1109, 0.15, 0.4, 0.12)
  } catch { /* AudioContext not available */ }
}
