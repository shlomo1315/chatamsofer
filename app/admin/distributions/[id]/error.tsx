'use client'
import { useEffect } from 'react'
import { AlertTriangle, RotateCcw, ArrowRight } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// גבול-שגיאה לדף החלוקה כולו.
//
// 🔴 בלעדיו שגיאה בדף נותנת מסך לבן: המשתמש מאבד גישה לחלוקה של
// 6,050 משפחות ואין לו מושג מה קרה או מה לעשות.
//
// ⚠️ ToolPanelBoundary תופס שגיאות בתוך הפאנלים; זה כאן תופס את השאר
// (הטבלה, הכותרת, האישורים). שני הגבולות משלימים זה את זה.
// ─────────────────────────────────────────────────────────────────────────────

export default function DistributionError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[distribution] הדף קרס:', error)
    // ⚠️ דיווח לשרת: המשתמש אינו פותח קונסול, והתקלה האחרונה התגלתה
    // רק כי הוא העתיק את השגיאה ידנית מהדפדפן.
    try {
      void fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'distribution-page-crash',
          message: error.message,
          digest: error.digest ?? '',
          stack: error.stack ?? '',
          url: typeof location !== 'undefined' ? location.href : '',
        }),
      }).catch(() => {})
    } catch { /* דיווח שנכשל לא יפיל את מסך השגיאה עצמו */ }
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <AlertTriangle size={34} className="text-amber-500" />
      <div>
        <h2 className="text-lg font-extrabold text-slate-900">משהו השתבש בטעינת החלוקה</h2>
        <p className="mt-1 text-sm text-slate-600">
          הנתונים עצמם תקינים — זו תקלת תצוגה. התקלה דווחה.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-700">
          <RotateCcw size={13} /> נסה שוב
        </button>
        <a href="/admin/distributions"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
          <ArrowRight size={13} /> חזרה לרשימת החלוקות
        </a>
      </div>
    </div>
  )
}
