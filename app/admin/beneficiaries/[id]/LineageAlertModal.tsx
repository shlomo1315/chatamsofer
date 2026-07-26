'use client'
import { useState } from 'react'
import { AlertTriangle, X, ChevronLeft } from 'lucide-react'

// דור להצגה בחלונית — שם, מספר, וצבע (ירוק=תואם · אדום=שונה · כתום=נוסף).
export interface AlertGen {
  generation: number
  name: string
  color: 'green' | 'red' | 'orange'
}

// חלונית התראה שקופצת בכניסה לכרטסת משפחה שסדר הדורות שלה אינו תקין —
// יש דורות (בתוך 5 הראשונים) שאינם תואמים לנתיב המאושר במאגר. מציגה את *כל*
// הדורות בצבעים כדי שהמנהל יראה מיד מה חורג. נסגרת בלחיצה, אינה חוסמת.
const CHIP: Record<AlertGen['color'], string> = {
  green:  'bg-green-100 text-green-800 border-green-400',
  red:    'bg-red-100 text-red-800 border-red-400 font-bold',
  orange: 'bg-orange-100 text-orange-800 border-orange-300',
}
const GEN_TXT: Record<AlertGen['color'], string> = { green: 'text-green-600', red: 'text-red-500', orange: 'text-orange-500' }

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

        {/* כל הדורות בצבעים — אחד אחרי השני */}
        {allGens && allGens.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap justify-center mb-4 rounded-xl bg-slate-50 border border-slate-200 p-3">
            {[...allGens].sort((a, b) => a.generation - b.generation).map((g, i) => (
              <span key={g.generation} className="flex items-center gap-1.5">
                {i > 0 && <ChevronLeft size={12} className="text-slate-300" />}
                <span className={`text-xs px-2.5 py-1 rounded-full border ${CHIP[g.color]}`}>
                  <span className={`ml-1 ${GEN_TXT[g.color]}`}>דור {g.generation}</span>{g.name}
                  {g.color === 'red' && <span className="mr-1">⚠</span>}
                </span>
              </span>
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
