// ─────────────────────────────────────────────────────────────────────────────
// ייבוא ההלוואות מהמערכת הקודמת ("שטרות חתם סופר") לטבלת legacy_loans.
//
// הרצה:
//   node scripts/import-legacy-loans.mjs "שטרות חתם סופר_202608171741.xlsx"
//   node scripts/import-legacy-loans.mjs <קובץ> --dry     ← תצוגה מקדימה בלבד
//
// משתני סביבה (מ-.env.local או מהסביבה):
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// ⚠️ אידמפוטנטי: מזוהה לפי file_number (מספר התיק). הרצה חוזרת מעדכנת
// שורות קיימות במקום לשכפל אותן.
//
// 🔴 שורה שסומנה manually_edited **מדולגת** — כדי שייבוא חוזר לא ידרוס
// תיקונים ידניים שנעשו במסך.
// ─────────────────────────────────────────────────────────────────────────────

import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'

// ── טעינת .env.local ──
// ⚠️ ידנית ולא דרך dotenv: אינו תלות של הפרויקט, והסקריפט אמור לרוץ כמו-שהוא.
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
}

const file = process.argv[2]
const dryRun = process.argv.includes('--dry')

if (!file) {
  console.error('שימוש: node scripts/import-legacy-loans.mjs <קובץ.xlsx> [--dry]')
  process.exit(1)
}
if (!existsSync(file)) {
  console.error(`הקובץ לא נמצא: ${file}`)
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!dryRun && (!url || !key)) {
  console.error('חסרים NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

// ── עזרי פירוש ──
// ⚠️ משוכפלים מ-lib/legacyLoans.ts ולא מיובאים: זה קובץ TS ו-node מריץ
// כאן .mjs גולמי בלי שלב בנייה. כל שינוי בכללים — לעדכן בשני המקומות.
const cellValue = v =>
  v && typeof v === 'object'
    ? (v.result ?? v.text ?? (v.richText ? v.richText.map(t => t.text).join('') : ''))
    : v

const normalizeId = v => String(cellValue(v) ?? '').replace(/\D/g, '')

// ⚠️ ערך מוחלט: הסכום שבוצע רשום שלילי באקסל (חיוב בהנהלת חשבונות).
// ⚠️ ניקוי תווי כיווניות ומטבע: התאים בצורת "‪$ 9,000.00‬" ו-Number() עליהם NaN.
const parseAmount = v => {
  const raw = String(cellValue(v) ?? '')
  const cleaned = raw.replace(/[^0-9.\-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.abs(n) : null
}

const text = v => {
  const s = String(cellValue(v) ?? '').trim()
  return s === '' ? null : s
}

// ── קריאת הגיליון ──
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
const ws = wb.worksheets[0]

// עמודות לפי כותרות שורה 1 — ולא לפי מיקום קבוע, כדי שהוספת עמודה
// באקסל לא תסיט את כל הייבוא בשקט.
const headers = {}
const headerRow = ws.getRow(1)
for (let c = 1; c <= ws.columnCount; c++) {
  const h = String(cellValue(headerRow.getCell(c).value) ?? '').trim()
  if (h) headers[h] = c
}

const COL = {
  file: headers['מס_תיק'],
  fund: headers['קרן'],
  id: headers['ת_זהות'],
  name: headers['שם'],
  address: headers['כתובת'],
  city: headers['ישוב'],
  phone: headers['טלפון נייד'],
  email: headers['אימייל'],
  approved: headers['סכום שאושר'],
  installments: headers['סך_תשלומים'],
  taken: headers['סך הכל בוצע הלוואה'],
}

const missing = Object.entries(COL).filter(([, v]) => !v).map(([k]) => k)
if (missing.length) {
  console.error(`עמודות חסרות בקובץ: ${missing.join(', ')}`)
  console.error(`כותרות שנמצאו: ${Object.keys(headers).join(' | ')}`)
  process.exit(1)
}

const rows = []
const unlinkable = []

for (let r = 2; r <= ws.rowCount; r++) {
  const row = ws.getRow(r)
  const name = text(row.getCell(COL.name).value)
  const idDigits = normalizeId(row.getCell(COL.id).value)
  if (!name && !idDigits) continue   // שורה ריקה

  const approved = parseAmount(row.getCell(COL.approved).value)
  const taken = parseAmount(row.getCell(COL.taken).value)
  const inst = parseAmount(row.getCell(COL.installments).value)

  // ת"ז ישראלית עד 9 ספרות. חריגה נשמרת (שום נתון לא נזרק) אך לא תתחבר
  // לאף משפחה עד שתתוקן ידנית.
  if (idDigits.length < 5 || idDigits.length > 9) {
    unlinkable.push({ row: r, name, id: idDigits || '(ריק)' })
  }

  rows.push({
    file_number: text(row.getCell(COL.file).value),
    fund: text(row.getCell(COL.fund).value),
    id_number: idDigits || null,
    borrower_name: name,
    address: text(row.getCell(COL.address).value),
    city: text(row.getCell(COL.city).value),
    phone: text(row.getCell(COL.phone).value),
    email: text(row.getCell(COL.email).value),
    approved_amount: approved,
    taken_amount: taken,
    installments: inst === null ? null : Math.round(inst),
    source_row: r,
  })
}

// ── סיכום לפני כתיבה ──
const takenCount = rows.filter(r => r.taken_amount !== null).length
const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) ?? 0), 0)

console.log('─'.repeat(58))
console.log(`קובץ: ${file}`)
console.log(`שורות נתונים:      ${rows.length}`)
console.log(`נלקחו בפועל:       ${takenCount}`)
console.log(`אושרו ולא נלקחו:   ${rows.length - takenCount}`)
console.log(`סה"כ אושר:         $${sum(rows, r => r.approved_amount).toLocaleString('he-IL')}`)
console.log(`סה"כ נלקח:         $${sum(rows, r => r.taken_amount).toLocaleString('he-IL')}`)
console.log(`ת"ז ייחודיות:      ${new Set(rows.map(r => r.id_number).filter(Boolean)).size}`)

if (unlinkable.length) {
  console.log(`\n⚠️  ${unlinkable.length} שורות ללא ת"ז תקינה — ייובאו אך לא ישויכו:`)
  for (const u of unlinkable) console.log(`     שורה ${u.row}: ${u.name} · ת"ז "${u.id}"`)
}
console.log('─'.repeat(58))

if (dryRun) {
  console.log('\n[--dry] תצוגה מקדימה בלבד. לא נכתב דבר למסד.')
  process.exit(0)
}

// ── כתיבה ──
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// 🔴 שורות שנערכו ידנית מדולגות — ראה הערת הפתיחה.
const { data: edited } = await db
  .from('legacy_loans').select('file_number').eq('manually_edited', true)
const skip = new Set((edited ?? []).map(e => String(e.file_number)))
if (skip.size) console.log(`מדלג על ${skip.size} שורות שנערכו ידנית.`)

const toWrite = rows.filter(r => !r.file_number || !skip.has(String(r.file_number)))

// ⚠️ במנות של 500: upsert של 1,148 שורות בבקשה אחת חורג ממגבלות הבקשה.
const CHUNK = 500
let written = 0
for (let i = 0; i < toWrite.length; i += CHUNK) {
  const batch = toWrite.slice(i, i + CHUNK)
  // ⚠️ onConflict מול אינדקס *חלקי* (where file_number is not null):
  // PostgREST אינו מעביר את תנאי האינדקס, ולכן ההתאמה עלולה להיכשל ב-42P10
  // בדיוק כמו ב-SQL ידני. אם זה קורה — ראה scripts/legacy-loans-to-sql.mjs,
  // שמייצר INSERT עם `on conflict (file_number) where file_number is not null`.
  const { error } = await db
    .from('legacy_loans')
    .upsert(batch, { onConflict: 'file_number', ignoreDuplicates: false })
  if (error) {
    console.error(`\nשגיאה במנה ${i / CHUNK + 1}: ${error.message}`)
    if (String(error.message).includes('ON CONFLICT') || String(error.code) === '42P10') {
      console.error('→ השתמש ב-scripts/legacy-loans-to-sql.mjs והדבק את הפלט ב-SQL Editor.')
    }
    process.exit(1)
  }
  written += batch.length
  console.log(`נכתבו ${written}/${toWrite.length}...`)
}

console.log(`\n✓ הושלם. ${written} שורות במסד.`)
