'use client'

// ניווט "הבאה/הקודמת" בין יולדות — נעול ללשונית שממנה נכנסו.
//
// 🔴 הבעיה שזה סוגר: הניווט רץ על *כל* טבלת הלידות לפי created_at. מי שנכנס
// מ"ממתין לאישור" ולחץ "הבאה" נחת על יולדת מאושרת, ואיבד את הרצף שבו עבד.
//
// ⚠️ הרשימה ננעלת לפי הסטטוס שבו *נכנסו*, ולא לפי הסטטוס הנוכחי של התיק.
// זו הזרימה האמיתית: פותחים תיק ממתין, מאשרים אותו, ולוחצים "הבאה". אילו
// הנעילה הייתה נקבעת מחדש בכל לחיצה, האישור עצמו היה זורק את המזכירות
// לרשימת המאושרות — בדיוק אחרי שטיפלה באחת.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, ChevronLeft, CheckCircle2, ListFilter } from 'lucide-react'

export default function AdjacentNav({
  prevId, nextId, allPrevId, allNextId, bucket, bucketLabel,
}: {
  prevId: string | null
  nextId: string | null
  /** שכנים ללא נעילה — כדי שהחלונית תוכל להמשיך ישירות, בלי סיבוב נוסף. */
  allPrevId: string | null
  allNextId: string | null
  bucket: string
  bucketLabel: string
}) {
  const router = useRouter()
  const [ended, setEnded] = useState<'prev' | 'next' | null>(null)
  const locked = bucket !== 'all'

  const go = (id: string | null, dir: 'prev' | 'next') => {
    if (id) { router.push(`/admin/maternity/${id}?st=${bucket}`); return }
    // ⚠️ ללא נעילה אין "סוף רשימה" להודיע עליו — פשוט הגענו לקצה הטבלה.
    if (locked) setEnded(dir)
  }

  const continueAll = () => {
    const id = ended === 'prev' ? allPrevId : allNextId
    setEnded(null)
    // ⚠️ st=all נשאר בכתובת: מכאן והלאה הניווט פתוח, וגם אם המזכירות תלחץ
    // "הבאה" שוב היא לא תיפול חזרה לנעילה שממנה בדיוק שוחררה.
    router.push(id ? `/admin/maternity/${id}?st=all` : '/admin/maternity')
  }

  const btn = 'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors'
  const live = 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700'
  const dead = 'text-slate-300'

  return (
    <>
      <div className="flex items-center rounded-lg border border-slate-200 overflow-hidden ml-1">
        <button type="button" onClick={() => go(prevId, 'prev')}
          disabled={!prevId && !locked}
          className={`${btn} border-l border-slate-200 ${prevId || locked ? live : dead}`}
          title={locked ? `ללידה הקודמת ב"${bucketLabel}"` : 'ללידה הקודמת'}>
          <ChevronRight size={15} /> ללידה הקודמת
        </button>
        <button type="button" onClick={() => go(nextId, 'next')}
          disabled={!nextId && !locked}
          className={`${btn} ${nextId || locked ? live : dead}`}
          title={locked ? `ללידה הבאה ב"${bucketLabel}"` : 'ללידה הבאה'}>
          ללידה הבאה <ChevronLeft size={15} />
        </button>
      </div>

      {/* תג הנעילה — בלעדיו אין שום סימן שהניווט מוגבל, ו"אין עוד יולדות"
          נראה כמו תקלה במקום כמו סוף הרשימה שבה עובדים. */}
      {locked && (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
          <ListFilter size={11} /> {bucketLabel}
        </span>
      )}

      {ended && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-4 border-emerald-500">
            <div className="bg-emerald-600 px-5 py-4 flex items-center gap-2.5">
              <CheckCircle2 size={22} className="text-white shrink-0" />
              <h3 className="text-base font-black text-white">סיימתם את הרשימה</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-slate-800 font-bold leading-relaxed">
                עברתם על כל היולדות בסטטוס <span className="text-emerald-700">{bucketLabel}</span>.
              </p>
              <p className="text-xs text-slate-500 leading-relaxed mt-2">
                אפשר להמשיך לעבור על כל היולדות בלי הגבלת סטטוס, או לחזור לרשימה ולבחור לשונית אחרת.
              </p>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button type="button" autoFocus onClick={continueAll}
                className="flex-1 inline-flex items-center justify-center gap-2 text-sm font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl px-4 py-3 transition-colors">
                המשך בכל היולדות
              </button>
              <button type="button" onClick={() => router.push('/admin/maternity')}
                className="inline-flex items-center justify-center text-sm font-bold text-slate-600 bg-white border-2 border-slate-300 hover:bg-slate-50 rounded-xl px-4 py-3 transition-colors">
                חזרה לרשימה
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
