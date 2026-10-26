// הרצת חלוקת הכרטיסים לממתינות (processAwaitingStock) ברקע.
//
// ⚠️ למה ברקע: כל כרטיס הוא טעינה בנדרים ושליחת שובר, כ-4 שניות. 50 כרטיסים
// הם כ-3.5 דקות, והבקשה נקטעה בפסק זמן באמצע: המסך הציג "is not valid JSON"
// כאילו ההוספה נכשלה, אף שהמלאי נוסף והחלוקה רצה. עכשיו הבקשה חוזרת מיד.
//
// ⚠️ הרצה אחת בכל רגע: שתי הרצות במקביל (לחיצה כפולה, הוספה תוך כדי חלוקה)
// היו ניגשות לאותה יולדת. בקשה שמגיעה בזמן ריצה מסמנת "להריץ שוב", והתור
// עובר פעם נוספת בסוף, כך שמלאי שנוסף באמצע לא נשכח.
// השרת ב-Railway הוא תהליך Node אחד שרץ ברציפות, ולכן ההרצה ממשיכה גם אחרי
// שהתשובה נשלחה.

type Runner = () => Promise<unknown>

let running: Promise<void> | null = null
let rerun = false

/** מפעיל את החלוקה ברקע. מחזיר true אם כבר רצה חלוקה (והבקשה נרשמה להרצה חוזרת). */
export function startAwaitingStockRun(run: Runner): { alreadyRunning: boolean } {
  if (running) { rerun = true; return { alreadyRunning: true } }
  running = (async () => {
    try {
      do {
        rerun = false
        try { await run() } catch (e) { console.error('[awaitingStockRunner] החלוקה נכשלה:', e) }
      } while (rerun)
    } finally {
      running = null
    }
  })()
  return { alreadyRunning: false }
}

export function isAwaitingStockRunning(): boolean { return running !== null }

/** לבדיקות: ממתין לסיום ההרצה הנוכחית. */
export async function awaitingStockIdle(): Promise<void> { while (running) await running }
