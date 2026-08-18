'use client'
import React from 'react'

// ── רשת ביטחון לפורטל הציבורי ──
//
// 🔴 למה זה קיים: לשונית שקרסה מציגה מסך לבן ריק ("This page couldn't load")
// בלי שום הסבר. משפחה שניסתה לרשום תינוק ראתה את זה, לא הבינה מה קרה,
// והפסיקה לנסות. גרוע מכך — אנחנו לא ידענו שזה קרה, כי הקריסה כולה בדפדפן
// והשרת לא רואה כלום.
//
// הגבול של הכלי: React error boundary תופס שגיאות *רינדור*. הוא אינו תופס
// לולאה אינסופית שתוקעת את הדפדפן בלי לזרוק — אבל React כן זורק
// "Maximum update depth exceeded" כשמזוהה עדכון-בתוך-עדכון חוזר, וזה כן
// נתפס כאן. לכן זו שכבה משלימה למגנים שבקוד עצמו, לא תחליף להם.

type Props = { children: React.ReactNode }
type State = { hasError: boolean; message: string }

export default class PortalErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? '' }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // דיווח לשרת — בלי זה קריסות בדפדפן נשארות בלתי נראות לחלוטין.
    // ⚠️ keepalive: הדיווח חייב לשרוד גם אם המשתמש סוגר את הלשונית מיד.
    try {
      void fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          message: String(error?.message ?? '').slice(0, 500),
          stack: String(error?.stack ?? '').slice(0, 2000),
          componentStack: String(info?.componentStack ?? '').slice(0, 2000),
          url: typeof window !== 'undefined' ? window.location.href : '',
        }),
      }).catch(() => {})
    } catch { /* דיווח כושל לא יפיל את מסך השגיאה עצמו */ }
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-lg p-6 text-center">
          <div className="text-4xl mb-3">⚠️</div>
          <h1 className="text-lg font-bold text-slate-800 mb-2">אירעה תקלה זמנית</h1>
          <p className="text-sm text-slate-600 leading-relaxed mb-5">
            משהו השתבש בטעינת הדף. הנתונים שלכם <strong>לא נפגעו</strong>.
            אפשר לרענן ולנסות שוב; אם התקלה חוזרת — נשמח שתפנו למשרד ונטפל בזה.
          </p>
          <div className="flex gap-2 justify-center">
            <button
              type="button"
              onClick={() => { window.location.href = window.location.pathname }}
              className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
              רענון הדף
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/' }}
              className="px-4 py-2.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors">
              חזרה לדף הראשי
            </button>
          </div>
        </div>
      </div>
    )
  }
}
