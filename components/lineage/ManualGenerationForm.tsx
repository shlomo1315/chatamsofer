'use client'

// טופס הוספת דור ידנית — קומפוננטה *אחת* לטופס הרישום ולדף תיקון סדר הדורות.
//
// 🔴 למה משותף ולא שני עותקים: כל האזהרות כאן נכתבו בעקבות נזק אמיתי בנתונים —
// תארים שנכנסו לתוך השם, כינויים במקום שם מלא, ודורות שנוספו ידנית כשהם כבר
// קיימים בעץ. עותק שני היה מקבל את התיקון הבא רק באחד משני המסכים, ומי שנכנס
// מהמסך השני היה ממשיך להזין בדיוק את מה שכבר תוקן.
//
// שלוש שכבות, וכל אחת נועדה לעצור טעות אחרת:
//  1. חלונית לפני הכל — "בדקתם שהדור הזה באמת לא ברשימה?"
//  2. חלונית בכניסה לשדה השם — "השם חייב להיות מלא ומדויק"
//  3. אזהרת התארים מעל השדות + ולידציה בשליחה
import { useState, useRef } from 'react'
import { AlertTriangle, Check, X } from 'lucide-react'
import { composeLineageName, findTitles } from '@/lib/lineageNameFormat'

const NON_HEBREW = /[^֐-׿ ׳״'"-]/g

export interface ManualGenerationValue {
  husband: string
  wife: string
  family: string
  relation: 'son' | 'son_in_law'
  /** השם המורכב בניסוח האחיד — «רבי X ומרת Y משפחה» */
  name: string
}

/**
 * חלונית 1 — לפני שנפתח הטופס בכלל.
 *
 * ⚠️ שני נוסחים לפי מצב הרשימה. כשיש דורות לבחור מהם, הוספה ידנית של דור קיים
 * היא המקור המרכזי לכפילויות ולכן האזהרה אדומה ומדברת על דחיית הרישום. כשאין
 * שום רשומה בדור הזה אין מול מה לבדוק, ואזהרה אדומה שם היא רק הפחדה.
 */
export function ManualAddGate({ hasOptions, generation, onConfirm, onCancel }: {
  hasOptions: boolean
  generation: number
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      {hasOptions ? (
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border-2 border-red-300">
          <div className="bg-red-600 px-5 py-4 flex items-center gap-2.5">
            <AlertTriangle size={22} className="text-white shrink-0" />
            <h3 className="text-base font-extrabold text-white">עצרו — בדקתם שהדור הזה באמת לא ברשימה?</h3>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-slate-800 font-bold leading-relaxed mb-3">
              אתם עומדים להוסיף את <span className="text-red-700">דור {generation}</span> באופן ידני.
              הוספה ידנית מיועדת <span className="underline">אך ורק</span> לדור שאינו קיים כלל במערכת.
            </p>
            <ul className="text-sm text-slate-700 leading-relaxed space-y-2 mb-3">
              <li className="flex gap-2">
                <span className="text-red-600 font-bold shrink-0">•</span>
                <span>חזרו לרשימה שמעל וּודאו <span className="font-bold">בוודאות מלאה</span> שהשם שאתם רוצים להוסיף אינו מופיע בה.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-red-600 font-bold shrink-0">•</span>
                <span>שימו לב גם לשינויי כתיב קלים בשם (למשל: יצחק / איצק, ה״א בסוף השם וכדומה).</span>
              </li>
            </ul>
            <div className="rounded-xl bg-red-50 border-2 border-red-300 px-4 py-3">
              <p className="text-sm font-extrabold text-red-800 leading-relaxed">
                אם תוסיפו ידנית דור שכבר קיים במערכת — הרישום שלכם יידחה.
              </p>
            </div>
          </div>
          <div className="px-5 pb-5 flex flex-col gap-2">
            <button type="button" onClick={onConfirm}
              className="w-full inline-flex items-center justify-center gap-2 text-sm font-bold text-white bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 rounded-xl px-4 py-3">
              <Check size={16} /> כן, בדקנו — הדור הזה אינו ברשימה, ממשיכים להוספה ידנית
            </button>
            <button type="button" onClick={onCancel}
              className="w-full inline-flex items-center justify-center gap-2 text-sm font-bold text-slate-700 bg-white border-2 border-slate-300 hover:bg-slate-50 rounded-xl px-4 py-3">
              <X size={16} /> נבדוק שוב ברשימה
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border-2 border-indigo-300">
          <div className="bg-indigo-600 px-5 py-4 flex items-center gap-2.5">
            <AlertTriangle size={22} className="text-white shrink-0" />
            <h3 className="text-base font-extrabold text-white">שימו לב — אתם מזינים דור חדש במערכת</h3>
          </div>
          <div className="px-5 py-4">
            <p className="text-sm text-slate-800 font-bold leading-relaxed mb-3">
              לא נמצאו עדיין רשומות מאושרות בדור {generation} — לכן אין רשימה לבחור ממנה, ואתם מזינים את הפרטים ישירות.
            </p>
            <div className="rounded-xl bg-indigo-50 border-2 border-indigo-200 px-4 py-3">
              <p className="text-sm font-extrabold text-indigo-900 leading-relaxed">
                יש להזין שם פרטי ושם משפחה בנפרד, ואת שם האישה — בצורה מדויקת ומלאה, בדיוק לפי ההנחיות שמופיעות בטופס (שם פרטי בלבד, בלי תארים).
              </p>
            </div>
          </div>
          <div className="px-5 pb-5">
            <button type="button" onClick={onConfirm}
              className="w-full inline-flex items-center justify-center gap-2 text-sm font-bold text-white bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 rounded-xl px-4 py-3">
              <Check size={16} /> הבנתי, ממשיכים למילוי הפרטים
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * חלונית 2 — ברגע הכניסה לשדה השם.
 *
 * ⚠️ האזהרה על התארים יושבת מעל השדות, ובפועל אנשים מתחילים להקליד בלי לקרוא
 * אותה. שם חלקי או כינוי אינו ניתן להצלבה מול העץ והרישום נפסל, ולכן הדרישה
 * עוצרת את הדרך לשדה במקום להיות עוד טקסט לידו.
 */
function NameGate({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border-4 border-red-500">
        <div className="bg-red-600 px-5 py-4 flex items-center gap-2.5">
          <AlertTriangle size={24} className="text-white shrink-0" />
          <h3 className="text-lg font-black text-white">עצרו! השם חייב להיות מדויק ומלא</h3>
        </div>
        <div className="px-5 py-4">
          <p className="text-base text-slate-900 font-extrabold leading-relaxed mb-3">
            יש להזין את <span className="text-red-700 underline">השם המלא במדויק</span>, בדיוק כפי שקראו לו —
            כולל כל השמות, ולא כינוי או קיצור.
          </p>
          <div className="rounded-xl bg-slate-50 border-2 border-slate-200 px-4 py-3 mb-3 space-y-2">
            <div className="flex gap-2 items-start">
              <span className="text-green-600 font-black shrink-0 text-lg leading-none mt-0.5">✓</span>
              <p className="text-sm text-slate-800 leading-relaxed">
                <span className="font-extrabold text-green-800">יצחק אייזיק</span> · <span className="font-extrabold text-green-800">משה יהודה לייב</span>
                <span className="block text-[11px] text-slate-500 mt-0.5">כל השמות, במלואם</span>
              </p>
            </div>
            <div className="flex gap-2 items-start">
              <span className="text-red-600 font-black shrink-0 text-lg leading-none mt-0.5">✗</span>
              <p className="text-sm text-slate-800 leading-relaxed">
                <span className="font-extrabold text-red-700">איצק</span> · <span className="font-extrabold text-red-700">לייבל</span> · <span className="font-extrabold text-red-700">משה י.</span>
                <span className="block text-[11px] text-slate-500 mt-0.5">כינוי, קיצור או ראשי תיבות</span>
              </p>
            </div>
          </div>
          <div className="rounded-xl bg-red-600 px-4 py-3.5 shadow-inner">
            <p className="text-base font-black text-white leading-relaxed text-center">
              שם שאינו מדויק — הרישום לא ייקלט במערכת.
            </p>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed mt-3">
            אנחנו מצליבים כל שם מול עץ הדורות. שם חלקי או כינוי אינו ניתן לזיהוי,
            ולכן הרישום נדחה ואי אפשר לשייך אתכם למשפחה.
          </p>
        </div>
        <div className="px-5 pb-5">
          <button type="button" autoFocus onClick={onClose}
            className="w-full inline-flex items-center justify-center gap-2 text-base font-black text-white bg-gradient-to-b from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-xl px-4 py-3.5 shadow-md">
            <Check size={18} /> הבנתי — אזין את השם המלא במדויק
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * הטופס עצמו — שמות פרטיים בלבד, והמערכת מרכיבה את הניסוח האחיד.
 *
 * ⚠️ שדות נפרדים ולא שדה חופשי: כשהיה שדה אחד כל אחד כתב אחרת, ואותו אדם נכנס
 * לעץ בארבעה ניסוחים שנראים כמו ארבעה אנשים.
 */
export default function ManualGenerationForm({
  generation, submitLabel = 'הוסף', busy = false, onSubmit, onCancel,
}: {
  generation: number
  submitLabel?: string
  busy?: boolean
  onSubmit: (v: ManualGenerationValue) => void
  onCancel: () => void
}) {
  const [husband, setHusband] = useState('')
  const [wife, setWife] = useState('')
  const [family, setFamily] = useState('')
  const [relation, setRelation] = useState<'son' | 'son_in_law' | null>(null)
  const [err, setErr] = useState('')
  const [nameGate, setNameGate] = useState(false)
  const [gateSeen, setGateSeen] = useState(false)
  const husbandRef = useRef<HTMLInputElement>(null)
  const wifeRef = useRef<HTMLInputElement>(null)
  const from = useRef<'husband' | 'wife'>('husband')

  // ⚠️ blur מיידי: בלי זה המקלדת בנייד נשארת פתוחה מעל החלונית, והמשתמש
  // מקליד לתוך שדה מוסתר בזמן שהאזהרה על המסך.
  const openGate = (which: 'husband' | 'wife') => {
    if (gateSeen) return
    from.current = which
    ;(which === 'husband' ? husbandRef : wifeRef).current?.blur()
    setNameGate(true)
  }

  const preview = composeLineageName({ husband, wife, family })

  const submit = () => {
    const bad = [...findTitles(husband), ...findTitles(wife)]
    if (bad.length) {
      setErr(`אין להזין תארים — הסירו «${bad.join('», «')}». המערכת מוסיפה "רבי" ו"מרת" לבד.`)
      return
    }
    if (!husband.trim() || !family.trim()) { setErr('יש להזין שם הבעל ושם משפחה'); return }
    if (!relation) { setErr('יש לבחור בן או חתן'); return }
    if (!preview) { setErr('לא ניתן לבנות שם מהפרטים'); return }
    setErr('')
    onSubmit({ husband: husband.trim(), wife: wife.trim(), family: family.trim(), relation, name: preview })
  }

  const input = 'rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/80 focus:border-indigo-400 placeholder:text-slate-400 transition-all'

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex flex-col gap-2" dir="rtl">
      {nameGate && <NameGate onClose={() => {
        setNameGate(false); setGateSeen(true)
        setTimeout(() => (from.current === 'husband' ? husbandRef : wifeRef).current?.focus(), 0)
      }} />}

      <p className="text-xs font-semibold text-amber-800">הוספת דור {generation} (ייכנס לאישור הצוות)</p>

      <div className="rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2.5">
        <p className="text-xs font-extrabold text-red-800 mb-1.5">
          ⚠️ יש להזין <span className="underline">שמות פרטיים בלבד</span> — בלי תארים!
        </p>
        <ul className="text-[11px] text-red-800 leading-relaxed space-y-0.5 pr-1">
          <li>✗ לא לכתוב לפני השם: <span className="font-bold">רבי · ר׳ · הרב · מוהר״ר · הרבנית · מרת</span></li>
          <li>✗ לא לכתוב אחרי השם: <span className="font-bold">שליט״א · הי״ו · ז״ל · זצ״ל · ע״ה</span></li>
          <li>✓ לדוגמה: לכתוב רק <span className="font-bold">משה</span> ורק <span className="font-bold">חיה</span></li>
        </ul>
        <p className="text-[11px] font-bold text-red-900 mt-1.5">המערכת מוסיפה «רבי» ו«מרת» אוטומטית.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-slate-600">שם הבעל (פרטי בלבד) *</span>
          <input ref={husbandRef} className={input} value={husband} onFocus={() => openGate('husband')}
            onChange={e => { setHusband(e.target.value.replace(NON_HEBREW, '')); setErr('') }} placeholder="משה" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold text-slate-600">שם האישה (פרטי בלבד)</span>
          <input ref={wifeRef} className={input} value={wife} onFocus={() => openGate('wife')}
            onChange={e => { setWife(e.target.value.replace(NON_HEBREW, '')); setErr('') }} placeholder="חיה" />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-bold text-slate-600">שם משפחה *</span>
        <input className={input} value={family}
          onChange={e => { setFamily(e.target.value.replace(NON_HEBREW, '')); setErr('') }} placeholder="כהן" />
      </label>

      {/* מה ייכנס בפועל — כדי שלא יצטרך לנחש */}
      {preview && (
        <div className="rounded-lg bg-white border border-amber-300 px-3 py-2">
          <span className="text-[11px] font-semibold text-slate-500">ייכנס לעץ כך: </span>
          <span className="text-sm font-extrabold text-amber-900">{preview}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-700">בן/חתן של הדור הקודם:</span>
        {(['son', 'son_in_law'] as const).map(r => (
          <button key={r} type="button" onClick={() => { setRelation(r); setErr('') }}
            className={`text-sm font-bold rounded-lg px-4 py-1.5 border-2 transition-all ${
              relation === r
                ? (r === 'son' ? 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-200' : 'bg-amber-500 text-white border-amber-600 shadow-md ring-2 ring-amber-200')
                : 'bg-white text-slate-700 border-slate-400 hover:border-slate-500 hover:bg-slate-50'}`}>
            {r === 'son' ? 'בן' : 'חתן'}
          </button>
        ))}
      </div>

      {err && <p className="text-xs text-red-600 font-bold">{err}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={busy}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 rounded-lg px-4 py-2 disabled:opacity-50">
          <Check size={12} /> {submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}
          className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-2">
          ביטול
        </button>
      </div>
    </div>
  )
}
