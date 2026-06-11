'use client'
import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
      <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
        <AlertTriangle size={28} />
      </div>
      <div>
        <h2 className="text-lg font-bold text-slate-900">אירעה שגיאה בטעינת הנתונים</h2>
        <p className="text-sm text-slate-500 mt-1">נסו לרענן את העמוד, ואם הבעיה נמשכת — פנו לצוות המערכת.</p>
      </div>
      <button
        onClick={() => reset()}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
      >
        <RotateCcw size={16} />
        נסה שוב
      </button>
    </div>
  )
}
