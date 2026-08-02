'use client'
import { Component, type ReactNode } from 'react'
import { Mail, RotateCcw } from 'lucide-react'

// גבול-שגיאה ממוקד לטאב המיילים (mail-tab error boundary). אם משהו בתוך תכתובת המייל קורס (למשל HTML
// חריג), התקלה נתפסת כאן ולא מתפשטת ל-error boundary של /admin — כך שאר הכרטסת
// (משפחה, תינוק, כרטיס, בית החלמה) ממשיכה לעבוד במקום להיחסם ב"שגיאה בטעינת הנתונים".
export default class MailTabBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[MailTabBoundary] mail thread crashed:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
          <Mail size={28} className="text-slate-300" />
          <p className="text-sm font-medium text-slate-600">לא ניתן להציג את תכתובת המייל כרגע</p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-white"
          >
            <RotateCcw size={13} /> נסה שוב
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
