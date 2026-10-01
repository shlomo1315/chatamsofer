// מסנכרן את MESSAGE_FALLBACKS ב-lib/bookFairYemotIvr.ts מתוך
// BOOK_FAIR_MESSAGE_META ב-lib/yemotBookFairMessages.ts.
//
// 🔴 למה הכפילות קיימת: מכונת המצבים חייבת להישאר טהורה (בלי גישה
// למסד) כדי שאפשר יהיה לבדוק בטסטים מה המתקשר שומע. ייבוא המטא-דאטה
// היה גורר את getServiceClient לתוכה.
//
// ⚠️ הסקריפט הזה הוא מה שמונע סטייה: lib/bookFairYemotMessages.test.ts
// נכשל כששתי הטבלאות אינן זהות, והרצה כאן מיישרת אותן אוטומטית במקום
// להעתיק 60 שורות ביד (ולפספס אחת).
//
// שימוש: node scripts/sync-book-fair-fallbacks.mjs

import { readFileSync, writeFileSync } from 'node:fs'

const META_FILE = 'lib/yemotBookFairMessages.ts'
const IVR_FILE = 'lib/bookFairYemotIvr.ts'
const MARKER = 'export const MESSAGE_FALLBACKS: Record<string, string> = {'

const src = readFileSync(META_FILE, 'utf8')

// ⚠️ חיתוך לבלוק המטא-דאטה בלבד: בהמשך הקובץ יש defaultText בהערות
// ובפונקציות, וסריקה על כל הקובץ הייתה קולטת אותם.
const metaStart = src.indexOf('export const BOOK_FAIR_MESSAGE_META')
const metaEnd = src.indexOf('\n]', metaStart)
if (metaStart < 0 || metaEnd < 0) {
  console.error('🔴 לא נמצא בלוק BOOK_FAIR_MESSAGE_META')
  process.exit(1)
}
const metaBlock = src.slice(metaStart, metaEnd)

const entryRe = /\{\s*key:\s*'([^']+)'[\s\S]*?defaultText:\s*'((?:[^'\\]|\\.)*)'/g

const entries = []
let m
while ((m = entryRe.exec(metaBlock)) !== null) entries.push([m[1], m[2]])

if (!entries.length) {
  console.error('🔴 לא חולץ אף נוסח — הפורמט השתנה?')
  process.exit(1)
}

// ⚠️ בדיקת כפילות מפתח: שני ערכים לאותו מפתח היו גורמים לכך שאחד
// מהם נבלע בשקט, והנוסח בטלפון לא היה מה שרואים במסך.
const seen = new Set()
const dups = entries.filter(([k]) => seen.has(k) || (seen.add(k), false)).map(([k]) => k)
if (dups.length) {
  console.error(`🔴 מפתחות כפולים: ${dups.join(', ')}`)
  process.exit(1)
}

const body = entries.map(([k, v]) => `  ${k}: '${v}',`).join('\n')

const ivr = readFileSync(IVR_FILE, 'utf8')
const start = ivr.indexOf(MARKER)
if (start < 0) {
  console.error(`🔴 לא נמצא "${MARKER}"`)
  process.exit(1)
}
const end = ivr.indexOf('\n}', start)
if (end < 0) {
  console.error('🔴 לא נמצא סוף הטבלה')
  process.exit(1)
}

writeFileSync(IVR_FILE, ivr.slice(0, start) + MARKER + '\n' + body + ivr.slice(end))
console.log(`✅ ${entries.length} נוסחים סונכרנו ל-${IVR_FILE}`)
