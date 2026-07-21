// כפיית LTR על מספרים/שעות/תאריכים המשובצים בטקסט עברי ב-PDF.
//
// pdf-lib עם פונט עברי מציג טקסט עברי טהור נכון; הבעיה היחידה היא רצפי ספרות (מספרים,
// שעות, תאריכים) שמוצגים הפוכים. עוטפים כל רצף כזה ב-LRO…POP כך שיוצג LTR תקין.
// (bidi-js/getReorderedString נוסה ונזנח — הוא ביצע reordering על כל הטקסט וגרם להיפוך.)
const LRO = '‭' // LEFT-TO-RIGHT OVERRIDE
const POP = '‬' // POP DIRECTIONAL FORMATTING

export function toVisual(text: string): string {
  let s = String(text ?? '')
  // כתובות מייל / דומיינים (רצף לטיני עם @ או .) — כטוקן LTR שלם
  s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, m => `${LRO}${m}${POP}`)
  // מספרים / שעות / תאריכים / טלפונים — כולל טווחים ("19:00 - 21:00")
  s = s.replace(
    /\d[\d.,:/]*(?:\s*[-–]\s*\d[\d.,:/]*)*/g,
    m => `${LRO}${m.replace(/\s*([-–])\s*/g, ' $1 ').replace(/\s+/g, ' ')}${POP}`,
  )
  return s
}
