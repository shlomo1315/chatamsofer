// ─────────────────────────────────────────────────────────────────────────────
// ממיר את אקסל ההלוואות הישנות לקובץ SQL מוכן להדבקה ב-Supabase SQL Editor.
//
// חלופה ל-import-legacy-loans.mjs למי שאין לו מפתחות Supabase מקומיים
// (אין .env.local — המפתחות יושבים ב-Railway בלבד).
//
// הרצה:
//   node scripts/legacy-loans-to-sql.mjs "שטרות חתם סופר_202608171741.xlsx"
//
// הפלט: scripts/legacy-loans-import.sql
//
// ⚠️ קובץ הפלט מכיל ת"ז, טלפונים ומיילים — .gitignore חוסם אותו.
// ⚠️ אידמפוטנטי: ON CONFLICT (file_number) DO UPDATE, ומדלג על שורות
//    שסומנו manually_edited — בדיוק כמו הסקריפט הישיר.
// ─────────────────────────────────────────────────────────────────────────────

import ExcelJS from 'exceljs'
import { writeFileSync, existsSync } from 'node:fs'

const file = process.argv[2]
if (!file || !existsSync(file)) {
  console.error('שימוש: node scripts/legacy-loans-to-sql.mjs <קובץ.xlsx>')
  process.exit(1)
}

const cellValue = v =>
  v && typeof v === 'object'
    ? (v.result ?? v.text ?? (v.richText ? v.richText.map(t => t.text).join('') : ''))
    : v

const normalizeId = v => String(cellValue(v) ?? '').replace(/\D/g, '')

// ⚠️ ערך מוחלט (הסכום שבוצע שלילי באקסל) + ניקוי תווי bidi ומטבע.
const parseAmount = v => {
  const cleaned = String(cellValue(v) ?? '').replace(/[^0-9.\-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.abs(n) : null
}

const text = v => {
  const s = String(cellValue(v) ?? '').trim()
  return s === '' ? null : s
}

// 🔴 בריחת מרכאות בודדות — הגנה מפני שבירת המחרוזת ב-SQL. שמות כמו
// "או'קונור" או כתובת עם גרש היו שוברים את כל הקובץ.
const q = v => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`
const n = v => v === null || v === undefined ? 'NULL' : String(v)

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
const ws = wb.worksheets[0]

const headers = {}
const headerRow = ws.getRow(1)
for (let c = 1; c <= ws.columnCount; c++) {
  const h = String(cellValue(headerRow.getCell(c).value) ?? '').trim()
  if (h) headers[h] = c
}

const COL = {
  file: headers['מס_תיק'], fund: headers['קרן'], id: headers['ת_זהות'],
  name: headers['שם'], address: headers['כתובת'], city: headers['ישוב'],
  phone: headers['טלפון נייד'], email: headers['אימייל'],
  approved: headers['סכום שאושר'], installments: headers['סך_תשלומים'],
  taken: headers['סך הכל בוצע הלוואה'],
}

const missing = Object.entries(COL).filter(([, v]) => !v).map(([k]) => k)
if (missing.length) {
  console.error(`עמודות חסרות: ${missing.join(', ')}`)
  process.exit(1)
}

const values = []
let takenCount = 0
const unlinkable = []

for (let r = 2; r <= ws.rowCount; r++) {
  const row = ws.getRow(r)
  const name = text(row.getCell(COL.name).value)
  const id = normalizeId(row.getCell(COL.id).value)
  if (!name && !id) continue

  const approved = parseAmount(row.getCell(COL.approved).value)
  const taken = parseAmount(row.getCell(COL.taken).value)
  const inst = parseAmount(row.getCell(COL.installments).value)
  if (taken !== null) takenCount++
  if (id.length < 5 || id.length > 9) unlinkable.push({ r, name, id: id || '(ריק)' })

  values.push('  (' + [
    q(text(row.getCell(COL.file).value)),
    q(text(row.getCell(COL.fund).value)),
    q(id || null),
    q(name),
    q(text(row.getCell(COL.address).value)),
    q(text(row.getCell(COL.city).value)),
    q(text(row.getCell(COL.phone).value)),
    q(text(row.getCell(COL.email).value)),
    n(approved),
    n(taken),
    n(inst === null ? null : Math.round(inst)),
    n(r),
  ].join(', ') + ')')
}

const sql = `-- ייבוא הלוואות מהמערכת הקודמת · ${values.length} שורות
-- נוצר מ: ${file}
--
-- ⚠️ אידמפוטנטי: הרצה חוזרת מעדכנת ולא משכפלת (ON CONFLICT על file_number).
-- 🔴 שורות שסומנו manually_edited אינן נדרסות — ראה WHERE בסוף.
-- ⚠️ הסכום שבוצע נשמר חיובי (באקסל הוא שלילי — חיוב חשבונאי).
-- ⚠️ taken_amount = NULL פירושו "אושר ומעולם לא נלקח" (${values.length - takenCount} שורות).

-- ── רשת ביטחון ──
-- ⚠️ ה-ON CONFLICT למטה נשען על האינדקס הזה. אם המיגרציה רצה חלקית
-- (למשל הופסקה באמצע), ההרצה הייתה נכשלת ב-42P10. IF NOT EXISTS הופך
-- את זה לבטוח גם כשהאינדקס כבר קיים.
create unique index if not exists legacy_loans_file_number_idx
  on public.legacy_loans (file_number)
  where file_number is not null;

insert into public.legacy_loans
  (file_number, fund, id_number, borrower_name, address, city, phone, email,
   approved_amount, taken_amount, installments, source_row)
values
${values.join(',\n')}
-- 🔴 תנאי האינדקס חוזר כאן במפורש (where file_number is not null).
-- האינדקס הייחודי הוא *חלקי*, ו-PostgreSQL אינו מתאים אינדקס חלקי
-- ל-ON CONFLICT אלא אם התנאי מצוין — אחרת:
--   42P10: there is no unique or exclusion constraint matching...
on conflict (file_number) where file_number is not null do update set
  fund            = excluded.fund,
  id_number       = excluded.id_number,
  borrower_name   = excluded.borrower_name,
  address         = excluded.address,
  city            = excluded.city,
  phone           = excluded.phone,
  email           = excluded.email,
  approved_amount = excluded.approved_amount,
  taken_amount    = excluded.taken_amount,
  installments    = excluded.installments,
  source_row      = excluded.source_row,
  updated_at      = now()
-- 🔴 תיקונים ידניים שנעשו במסך אינם נדרסים בייבוא חוזר.
where public.legacy_loans.manually_edited = false;

-- אימות
-- ⚠️ בלי גרשיים בשמות העמודות: מרכאה כפולה בתוך מזהה מצוטט ב-SQL דורשת
-- הכפלה (""), וזה שביר בלי סיבה. שמות פשוטים עושים את אותה עבודה.
select
  count(*)                        as total_rows,
  count(taken_amount)             as taken_count,
  count(*) - count(taken_amount)  as approved_not_taken,
  round(sum(approved_amount))     as total_approved,
  round(sum(taken_amount))        as total_taken
from public.legacy_loans;
`

const out = 'scripts/legacy-loans-import.sql'
writeFileSync(out, sql, 'utf8')

console.log('─'.repeat(56))
console.log(`נוצר: ${out}`)
console.log(`שורות:            ${values.length}`)
console.log(`נלקחו בפועל:      ${takenCount}`)
console.log(`אושרו ולא נלקחו:  ${values.length - takenCount}`)
if (unlinkable.length) {
  console.log(`\n⚠️  ${unlinkable.length} ללא ת"ז תקינה (ייובאו, לא ישויכו):`)
  for (const u of unlinkable) console.log(`     שורה ${u.r}: ${u.name} · "${u.id}"`)
}
console.log('─'.repeat(56))
