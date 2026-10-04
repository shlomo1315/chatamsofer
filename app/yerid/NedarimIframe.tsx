'use client'
import { useEffect, useRef, useState } from 'react'
import { Loader2, CreditCard, Copy, Check } from 'lucide-react'
import { parseMagneticCard, looksLikeMagneticSwipe } from '@/lib/magneticCard'

// ─────────────────────────────────────────────────────────────────────────────
// אייפרם סליקה — נדרים פלוס שיטה 3 (מסלול ב': עסקה שהוקמה בשרת).
//
// 🔴 postMessage לא עובד ב-localhost — רק בדומיין אמיתי. לבדוק בפרודקשן
// או בסביבת תצוגה מקדימה (/yerid101315), לא ב-npm run dev מקומי.
//
// 🔴 רישום כפול של addEventListener('message') = חיוב כפול. הרישום
// כאן קורה פעם אחת ב-useEffect עם תלות ריקה ומוסר ב-cleanup — לא
// בכל render, ולא בתוך callback שיכול לרוץ שוב.
//
// ⚠️ TransactionResponse שמגיע כאן הוא הודעה בדפדפן של התורם, וגולש
// עוין יכול לזייף אותה. היא משמשת רק לחוויית המשתמש (הצגת הודעת
// "מעבד תשלום" / שגיאה) — הקביעה הסופית "שולם" מגיעה מה-Webhook
// לשרת (payment-callback), וה-thank-you page שואל את השרת שלנו, לא
// סומך על מה שקרה כאן.
// ─────────────────────────────────────────────────────────────────────────────

/** 🔴 חייבת www — בלעדיו Google Pay נסגר מיד בלי הסבר. */
const IFRAME_SRC = 'https://www.matara.pro/nedarimplus/iframe/v3/?language=he'

type Status = 'loading' | 'ready' | 'processing' | 'done' | 'error'

interface Props {
  transactionId: string
  key_: string
  /** נקרא כש-TransactionResponse חוזר Status=OK — לרוב ניווט לדף תודה. */
  onSuccess: () => void
  /** נקרא כשהתורם לוחץ "חזרה" בתוך האייפרם. */
  onBack?: () => void
}

export default function NedarimIframe({ transactionId, key_, onSuccess, onBack }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  /** שגיאת שדה מהבדיקה המקדימה (תוקף/CVV/מספר כרטיס). */
  const [fieldError, setFieldError] = useState('')
  /** תוצאת סריקת כרטיס מגנטי — להצגה למוכר. */
  const [swipe, setSwipe] = useState<{ pan: string; tokef: string; error?: string } | null>(null)
  const [copied, setCopied] = useState('')
  const [height, setHeight] = useState(0)

  // ⚠️ עדכני תמיד בלי לגרום לרישום מחדש של ה-listener: הפונקציה
  // עצמה (handleMessage) לא תלויה ב-props ישירות, קוראת דרך ref.
  const propsRef = useRef({ onSuccess, onBack })
  propsRef.current = { onSuccess, onBack }

  useEffect(() => {
    // 🔴 נרשם פעם אחת בלבד לכל חיי הקומפוננטה — זו בדיוק האזהרה
    // הקריטית בתיעוד נדרים.
    function handleMessage(event: MessageEvent) {
      if (!event.data || typeof event.data !== 'object') return
      const { Name, Value } = event.data as { Name?: string; Value?: unknown }

      switch (Name) {
        case 'Height': {
          const h = parseInt(String(Value), 10)
          if (Number.isFinite(h)) setHeight(h + 15)
          break
        }
        case 'Ready':
          setStatus('ready')
          break
        case 'Back':
          propsRef.current.onBack?.()
          break
        case 'PendingTransaction':
          // ביט / העברה בקליק — ממתין לאישור באפליקציה, לא שגיאה.
          setStatus('processing')
          break
        case 'WalletCanceled':
          // הארנק נסגר — אם יש Reason, הדפדפן חסם את החלון; אחרת
          // התורם פשוט סגר. בשני המקרים הכפתור חוזר להיות לחיץ באייפרם.
          setStatus('ready')
          break
        // ── בדיקת תקינות השדות ──
        //
        // 🔴 נוסף אחרי שדווח ש"התוקף ו-3 הספרות לא נקלטים טוב":
        // בלי זה הלקוח לחץ "שלם", העסקה נדחתה, והוא קיבל הודעה
        // כללית בלי לדעת *איזה* שדה שגוי. נדרים מחזירה את השדה
        // המדויק (Card/Expiration/CVV) ואת סוג השגיאה — וזה מה
        // שמוצג כאן.
        //
        // ⚠️ שדות הכרטיס עצמם הם קוד של נדרים בתוך האייפרם ואין
        // לנו גישה אליהם. מה שכן בשליטתנו הוא לבקש את הבדיקה
        // ולהציג את התשובה.
        case 'ValidateFields': {
          if (Value === 'OK' || (Value as { Value?: string })?.Value === 'OK') {
            setFieldError('')
            break
          }
          const v = event.data as { Field?: string; ErrorType?: string }
          const FIELD: Record<string, string> = {
            Card: 'מספר הכרטיס',
            Expiration: 'תוקף הכרטיס',
            CVV: '3 הספרות שבגב הכרטיס',
          }
          // ⚠️ שדה ריק אינו שגיאה בזמן מילוי: הבדיקה רצה כל 2 שניות,
          // ו"יש למלא את מספר הכרטיס" היה מוצג ללקוח שרק התחיל להקליד.
          // מדווחים רק על ערך *שגוי*, שהוא מידע אמיתי.
          if (v.ErrorType === 'Empty') { setFieldError(''); break }
          const name = FIELD[String(v.Field ?? '')] ?? 'אחד משדות הכרטיס'
          setFieldError(`${name} אינו תקין — בדקו ונסו שוב`)
          break
        }
        case 'TransactionResponse': {
          const v = Value as { Status?: string; Message?: string } | undefined
          if (v?.Status === 'OK') {
            setStatus('done')
            propsRef.current.onSuccess()
          } else {
            setStatus('error')
            setErrorMsg(v?.Message || 'התשלום נכשל')
          }
          break
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // הזרקת העסקה ברגע שהאייפרם מוכן (Ready) — לא לפני, אחרת ההודעה אובדת.
  useEffect(() => {
    if (status !== 'ready') return
    const frame = frameRef.current
    if (!frame?.contentWindow) return
    frame.contentWindow.postMessage(
      { Name: 'StartPayment', Value: { TransactionId: transactionId, Key: key_ } },
      '*',
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  // ── קורא כרטיסים מגנטי ──
  //
  // 🔴 הקורא מתנהג כמקלדת ו"מקליד" את כל הפס ברצף אחד:
  //     ;4580000000000000=2812101...?
  // שדה מספר הכרטיס באייפרם בולע את ההתחלה ומתעלם מהשאר, ולכן
  // המספר יוצא ארוך מדי ("ספרות מיותרות") והתוקף לא מגיע ליעדו.
  // דווח בפועל: "מספר הכרטיס לא תקין נא לבדוק את הספרות".
  //
  // הפתרון: לקלוט את הסריקה ברמת הדף *לפני* שהיא מגיעה לאייפרם,
  // לפרק אותה, ולהציג את התוקף למוכר להקלדה.
  //
  // ⚠️ ה-CVV אינו קיים על הפס המגנטי (תקן ISO 7813) — הוא מודפס על
  // הכרטיס בלבד. לכן הוא תמיד יוזן ידנית, וזו מגבלת תקן ולא חוסר
  // במימוש.
  //
  // ⚠️ איננו יכולים להזין לשדות של האייפרם (origin אחר), ולכן
  // מוצגים למוכר המספר והתוקף להעתקה — וזה עדיין חוסך את הטעות.
  useEffect(() => {
    if (status !== 'ready') return
    let buf = ''
    let last = 0

    function onKey(e: KeyboardEvent) {
      const now = Date.now()
      // 🔴 קורא משדר מהר מאוד (<50ms בין תווים). הפרש גדול יותר
      // פירושו הקלדה אנושית — ואסור לנו לגעת בה.
      if (now - last > 120) buf = ''
      last = now

      if (e.key === 'Enter') {
        const raw = buf
        buf = ''
        if (!looksLikeMagneticSwipe(raw)) return
        const card = parseMagneticCard(raw)
        // ⚠️ הסריקה נבלעת כאן ואינה ממשיכה לשדות — אחרת היא הייתה
        // נדחפת שוב לשדה המספר וחוזרת על אותו באג.
        e.preventDefault()
        e.stopPropagation()
        setSwipe(card
          ? { pan: card.pan, tokef: card.tokefMMYY }
          : { pan: '', tokef: '', error: 'הסריקה לא פוענחה — הזינו את פרטי הכרטיס ידנית' })
        return
      }
      if (e.key.length === 1) buf += e.key
    }

    // ⚠️ capture: חייב לרוץ לפני שהאירוע מגיע לשדות.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [status])

  // ── בדיקת השדות תוך כדי מילוי ──
  //
  // 🔴 בלי בקשה יזומה אין תשובה: ValidateFields הוא *בקשה* לאייפרם,
  // לא אירוע שנשלח מאליו. בלי הלולאה הזו הלקוח היה מגלה שהתוקף שגוי
  // רק אחרי שהעסקה נדחתה — וזו בדיוק התלונה שדווחה.
  //
  // ⚠️ כל 2 שניות ולא בכל הקשה: אין לנו גישה לשדות (הם בתוך האייפרם),
  // ולכן אין אירוע הקלדה להיתלות בו. מרווח קצר מדי מציף את האייפרם.
  useEffect(() => {
    if (status !== 'ready') return
    const id = setInterval(() => {
      frameRef.current?.contentWindow?.postMessage({ Name: 'ValidateFields' }, '*')
    }, 2000)
    return () => clearInterval(id)
  }, [status])

  return (
    <div className="flex flex-col gap-3">
      {status === 'loading' && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> טוען מסך תשלום מאובטח…
        </div>
      )}
      {status === 'processing' && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ממתין לאישור התשלום באפליקציה…
        </p>
      )}
      {/* 🔴 ההנחיה חייבת להיות לפני הסריקה ולא אחריה: הקשות בתוך
          אייפרם מדומיין אחר אינן מגיעות אלינו, ולכן סריקה כשהסמן
          כבר בשדה הכרטיס תידחף לשדה ותיצור בדיוק את הבאג שדווח
          ("מספר הכרטיס לא תקין"). */}
      {status === 'ready' && !swipe && (
        <p className="rounded-xl border border-[#12314F]/15 bg-[#12314F]/5 px-4 py-2.5 text-sm text-[#12314F]">
          יש קורא כרטיסים? העבירו את הכרטיס <strong>לפני</strong> שלוחצים על שדות
          התשלום — המערכת תפענח את המספר והתוקף.
        </p>
      )}
      {/* ── תוצאת סריקת הכרטיס ──
          🔴 הסריקה נתפסת רק כשהמיקוד *מחוץ* לאייפרם: הקשות בתוך
          אייפרם מדומיין אחר אינן מגיעות אלינו כלל. לכן ההנחיה
          מפורשת — לסרוק לפני הלחיצה על השדות. */}
      {swipe && (
        <div className="rounded-xl border-2 border-[#2D5016]/30 bg-[#2D5016]/5 px-4 py-3">
          {swipe.error ? (
            <p className="text-sm text-[#6B2737]">{swipe.error}</p>
          ) : (
            <>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#2D5016]">
                <CreditCard size={15} /> הכרטיס נסרק — העתיקו לשדות
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'מספר הכרטיס', value: swipe.pan },
                  { label: 'תוקף', value: swipe.tokef.slice(0, 2) + '/' + swipe.tokef.slice(2) },
                ].map(f => (
                  <button
                    key={f.label}
                    type="button"
                    onClick={() => {
                      // ⚠️ התוקף מועתק בלי הלוכסן — כך נדרים מצפה לקבלו.
                      const raw = f.label === 'תוקף' ? swipe.tokef : f.value
                      navigator.clipboard?.writeText(raw)
                        .then(() => { setCopied(f.label); setTimeout(() => setCopied(''), 1500) })
                        .catch(() => {})
                    }}
                    className="flex items-center gap-1.5 rounded-lg border border-[#2D5016]/25 bg-white px-3 py-1.5 text-sm"
                  >
                    {copied === f.label ? <Check size={13} className="text-[#2D5016]" /> : <Copy size={13} className="text-[#141210]/40" />}
                    <span className="text-[#141210]/55">{f.label}:</span>
                    <span className="font-mono font-semibold" dir="ltr">{f.value}</span>
                  </button>
                ))}
              </div>
              {/* ⚠️ ה-CVV אינו על הפס המגנטי (תקן ISO 7813) — הוא מודפס
                  על הכרטיס בלבד. אמירה מפורשת, אחרת המוכר יחפש אותו. */}
              <p className="mt-2 text-xs text-[#141210]/45">
                את 3 הספרות שבגב הכרטיס יש להקליד ידנית — הן אינן על הפס המגנטי
              </p>
            </>
          )}
        </div>
      )}

      {/* 🔴 שגיאת שדה מוצגת בנפרד משגיאת עסקה: היא ניתנת לתיקון
          מיידי, ואילו שגיאת עסקה דורשת ניסיון חדש. */}
      {fieldError && status !== 'done' && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {fieldError}
        </p>
      )}
      {status === 'error' && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
        </p>
      )}
      <iframe
        ref={frameRef}
        // allow="payment" חובה כדי ש-Google Pay / Apple Pay יוכלו להיפתח
        // בתוך האייפרם — בלעדיו הם פשוט לא מוצגים.
        allow="payment"
        scrolling="no"
        src={IFRAME_SRC}
        style={{ width: '100%', border: 'none', height: height || (status === 'loading' ? 0 : 480) }}
        title="תשלום מאובטח — נדרים פלוס"
      />
    </div>
  )
}
