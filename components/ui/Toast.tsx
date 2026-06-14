'use client'
import { createContext, ReactNode, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const TYPE_STYLES: Record<ToastType, { wrap: string; icon: ReactNode }> = {
  success: { wrap: 'border-green-200 bg-green-50 text-green-800', icon: <CheckCircle2 size={18} className="text-green-600 shrink-0" /> },
  error: { wrap: 'border-red-200 bg-red-50 text-red-800', icon: <AlertCircle size={18} className="text-red-600 shrink-0" /> },
  info: { wrap: 'border-indigo-200 bg-indigo-50 text-indigo-800', icon: <Info size={18} className="text-indigo-600 shrink-0" /> },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((type: ToastType, message: string) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, type, message }])
    // שגיאות נשארות מעט יותר זמן על המסך
    setTimeout(() => dismiss(id), type === 'error' ? 6000 : 4000)
  }, [dismiss])

  const success = useCallback((message: string) => toast('success', message), [toast])
  const error = useCallback((message: string) => toast('error', message), [toast])
  const info = useCallback((message: string) => toast('info', message), [toast])

  return (
    <ToastContext.Provider value={{ toast, success, error, info }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] flex flex-col gap-2 items-center w-full max-w-md px-4 pointer-events-none" aria-live="polite">
          {toasts.map(t => {
            const s = TYPE_STYLES[t.type]
            return (
              <div
                key={t.id}
                role={t.type === 'error' ? 'alert' : 'status'}
                className={`pointer-events-auto w-full flex items-start gap-2.5 rounded-xl border shadow-lg px-4 py-3 text-sm ${s.wrap}`}
                style={{ animation: 'pop-in 0.2s ease-out' }}
              >
                {s.icon}
                <span className="flex-1 whitespace-pre-line">{t.message}</span>
                <button
                  onClick={() => dismiss(t.id)}
                  aria-label="סגור"
                  className="rounded-md p-0.5 opacity-60 hover:opacity-100 transition-opacity"
                >
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
