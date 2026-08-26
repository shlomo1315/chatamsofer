'use client'
import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// גרירת רוחב עמודות — כמו באקסל. רכיב מערכתי אחד לכל טבלאות המערכת.
//
// השימוש: לעטוף את ה-<table> ולתת לכל <th> את הידית.
//
//   const rt = useResizableColumns('holiday-recipients', ['שם', 'ת"ז', ...])
//   <table style={rt.tableStyle}>
//     <colgroup>{rt.cols}</colgroup>
//     <thead><tr>{headers.map((h, i) => (
//       <th key={h} className="relative">{h}{rt.handle(i)}</th>
//     ))}</tr></thead>
//
// 🔴 הרוחב נשמר ב-localStorage לפי מזהה הטבלה: מי שכיוונן עמודה מצפה
// שהיא תישאר כך גם מחר. איפוס בכל טעינה הופך את הכיוונון לחסר טעם.
//
// ⚠️ table-layout: fixed נדרש כדי שרוחב מוגדר יכובד. בלעדיו הדפדפן
// מתעלם מהערכים ומחשב רוחב לפי התוכן — כלומר הגרירה לא תעשה דבר.
//
// ⚠️ אין overflow-x: הכלל במערכת הוא שאין גלילה לרוחב. הגרירה מחלקת
// מחדש את הרוחב הקיים; היא אינה מרחיבה את הטבלה מעבר למסך.
//
// 🔴 גלישת טקסט ולא חיתוך: עמודה שהוצרה שוברת את הטקסט לשורות והשורה
// מתגבהת — כמו באקסל. לכן `cellClass` **חייב** להחליף את
// truncate/whitespace-nowrap בתאים; אחרת הצרת עמודה מסתירה מידע במקום
// להציג אותו אחרת.
// ─────────────────────────────────────────────────────────────────────────────

const MIN_WIDTH = 56
const STORAGE_PREFIX = 'tblcols:'

export interface ResizableColumns {
  /** <col> לכל עמודה — חייב להיכנס בתוך <colgroup> בראש הטבלה. */
  cols: ReactNode
  /** ידית הגרירה — נכנסת בתוך <th> שיש לו `relative`. */
  handle: (index: number) => ReactNode
  /** סגנון הטבלה (table-layout: fixed). */
  tableStyle: React.CSSProperties
  /** איפוס לרוחב ברירת המחדל. */
  reset: () => void
  /** האם המשתמש שינה רוחב כלשהו — לצורך הצגת "איפוס". */
  customized: boolean
  /**
   * המחלקות לתא, כך שהטקסט **גולש** ולא נחתך.
   *
   * ⚠️ להחליף בהן כל truncate / whitespace-nowrap / max-w בתאי הטבלה.
   * עמודה צרה אמורה לשבור שורה ולהגביה את השורה, לא להעלים תוכן.
   */
  cellClass: string
}

export function useResizableColumns(
  /** מזהה יציב לטבלה — מפתח השמירה. שינוי שלו מאבד את הכיוונון. */
  tableId: string,
  /** מספר העמודות. ⚠️ משתנה כשמסתירים עמודות — ראה ההערה למטה. */
  count: number,
  /**
   * משקל יחסי לכל עמודה, לפני שהמשתמש גורר.
   *
   * 🔴 בלי זה table-layout:fixed מחלק את הרוחב **שווה בשווה**: "שם מלא"
   * מקבל בדיוק כמו "ילדים", השם מתכווץ לשתי שורות והעמודות האחרונות
   * נדחסות. זה מה שקרה כשהוסרו ה-min-w הקשיחים.
   *
   * ⚠️ אחוזים ולא פיקסלים: סכום פיקסלים גדול מהמסך מחזיר בדיוק את
   * הבעיה שבגללה הוסרו ה-min-w — הדפדפן מתעלם מהרוחב והעמודות זזות.
   * אחוזים תמיד מסתכמים ל-100% ולכן אין גלילה לרוחב.
   */
  weights?: readonly number[],
): ResizableColumns {
  const [widths, setWidths] = useState<Record<number, number>>({})
  const [loaded, setLoaded] = useState(false)
  const dragRef = useRef<{ index: number; startX: number; startW: number } | null>(null)
  const thRefs = useRef<Record<number, HTMLElement | null>>({})

  // ⚠️ נטען אחרי הרינדור הראשון ולא ב-useState: קריאה מ-localStorage בזמן
  // הרינדור מייצרת אי-התאמה בין השרת ללקוח (hydration mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + tableId)
      if (raw) setWidths(JSON.parse(raw))
    } catch { /* אחסון חסום — פשוט בלי שמירה */ }
    setLoaded(true)
  }, [tableId])

  const persist = useCallback((next: Record<number, number>) => {
    try { localStorage.setItem(STORAGE_PREFIX + tableId, JSON.stringify(next)) } catch { /* ignore */ }
  }, [tableId])

  const onDown = useCallback((index: number) => (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault()
    e.stopPropagation()
    // ⚠️ הרוחב ההתחלתי נמדד מה-DOM ולא מהמצב: עמודה שטרם כווננה אין לה
    // ערך שמור, וגרירה הייתה קופצת מאפס.
    const th = thRefs.current[index] ?? (e.currentTarget.closest('th') as HTMLElement | null)
    const startW = th?.getBoundingClientRect().width ?? 120
    dragRef.current = { index, startX: e.clientX, startW }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])

  const onMove = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    const d = dragRef.current
    if (!d) return
    // 🔴 היפוך הכיוון ב-RTL: גרירה שמאלה מגדילה עמודה, כי הטבלה נקראת
    // מימין לשמאל. בלי ההיפוך הידית "בורחת" מהעכבר.
    const delta = d.startX - e.clientX
    const next = Math.max(MIN_WIDTH, Math.round(d.startW + delta))
    setWidths(prev => ({ ...prev, [d.index]: next }))
  }, [])

  const onUp = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    setWidths(prev => { persist(prev); return prev })
  }, [persist])

  // לחיצה כפולה על הידית — איפוס העמודה הבודדת לרוחב אוטומטי.
  const onDoubleClick = useCallback((index: number) => () => {
    setWidths(prev => {
      const next = { ...prev }
      delete next[index]
      persist(next)
      return next
    })
  }, [persist])

  // ⚠️ המשקלים מנורמלים לאחוזים לפי העמודות המוצגות *בפועל*: כשמסתירים
  // עמודה, הרוחב שלה מתחלק בין הנותרות ולא נשאר חור.
  const totalWeight = weights?.length
    ? weights.slice(0, count).reduce((a, b) => a + (b || 1), 0)
    : 0

  const cols = Array.from({ length: count }, (_, i) => {
    // רוחב שהמשתמש גרר גובר תמיד על ברירת המחדל.
    if (widths[i]) return <col key={i} style={{ width: `${widths[i]}px` }} />
    if (totalWeight > 0) {
      const w = (weights![i] || 1) / totalWeight * 100
      return <col key={i} style={{ width: `${w.toFixed(3)}%` }} />
    }
    return <col key={i} />
  })

  const handle = (index: number) => (
    // ⚠️ הידית על *הגבול* של התא (השמאלי ב-RTL), ברוחב 7px — מספיק כדי
    // לתפוס בעכבר בלי לחסום את הטקסט או את מיון-בלחיצה על הכותרת.
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="שינוי רוחב העמודה"
      onPointerDown={onDown(index)}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onDoubleClick={onDoubleClick(index)}
      title="גררו לשינוי הרוחב · לחיצה כפולה לאיפוס"
      className="absolute inset-y-0 left-0 z-10 w-[7px] cursor-col-resize select-none touch-none
                 before:absolute before:inset-y-1 before:left-[3px] before:w-px before:bg-transparent
                 hover:before:bg-indigo-400 active:before:bg-indigo-600"
      ref={el => {
        // שומרים הפניה ל-<th> המכיל, למדידת הרוחב ההתחלתי.
        thRefs.current[index] = el?.closest('th') ?? null
      }}
    />
  )

  return {
    cols,
    handle,
    // ⚠️ fixed רק אחרי שהמצב נטען: לפני כן עדיף auto, אחרת הטבלה מהבהבת
    // מרוחב שווה לרוחב השמור.
    tableStyle: loaded && Object.keys(widths).length ? { tableLayout: 'fixed' } : {},
    reset: () => {
      setWidths({})
      try { localStorage.removeItem(STORAGE_PREFIX + tableId) } catch { /* ignore */ }
    },
    customized: Object.keys(widths).length > 0,
    // break-words שובר גם מחרוזת רצופה בלי רווחים (מייל ארוך, ת"ז),
    // ו-align-top מיישר את כל התאים לראש כשהשורה מתגבהת.
    cellClass: 'whitespace-normal break-words align-top',
  }
}
