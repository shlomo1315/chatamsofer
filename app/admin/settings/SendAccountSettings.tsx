'use client'

// חשבון השליחה של קודי האימות.
//
// ⚠️ פתיחת משתמש חדש ב-Workspace אינה מספיקה: המערכת מתחברת ל-Gmail עם אסימון
// שמור, ששייך לחשבון שאושר בעבר. עד שהחשבון החדש מאשר גישה בעצמו, הקודים
// ממשיכים לצאת מהתיבה הראשית. המסך הזה הוא מקום האישור הזה.
import { useEffect, useState } from 'react'
import { Loader2, MailCheck, AlertCircle } from 'lucide-react'

export default function SendAccountSettings() {
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/gmail-send-status')
      .then(r => r.json())
      .then(d => setEmail(typeof d.email === 'string' && d.email ? d.email : null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 leading-relaxed">
        קודי האימות לג׳ימייל יוצאים דרך חשבון Google Workspace, כדי לעקוף את ההשהיה
        של ספק הדואר מול Gmail. חיבור חשבון ייעודי נותן לו מכסת שליחה יומית משלו,
        ומונע מגל קודים למצות את המכסה של תיבת המשרד.
      </p>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={14} className="animate-spin" /> טוען...</p>
      ) : email ? (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-sm text-green-800">
          <MailCheck size={16} className="flex-shrink-0" />
          <span>מחובר: <strong dir="ltr" className="inline-block">{email}</strong></span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
          <span>לא חובר חשבון ייעודי — הקודים יוצאים מהתיבה הראשית ומהמכסה שלה.</span>
        </div>
      )}

      <button
        onClick={() => { window.location.href = '/api/auth/gmail-send' }}
        className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        {email ? 'החלפת החשבון' : 'חיבור חשבון שליחה'}
      </button>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        ⚠️ בעת החיבור יש להתחבר לחשבון הייעודי עצמו (למשל <span dir="ltr">code@chasamsofer.info</span>)
        ולא לתיבת המשרד. ההרשאה המבוקשת היא שליחה בלבד — אין למערכת גישה לקרוא את הדואר של החשבון.
      </p>
    </div>
  )
}
