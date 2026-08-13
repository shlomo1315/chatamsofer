'use client'
import { useState, useEffect } from 'react'
import { AlertTriangle, Check } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// התראה על דחייה קודמת של אותה משפחה.
//
// 🔴 מוצגת פעם אחת בכל פתיחה של בקשה שלמשפחתה יש דחייה קודמת. בלעדיה
// המזכירות מטפלת בבקשה חוזרת כאילו היא ראשונה — ולעיתים מאשרת בקשה
// שנדחתה בכוונה מסיבה שעדיין תקפה.
//
// ⚠️ חוסמת (מודל) ולא באנר בצד: באנר נקרא אחרי ההחלטה, וזה בדיוק הזמן שבו
// הוא כבר חסר ערך. ההחלטה כאן היא כספית ובלתי הפיכה מבחינת המשפחה.
// ─────────────────────────────────────────────────────────────────────────────

interface Rejection {
  id: string
  amount: number
  purpose: string | null
  purposeDetails: string | null
  reason: string | null
  at: string | null
}

const fmtDate = (s: string | null) => {
  if (!s) return '—'
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('he-IL')
}

export default function PriorRejectionAlert({ loanId, familyName }: { loanId: string; familyName?: string }) {
  const [rejections, setRejections] = useState<Rejection[]>([])
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      void fetch(`/api/admin/loans/${loanId}/prior-rejections`, { cache: 'no-store' })
        .then(r => r.json())
        .then(d => { if (alive) setRejections(d.rejections ?? []) })
        .catch(() => { /* התראה בלבד — כשל אינו חוסם את המסך */ })
    }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [loanId])

  if (dismissed || rejections.length === 0) return null

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl border border-amber-200 w-full max-w-lg overflow-hidden">
        <div className="bg-gradient-to-l from-amber-500 to-orange-500 px-6 py-4 flex items-center gap-3">
          <AlertTriangle size={22} className="text-white flex-shrink-0" />
          <div>
            <h2 className="text-white font-extrabold">שימו לב — בקשה קודמת נדחתה</h2>
            <p className="text-amber-50 text-xs mt-0.5">
              {familyName ? `למשפחת ${familyName}` : 'למשפחה זו'} יש היסטוריית דחייה
            </p>
          </div>
        </div>

        <div className="px-6 py-5 max-h-[60vh] overflow-y-auto space-y-3">
          {rejections.map(r => (
            <div key={r.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <p className="text-sm text-slate-800 leading-relaxed">
                משפחה זו הגישה בעבר הלוואה בסך{' '}
                <strong className="ltr-num">${r.amount.toLocaleString('he-IL')}</strong>
                {r.purpose && <> עבור <strong>{r.purpose}</strong></>}
                {' '}בתאריך <strong className="ltr-num">{fmtDate(r.at)}</strong>, והבקשה נדחתה.
              </p>

              {/* ⚠️ הסיבה בהדגשה נפרדת — היא המידע שבגללו ההתראה קיימת. */}
              {r.reason ? (
                <div className="mt-3 rounded-lg border-r-4 border-rose-400 bg-white px-3 py-2">
                  <p className="text-[11px] font-extrabold text-rose-500 uppercase mb-0.5">סיבת הדחייה</p>
                  <p className="text-sm font-medium text-slate-800 whitespace-pre-wrap">{r.reason}</p>
                </div>
              ) : (
                // ⚠️ נאמר במפורש שלא תועדה, ולא מוצג ריק: היעדר סיבה הוא
                // מידע בפני עצמו — הוא אומר שצריך לברר, לא שאין בעיה.
                <p className="mt-3 text-xs text-slate-500 italic">לא תועדה סיבת דחייה לבקשה זו.</p>
              )}

              {r.purposeDetails && (
                <p className="mt-2 text-xs text-slate-500">
                  <span className="font-bold">פירוט הבקשה:</span> {r.purposeDetails}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={() => setDismissed(true)}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-900 transition-colors">
            <Check size={16} /> הבנתי, תודה
          </button>
        </div>
      </div>
    </div>
  )
}
