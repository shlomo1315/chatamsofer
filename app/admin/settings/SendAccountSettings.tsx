'use client'

// מאגר חשבונות השליחה של קודי האימות.
//
// ⚠️ פתיחת משתמש חדש ב-Workspace אינה מספיקה: המערכת מתחברת ל-Gmail עם אסימון
// שמור, ששייך לחשבון שאישר גישה בעבר. עד שהחשבון החדש מאשר בעצמו — דרך המסך
// הזה — הקודים ממשיכים לצאת מהחשבון הקודם.
//
// ⚠️ מאגר ולא חשבון יחיד: תקרת השליחה של Google היא לכל משתמש בנפרד ואינה
// ניתנת להעלאה, ולכן הדרך היחידה להגדיל נפח היא להוסיף חשבונות. השליחה עוברת
// לחשבון הבא ברשימה כשהקודם ממצה את מכסתו, ורק כשכולם מוצו — חזרה ל-Resend.
import { useEffect, useState, useCallback } from 'react'
import { Loader2, MailCheck, AlertCircle, Plus, Trash2 } from 'lucide-react'

interface Account { email: string; addedAt: string | null; usedToday: number }

export default function SendAccountSettings() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cap, setCap] = useState(1500)
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)

  // ⚠️ בלי setLoading(true) כאן: הפונקציה נקראת גם מתוך אפקט, ושינוי state
  // סינכרוני שם גורר רינדור מדורג. המצב ההתחלתי כבר true, וריענון אחרי
  // הסרה אינו זקוק לספינר.
  const load = useCallback(() => {
    fetch('/api/admin/gmail-send-status')
      .then(r => r.json())
      .then(d => {
        setAccounts(Array.isArray(d.accounts) ? d.accounts : [])
        if (typeof d.cap === 'number') setCap(d.cap)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const remove = async (email: string) => {
    if (!confirm(`להסיר את ${email} ממאגר חשבונות השליחה?`)) return
    setRemoving(email)
    try {
      await fetch(`/api/admin/gmail-send-status?email=${encodeURIComponent(email)}`, { method: 'DELETE' })
      load()
    } catch { /* silent */ }
    setRemoving(null)
  }

  const totalCapacity = accounts.length * cap
  const totalUsed = accounts.reduce((s, a) => s + a.usedToday, 0)

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 leading-relaxed">
        קודי האימות לג׳ימייל יוצאים דרך חשבונות Google Workspace, כדי לעקוף את ההשהיה
        של ספק הדואר מול Gmail. לכל חשבון מכסה יומית משלו (כ־{cap.toLocaleString('he-IL')} הודעות);
        כשהמכסה של אחד נגמרת, השליחה עוברת אוטומטית לחשבון הבא ברשימה.
      </p>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={14} className="animate-spin" /> טוען...</p>
      ) : accounts.length === 0 ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>לא חובר אף חשבון ייעודי — הקודים יוצאים מהתיבה הראשית ומהמכסה שלה.</span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>{accounts.length} חשבונות · קיבולת יומית כוללת {totalCapacity.toLocaleString('he-IL')}</span>
            <span>נוצלו היום: <strong className="text-slate-700">{totalUsed.toLocaleString('he-IL')}</strong></span>
          </div>
          <ul className="space-y-2">
            {accounts.map((a, i) => {
              const pct = Math.min(100, Math.round((a.usedToday / cap) * 100))
              const full = a.usedToday >= cap
              return (
                <li key={a.email} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <MailCheck size={15} className={full ? 'text-slate-300' : 'text-green-600'} />
                    <span className="text-sm font-semibold text-slate-800 flex-1 min-w-0 truncate" dir="ltr">{a.email}</span>
                    {i === 0 && !full && (
                      <span className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">פעיל</span>
                    )}
                    {full && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">מכסה מוצתה</span>
                    )}
                    <button onClick={() => remove(a.email)} disabled={removing === a.email}
                      title="הסרה מהמאגר"
                      className="text-slate-400 hover:text-red-600 disabled:opacity-40 p-1 -m-1">
                      {removing === a.email ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${full ? 'bg-amber-400' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-500 tabular-nums">
                      {a.usedToday.toLocaleString('he-IL')} / {cap.toLocaleString('he-IL')}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <button
        onClick={() => { window.location.href = '/api/auth/gmail-send' }}
        className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        <Plus size={15} /> הוספת חשבון שליחה
      </button>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        ⚠️ בעת ההוספה יש להתחבר לחשבון החדש עצמו (למשל <span dir="ltr">code2@chasamsofer.info</span>)
        ולא לחשבון שכבר מחובר. ההרשאה המבוקשת היא שליחה בלבד — אין למערכת גישה לקרוא את הדואר שלו.
        המונה מתאפס בחצות (שעון ישראל).
      </p>
    </div>
  )
}
