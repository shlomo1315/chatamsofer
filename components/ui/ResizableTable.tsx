'use client'
import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { fitWidths } from '@/lib/tableColumnLayout'

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
// ⚠️ מצב FixedWidths נשמר בנפרד ולפי מפתח העמודה — הפורמט שונה.
const KEYED_PREFIX = 'tblcolsk:'

/**
 * רוחב מועדף בפיקסלים לכל עמודה (מצב סידור עמודות).
 *
 * 🔴 הרוחב נשמר לפי *מפתח* העמודה ולא לפי מיקומה: כשהמשתמש מזיז עמודה,
 * שמירה לפי מיקום הייתה מעבירה את הרוחב לעמודה שנכנסה במקומה.
 *
 * ⚠️ כשהסכום גדול מ-box, העמודות מתכווצות יחסית עד mins (fitWidths).
 * מתחת לזה מי שקורא אחראי להסתיר עמודות (fitMask) — אין גלילה לרוחב.
 */
export interface FixedWidths {
  keys: readonly string[]
  /** רוחב ברירת המחדל לכל עמודה. */
  px: readonly number[]
  /** רוחב מינימלי לכל עמודה (ברירת מחדל MIN_WIDTH). */
  mins?: readonly number[]
  /** רוחב הטבלה בפועל. 0 = טרם נמדד — בלי התאמה. */
  box?: number
}

export interface ResizableColumns {
  /** <col> לכל עמודה — חייב להיכנס בתוך <colgroup> בראש הטבלה. */
  cols: ReactNode
  /** ידית הגרירה — נכנסת בתוך <th> שיש לו `relative`. */
  handle: (index: number) => ReactNode
  /** סגנון הטבלה (table-layout: fixed). */
  tableStyle: React.CSSProperties
  /** איפוס לרוחב ברירת המחדל. */
  reset: () => void
  /** איפוס עמודה אחת לרוחב ברירת המחדל. */
  resetCol: (index: number) => void
  /** הרוחב בפיקסלים בפועל — רק במצב FixedWidths (אחרת 0). */
  widthOf: (index: number) => number
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
  /** רוחב קבוע בפיקסלים, שמור לפי מפתח — ראו FixedWidths. גובר על weights. */
  fixed?: FixedWidths,
): ResizableColumns {
  const prefix = fixed ? KEYED_PREFIX : STORAGE_PREFIX
  // מפתח השמירה של עמודה: המפתח שלה במצב FixedWidths, אחרת המיקום.
  const fixedRef = useRef(fixed)
  useEffect(() => { fixedRef.current = fixed })
  const sk = useCallback((i: number): string => (fixedRef.current ? fixedRef.current.keys[i] : String(i)), [])
  const minOf = useCallback((i: number) => fixedRef.current?.mins?.[i] ?? MIN_WIDTH, [])

  const [widths, setWidths] = useState<Record<string, number>>({})
  const [loaded, setLoaded] = useState(false)
  const dragRef = useRef<{ key: string; min: number; startX: number; startW: number } | null>(null)
  const thRefs = useRef<Record<number, HTMLElement | null>>({})
  // 🔴 22.11.2026: רוחב שנגרר נשמר בפיקסלים. במסך צר יותר סכום העמודות עלה על
  // המקום, והטבלה (צאצאים) יצאה 250px מהמסגרת. מודדים את רוחב המיכל בפועל
  // ומכווצים את הרוחבים השמורים באופן יחסי כשהם לא נכנסים.
  // ⚠️ לא במצב FixedWidths: שם ההתאמה נעשית לפי fixed.box (fitWidths).
  const [boxW, setBoxW] = useState(0)
  const hasWidths = Object.keys(widths).length > 0
  const isFixed = !!fixed
  useEffect(() => {
    if (!hasWidths || isFixed) return
    const th = Object.values(thRefs.current).find(Boolean)
    const box = th?.closest('table')?.parentElement
    if (!box || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setBoxW(Math.round(e.contentRect.width)))
    ro.observe(box)
    return () => ro.disconnect()
  }, [hasWidths, loaded, isFixed])

  // ⚠️ נטען אחרי הרינדור הראשון ולא ב-useState: קריאה מ-localStorage בזמן
  // הרינדור מייצרת אי-התאמה בין השרת ללקוח (hydration mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(prefix + tableId)
      if (raw) setWidths(JSON.parse(raw))
    } catch { /* אחסון חסום — פשוט בלי שמירה */ }
    setLoaded(true)
  }, [tableId, prefix])

  const persist = useCallback((next: Record<string, number>) => {
    try { localStorage.setItem(prefix + tableId, JSON.stringify(next)) } catch { /* ignore */ }
  }, [tableId, prefix])

  const onDown = useCallback((index: number) => (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault()
    e.stopPropagation()
    // ⚠️ הרוחב ההתחלתי נמדד מה-DOM ולא מהמצב: עמודה שטרם כווננה אין לה
    // ערך שמור, וגרירה הייתה קופצת מאפס.
    const th = thRefs.current[index] ?? (e.currentTarget.closest('th') as HTMLElement | null)
    const startW = th?.getBoundingClientRect().width ?? 120
    dragRef.current = { key: sk(index), min: minOf(index), startX: e.clientX, startW }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [sk, minOf])

  const onMove = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    const d = dragRef.current
    if (!d) return
    // 🔴 היפוך הכיוון ב-RTL: גרירה שמאלה מגדילה עמודה, כי הטבלה נקראת
    // מימין לשמאל. בלי ההיפוך הידית "בורחת" מהעכבר.
    const delta = d.startX - e.clientX
    const next = Math.max(d.min, Math.round(d.startW + delta))
    setWidths(prev => ({ ...prev, [d.key]: next }))
  }, [])

  const onUp = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    setWidths(prev => { persist(prev); return prev })
  }, [persist])

  // לחיצה כפולה על הידית — איפוס העמודה הבודדת לרוחב ברירת המחדל.
  const resetCol = useCallback((index: number) => {
    const key = sk(index)
    setWidths(prev => {
      const next = { ...prev }
      delete next[key]
      persist(next)
      return next
    })
  }, [persist, sk])

  // ⚠️ ברינדור המפתח נלקח מ-fixed הנוכחי ולא מה-ref: ה-ref מתעדכן רק אחרי
  // הרינדור, ואחרי הזזת עמודה הרוחב היה נשאר לרגע על העמודה שהייתה שם.
  const widthOf = (i: number) =>
    fixed ? Math.max(fixed.mins?.[i] ?? MIN_WIDTH, widths[fixed.keys[i]] || fixed.px[i] || MIN_WIDTH) : 0

  // ⚠️ המשקלים מנורמלים לאחוזים לפי העמודות המוצגות *בפועל*: כשמסתירים
  // עמודה, הרוחב שלה מתחלק בין הנותרות ולא נשאר חור.
  const totalWeight = weights?.length
    ? weights.slice(0, count).reduce((a, b) => a + (b || 1), 0)
    : 0

  const draggedSum = Array.from({ length: count }, (_, i) => widths[i] || 0).reduce((a, b) => a + b, 0)
  const free = Array.from({ length: count }, (_, i) => widths[i]).filter(w => !w).length
  const scale = boxW && draggedSum && draggedSum + free * MIN_WIDTH > boxW
    ? Math.max(0, boxW - free * MIN_WIDTH) / draggedSum
    : 1
  // 🔴 במצב FixedWidths הרוחבים מותאמים לרוחב הטבלה (fitWidths): כל עמודה
  // מתכווצת יחסית, אף אחת לא מתחת למינימום, ואין גלילה לרוחב.
  const fitted = fixed
    ? fitWidths(
        Array.from({ length: count }, (_, i) => widthOf(i)),
        Array.from({ length: count }, (_, i) => fixed.mins?.[i] ?? MIN_WIDTH),
        fixed.box ?? 0,
      )
    : []
  const cols = Array.from({ length: count }, (_, i) => {
    if (fixed) return <col key={fixed.keys[i]} style={{ width: `${fitted[i]}px` }} />
    // רוחב שהמשתמש גרר גובר תמיד על ברירת המחדל — מכווץ יחסית כשלא נכנס.
    if (widths[i]) return <col key={i} style={{ width: `${Math.max(MIN_WIDTH, Math.floor(widths[i] * scale))}px` }} />
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
      onDoubleClick={() => resetCol(index)}
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
    // ⚠️ במצב FixedWidths: fixed תמיד — הרוחבים כבר מותאמים ל-box.
    tableStyle: fixed
      ? { tableLayout: 'fixed' }
      : loaded && Object.keys(widths).length ? { tableLayout: 'fixed' } : {},
    reset: () => {
      setWidths({})
      try { localStorage.removeItem(prefix + tableId) } catch { /* ignore */ }
    },
    resetCol,
    widthOf,
    customized: Object.keys(widths).length > 0,
    // break-words שובר גם מחרוזת רצופה בלי רווחים (מייל ארוך, ת"ז),
    // ו-align-top מיישר את כל התאים לראש כשהשורה מתגבהת.
    // 🔴 overflow-wrap:anywhere ולא break-words: רק הוא נספר בחישוב רוחב העמודה
    // (min-content). עם break-words מייל ארוך הרחיב את הטבלה מעבר למסגרת (תפוצת היריד).
    cellClass: 'whitespace-normal break-words [overflow-wrap:anywhere] align-top',
  }
}
