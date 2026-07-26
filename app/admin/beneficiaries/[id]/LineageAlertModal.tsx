'use client'
import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

// חלונית התראה שקופצת בכניסה לכרטסת משפחה שסדר הדורות שלה אינו תקין —
// יש דורות (בתוך 5 הראשונים) שאינם תואמים לנתיב המאושר במאגר. מזכירה למנהל
// לבדוק את היחוס בצורה מעמיקה. נסגרת בלחיצה ואינה חוסמת.
export default function LineageAlertModal({ generations }: { generations: number[] }) {
  const [open, setOpen] = useState(true)
  if (!open || !generations.length) return null
  const gensText = [...generations].sort((a, b) => a - b).map(g => `דור ${g}`).join(', ')
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" dir="rtl"
      onClick={() => setOpen(false)}>
      <div className="relative bg-white rounded-2xl shadow-2xl border-2 border-red-300 w-full max-w-md p-6 text-center"
        style={{ animation: 'pop-in 0.25s ease-out' }} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={() => setOpen(false)}
          className="absolute top-4 left-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>
        <div className="w-16 h-16 mx-auto bg-red-100 rounded-2xl flex items-center justify-center mb-4">
          <AlertTriangle size={30} className="text-red-600" />
        </div>
        <h2 className="text-xl font-extrabold text-red-900 mb-2">סדר הדורות אינו תקין</h2>
        <p className="text-sm text-slate-600 mb-2 leading-relaxed">
          במשפחה זו יש דורות שאינם תואמים לנתיב היחוס המאושר במאגר:
        </p>
        <p className="text-sm font-bold text-red-700 mb-3">{gensText}</p>
        <p className="text-sm text-slate-600 mb-5 leading-relaxed">
          יש לבדוק את סדר היחוס בצורה מעמיקה לפני אישור. הדורות החורגים מסומנים
          באדום בעץ הדורות.
        </p>
        <button type="button" onClick={() => setOpen(false)}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl py-2.5 transition-colors">
          הבנתי, אבדוק
        </button>
      </div>
    </div>
  )
}
