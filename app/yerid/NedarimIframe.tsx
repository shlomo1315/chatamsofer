'use client'
import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

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
