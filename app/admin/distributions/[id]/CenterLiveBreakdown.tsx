'use client'
import { useMemo } from 'react'
import { MapPin } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// פילוח חי — כמה משפחות בחרו בכל מוקד.
//
// 🔴 למה זה קיים: בשלב בחירת המוקדים זו השאלה היחידה שנשאלת — לאן
// המשפחות הולכות, ואיפה צפוי עומס. עד כה המספרים היו קבורים בטאב
// "מוקדי חלוקה" שנפתח רק בלחיצה, והמנהל היה צריך לדעת לחפש שם.
//
// ⚠️ נגזר מהשורות שכבר על המסך ולא מבקשה נוספת: הן ממילא נטענות,
// ובקשה נפרדת הייתה מציגה מספר שסותר את הטבלה שמתחתיו ברגע ששיוך
// ידני משנה שורה.
//
// ⚠️ מוצגים רק מוקדים שנבחרו: רשימה של 26 מוקדים שרובם באפס היא רעש,
// והיא מסתירה בדיוק את מה שהפילוח בא להראות.
// ─────────────────────────────────────────────────────────────────────────────

export default function CenterLiveBreakdown({
  rows, total,
}: {
  rows: { center_id?: string | null; center_name?: string | null }[]
  /** סך הנרשמים — לחישוב כמה טרם בחרו. */
  total: number
}) {
  const { list, chosen } = useMemo(() => {
    const byName = new Map<string, number>()
    let n = 0
    for (const r of rows) {
      if (!r.center_id) continue
      n++
      // ⚠️ שם ולא מזהה: המנהל חושב במונחי "בני ברק · חזון איש".
      const label = r.center_name?.trim() || 'מוקד לא ידוע'
      byName.set(label, (byName.get(label) ?? 0) + 1)
    }
    return {
      list: [...byName.entries()].sort((a, b) => b[1] - a[1]),
      chosen: n,
    }
  }, [rows])

  if (!chosen) return null

  const max = list[0]?.[1] ?? 1
  const pending = Math.max(0, total - chosen)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-extrabold text-slate-900">
          <MapPin size={15} className="text-teal-600" /> בחירת מוקדים — מצב חי
        </h3>
        <p className="text-[12px] text-slate-500">
          <span className="font-extrabold text-teal-700 ltr-num">{chosen.toLocaleString('he-IL')}</span> בחרו
          {pending > 0 && <> · <span className="ltr-num">{pending.toLocaleString('he-IL')}</span> טרם בחרו</>}
          {' · '}<span className="ltr-num">{list.length}</span> מוקדים פעילים
        </p>
      </div>

      {/* ⚠️ פסים אופקיים בגוון אחד — אותו דפוס כמו פילוח הערים, כדי
          ששני הפילוחים באותו מסך לא ייראו כשתי מערכות שונות. */}
      <div className="flex flex-col gap-1">
        {list.map(([name, n]) => (
          <div key={name} className="flex items-center gap-2.5">
            <span className="w-40 shrink-0 truncate text-[12.5px] text-slate-700" title={name}>
              {name}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-teal-500"
                style={{ width: `${Math.max(3, (n / max) * 100)}%` }} />
            </span>
            <span className="w-10 shrink-0 text-left text-[12.5px] font-extrabold text-slate-800 ltr-num">
              {n.toLocaleString('he-IL')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
