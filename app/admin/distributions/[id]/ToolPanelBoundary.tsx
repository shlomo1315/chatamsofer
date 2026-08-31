'use client'
import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// גבול-שגיאה לכל פאנל בכלי החלוקה.
//
// 🔴 עד כה שגיאה בפאנל אחד הפילה את **כל** דף החלוקה — כולל טבלת
// 6,050 הנרשמים, האישורים והטעינה. מסך לבן על תקלה בפאנל צדדי הוא
// אובדן גישה לחלוקה כולה.
//
// ⚠️ הפאנל מזוהה בשם: שגיאה ממוזערת בפרודקשן ("Minified React error
// #301") אינה אומרת *היכן* היא קרתה, וזה בדיוק מה שהופך אבחון
// לניחוש. השם נרשם בלוג ומוצג למשתמש.
// ─────────────────────────────────────────────────────────────────────────────

export default class ToolPanelBoundary extends Component<
  { children: ReactNode; name: string },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    // ⚠️ שם הפאנל בהודעה — בלעדיו הלוג מראה שגיאה בלי מקור.
    console.error(`[ToolPanelBoundary] הפאנל "${this.props.name}" קרס:`, error)

    // ⚠️ נשלח גם לשרת: המשתמש אינו פותח קונסול, והתקלה הזו התגלתה
    // רק כי הוא העתיק את השגיאה ידנית.
    try {
      void fetch('/api/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'panel-crash',
          panel: this.props.name,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : '',
          url: typeof location !== 'undefined' ? location.href : '',
        }),
      }).catch(() => {})
    } catch { /* דיווח שנכשל אינו אמור להפיל את הגבול עצמו */ }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-amber-300 bg-amber-50 py-10 text-center">
          <AlertTriangle size={26} className="text-amber-500" />
          <div>
            <p className="text-sm font-bold text-amber-900">
              לא ניתן להציג את &quot;{this.props.name}&quot; כרגע
            </p>
            {/* 🔴 אומר במפורש שהשאר עובד: בלי זה המשתמש מניח שהמסך
                כולו שבור ומפסיק לעבוד. */}
            <p className="mt-1 text-[12px] text-amber-800">
              שאר המסך ממשיך לעבוד כרגיל. התקלה דווחה.
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
          >
            <RotateCcw size={13} /> נסה שוב
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
