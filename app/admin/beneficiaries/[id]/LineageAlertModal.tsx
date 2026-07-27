'use client'
import { useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'

// דור להצגה בחלונית — שם, מספר, וצבע (כחול=מאושר · כתום=ממתין · אדום=נדחה).
export interface AlertGen {
  generation: number
  name: string
  color: 'blue' | 'red' | 'orange'
}

// חלונית התראה שקופצת בכניסה לכרטסת משפחה שסדר הדורות שלה אינו תקין —
// יש דורות (בתוך 5 הראשונים) שאינם תואמים לנתיב המאושר במאגר. מציגה את *כל*
// הדורות בצבעים כדי שהמנהל יראה מיד מה חורג. נסגרת בלחיצה, אינה חוסמת.
const CHIP: Record<AlertGen['color'], string> = {
  blue:   'bg-blue-600 text-white border-blue-700 font-semibold',
  red:    'bg-red-600 text-white border-red-700 font-bold',
  orange: 'bg-orange-500 text-white border-orange-600 font-semibold',
}
const GEN_TXT: Record<AlertGen['color'], string> = { blue: 'text-blue-100', red: 'text-red-100', orange: 'text-orange-100' }

export default function LineageAlertModal({ generations, allGens }: {
  generations: number[]            // הדורות החורגים (לטקסט)
  allGens?: AlertGen[]             // כל הדורות בצבעים (לתצוגה מלאה)
}) {
  const [open, setOpen] = useState(true)
  if (!open || !generations.length) return null
  const gensText = [...generations].sort((a, b) => a - b).map(g => `דור ${g}`).join(', ')
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" dir="rtl"
      onClick={() => setOpen(false)}>
      <div className="relative bg-white rounded-2xl shadow-2xl border-2 border-red-300 w-full max-w-lg p-6 text-center"
        style={{ animation: 'pop-in 0.25s ease-out' }} onClick={e => e.stopPropagation()}>
        <button type="button" onClick={() => setOpen(false)}
          className="absolute top-4 left-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>
        <div className="w-16 h-16 mx-auto bg-red-100 rounded-2xl flex items-center justify-center mb-4">
          <AlertTriangle size={30} className="text-red-600" />
        </div>
        <h2 className="text-xl font-extrabold text-red-900 mb-2">סדר הדורות אינו תקין</h2>
        <p className="text-sm text-slate-600 mb-3 leading-relaxed">
          במשפחה זו יש דורות שאינם תואמים לנתיב היחוס המאושר: <span className="font-bold text-red-700">{gensText}</span>
        </p>

        {/* כל הדורות בצבעים — דור אחרי דור, שורה אחרי שורה (מלמעלה למטה) */}
        {allGens && allGens.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-4 rounded-xl bg-slate-50 border border-slate-200 p-3">
            {[...allGens].sort((a, b) => a.generation - b.generation).map(g => (
              <div key={g.generation} className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border ${CHIP[g.color]}`}>
                <span className={`text-xs font-bold ${GEN_TXT[g.color]} shrink-0`}>דור {g.generation}</span>
                <span className="flex-1 text-right">{g.name}</span>
                {g.color === 'red' && <AlertTriangle size={14} className="shrink-0" />}
              </div>
            ))}
          </div>
        )}

        <p className="text-sm text-slate-600 mb-5 leading-relaxed">
          יש לבדוק את סדר היחוס בצורה מעמיקה לפני אישור. הדורות החורגים מסומנים באדום.
        </p>
        <button type="button" onClick={() => setOpen(false)}
          className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl py-2.5 transition-colors">
          הבנתי, אבדוק
        </button>
      </div>
    </div>
  )
}
