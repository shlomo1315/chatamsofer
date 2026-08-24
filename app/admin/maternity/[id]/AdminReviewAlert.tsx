'use client'
import { useState } from 'react'
import { AlertTriangle, Check } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// חלונית שקופצת למנהל בכניסה לתיק שממתין לאישורו, עם ההסבר למה הוא
// הגיע לשם.
//
// 🔴 בלעדיה המנהל ראה תיק ב"ממתין לאישור מנהל" בלי לדעת מה המזכירה
// ביקשה שיבדוק — הוא היה צריך לחפש בהערות או לשאול אותה.
//
// ⚠️ נסגרת בלחיצה ואינה חוסמת: היא מידע, לא שער. חלונית שדורשת פעולה
// לפני שרואים את התיק מאטה את מי שרק רצה להציץ.
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminReviewAlert({ reason, motherName }: {
  reason?: string | null
  motherName?: string
}) {
  const [open, setOpen] = useState(true)
  if (!open) return null

  const text = (reason ?? '').trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-md rounded-2xl border-2 border-amber-300 bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100">
            <AlertTriangle size={20} className="text-amber-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-bold text-amber-900">התיק ממתין לאישור מנהל</h2>
            {motherName && (
              <p className="mt-0.5 text-sm text-slate-500">{motherName}</p>
            )}
          </div>
        </div>

        {/* ⚠️ כשאין סיבה רשומה מציגים זאת במפורש ולא משפט ריק — כך
            המנהל יודע שהמזכירה לא הסבירה, ולא מניח שהוא פספס משהו. */}
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="mb-1 text-xs font-semibold text-amber-800">סיבת ההעברה</p>
          {text ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-amber-900">{text}</p>
          ) : (
            <p className="text-sm italic leading-relaxed text-amber-700">
              לא נרשמה סיבה. ניתן לברר מול המזכירה שהעבירה את התיק.
            </p>
          )}
        </div>

        <button
          onClick={() => setOpen(false)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-600"
        >
          <Check size={15} /> הבנתי
        </button>
      </div>
    </div>
  )
}
