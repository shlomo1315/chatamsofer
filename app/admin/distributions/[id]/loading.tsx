// ─────────────────────────────────────────────────────────────────────────────
// שלד הטעינה של מסך החלוקה.
//
// ⚠️ למה זה קיים: המסך שולף את כל נרשמי החלוקה (בתשרי — כ-6,000 שורות עם
// פרטי המשפחה המלאים) לפני שהוא מרנדר. בלי הקובץ הזה Next.js אינו מציג דבר
// עד שהשליפה מסתיימת, והדפדפן פשוט נשאר על המסך *הקודם* — הלחיצה נראית
// כאילו לא נקלטה, והמשתמש לוחץ שוב.
//
// ⚠️ זו אינה האצה של השליפה אלא של המשוב: המסך מופיע מיד, והנתונים נכנסים
// לתוכו כשהם מגיעים.
// ─────────────────────────────────────────────────────────────────────────────
export default function DistributionDetailLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* כותרת החלוקה */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-slate-200" />
          <div className="space-y-2">
            <div className="h-5 w-40 rounded-lg bg-slate-200" />
            <div className="h-3 w-56 rounded bg-slate-100" />
          </div>
        </div>
        <div className="h-9 w-32 rounded-xl bg-slate-100" />
      </div>

      {/* כרטיסי הסיכום */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="h-3 w-20 rounded bg-slate-100" />
            <div className="mt-3 h-7 w-24 rounded-lg bg-slate-200" />
          </div>
        ))}
      </div>

      {/* פאנל הקישור */}
      <div className="h-28 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="h-4 w-44 rounded bg-slate-200" />
        <div className="mt-3 h-3 w-3/4 rounded bg-slate-100" />
      </div>

      {/* הטבלה */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="h-4 w-32 rounded bg-slate-200" />
        </div>
        <div className="divide-y divide-slate-50">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <div className="h-3 flex-1 rounded bg-slate-100" />
              <div className="h-3 w-24 rounded bg-slate-100" />
              <div className="h-3 w-20 rounded bg-slate-100" />
              <div className="h-3 w-16 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-sm text-slate-400">טוען את רשימת הנרשמים…</p>
    </div>
  )
}
