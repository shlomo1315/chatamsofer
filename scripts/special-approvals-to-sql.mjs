// ─────────────────────────────────────────────────────────────────────────────
// ממיר את אקסל האישורים החריגים לקובץ SQL להדבקה ב-Supabase SQL Editor.
//
// "אישור חריג" = אדם שאינו צאצא אך מאושר להגיש בקשות בכל המערכת. במסד זה
// beneficiaries עם is_special=true — הדגל שמדלג על אימות סדר הדורות.
//
// הרצה:
//   node scripts/special-approvals-to-sql.mjs "אישורים חריגים.xlsx"
//
// הפלט: scripts/special-approvals-import.sql
//
// ⚠️ אותו דפוס כמו legacy-loans-to-sql: אין .env.local בפרויקט (המפתחות
// ב-Railway בלבד), ולכן ההזנה עוברת דרך SQL Editor ולא דרך חיבור ישיר.
//
// ⚠️ קובץ הפלט מכיל ת"ז, טלפונים ומיילים — .gitignore חוסם אותו.
// ─────────────────────────────────────────────────────────────────────────────

import ExcelJS from 'exceljs'
import { writeFileSync, existsSync } from 'node:fs'

const file = process.argv[2] ?? 'אישורים חריגים.xlsx'
if (!existsSync(file)) {
  console.error(`הקובץ לא נמצא: ${file}`)
  process.exit(1)
}

const cellValue = v =>
  v && typeof v === 'object'
    ? (v.result ?? v.text ?? (v.richText ? v.richText.map(t => t.text).join('') : ''))
    : v

const text = v => {
  const s = String(cellValue(v) ?? '').trim()
  return s === '' ? null : s
}
const digitsOf = v => String(cellValue(v) ?? '').replace(/\D/g, '')

/** ת"ז ישראלית — ספרת ביקורת (לוהן). אותו אלגוריתם כמו lib/validation. */
function validId(raw) {
  const id = String(raw ?? '').replace(/\D/g, '').padStart(9, '0')
  if (id.length !== 9 || /^0+$/.test(id)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let d = parseInt(id[i]) * (i % 2 === 0 ? 1 : 2)
    if (d > 9) d -= 9
    sum += d
  }
  return sum % 10 === 0
}

// 🔴 בריחת מרכאה בודדת — שם או כתובת עם גרש ("מהרש"ל", "או'קונור") היו
// שוברים את כל קובץ ה-SQL.
const q = v => v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
const ws = wb.worksheets[0]

// עמודות לפי כותרת ולא לפי מיקום — הוספת עמודה באקסל לא תסיט את הייבוא.
const headers = {}
const hRow = ws.getRow(1)
for (let c = 1; c <= ws.columnCount; c++) {
  const h = String(cellValue(hRow.getCell(c).value) ?? '').trim()
  if (h) headers[h] = c
}
const COL = {
  first: headers['שם פרטי'], last: headers['שם משפחה'],
  street: headers['רחוב'], num: headers['מספר בניין'], city: headers['עיר'],
  phone: headers['טלפון נייד'], id: headers['תעודת זהות'],
  passport: headers['דרכון'], email: headers['אימייל'],
}
const missing = Object.entries(COL).filter(([, v]) => !v).map(([k]) => k)
if (missing.length) {
  console.error(`עמודות חסרות: ${missing.join(', ')}`)
  console.error(`כותרות שנמצאו: ${Object.keys(headers).join(' | ')}`)
  process.exit(1)
}

const values = []
const noIdent = []
let withPassport = 0

for (let r = 2; r <= ws.rowCount; r++) {
  const R = ws.getRow(r)
  const first = text(R.getCell(COL.first).value)
  const last = text(R.getCell(COL.last).value)
  const id = digitsOf(R.getCell(COL.id).value)
  const passport = text(R.getCell(COL.passport).value)
  const email = (text(R.getCell(COL.email).value) ?? '').toLowerCase() || null
  if (!first && !last && !id && !email) continue

  // ⚠️ הכתובת מורכבת מרחוב + מספר — כך היא נשמרת בכל שאר המערכת
  // ("רחוב מספר" במחרוזת אחת), ולא בשתי עמודות.
  const street = text(R.getCell(COL.street).value)
  const num = text(R.getCell(COL.num).value)
  const address = [street, num].filter(Boolean).join(' ') || null

  // 🔴 דרכון כשאין ת"ז: id_doc_type מבחין ביניהם, ובלעדיו אימות ת"ז
  // במערכת היה פוסל את המספר בשקט. שלוש רשומות כאלה בקובץ.
  const usePassport = !id && !!passport
  if (usePassport) withPassport++
  const idNumber = id || (passport ? passport.replace(/\s/g, '') : null)
  if (!idNumber) noIdent.push({ r, name: `${last ?? ''} ${first ?? ''}`.trim() })

  values.push('  (' + [
    q(first), q(last), q(idNumber), q(usePassport ? 'passport' : 'id'),
    q(address), q(text(R.getCell(COL.city).value)),
    q(digitsOf(R.getCell(COL.phone).value) || null), q(email),
  ].join(', ') + ')')
}

const sql = `-- ייבוא אישורים חריגים · ${values.length} רשומות
-- נוצר מ: ${file}
--
-- "אישור חריג" = אדם שאינו צאצא אך מאושר להגיש בקשות בכל המערכת.
-- is_special=true הוא הדגל שמדלג על אימות סדר הדורות.
--
-- ⚠️ eligibility_status='approved': הם מאושרים מעצם הגדרתם — זו כל
-- המשמעות של "אישור חריג". 'pending' היה מציב אותם בתור לאישור שכבר ניתן.
--
-- ⚠️ אידמפוטנטי: מדלג על ת"ז שכבר קיימת במסד (WHERE NOT EXISTS), כדי
-- שהרצה חוזרת לא תשכפל ולא תדרוס עריכות ידניות.
--
-- ⚠️ id_doc_type='passport' לשלוש רשומות ללא ת"ז — בלעדיו אימות ת"ז
-- במערכת פוסל את מספר הדרכון בשקט.

insert into public.beneficiaries
  (full_name, family_name, id_number, id_doc_type, address, city, phone, email,
   is_special, eligibility_status, registration_source, created_at)
select v.full_name, v.family_name, v.id_number, v.id_doc_type, v.address, v.city, v.phone, v.email,
       true, 'approved', 'admin', now()
from (values
${values.join(',\n')}
) as v(full_name, family_name, id_number, id_doc_type, address, city, phone, email)
where not exists (
  -- ⚠️ ההשוואה מנורמלת לספרות בלבד: ת"ז נשמרת לעיתים עם אפס מוביל
  -- ולעיתים בלעדיו, והשוואה גולמית הייתה יוצרת כפילות.
  select 1 from public.beneficiaries b
  where regexp_replace(coalesce(b.id_number, ''), '\\D', '', 'g')
      = regexp_replace(coalesce(v.id_number, ''), '\\D', '', 'g')
    and regexp_replace(coalesce(v.id_number, ''), '\\D', '', 'g') <> ''
);

-- אימות
select
  count(*) filter (where is_special) as special_total,
  count(*) filter (where is_special and eligibility_status = 'approved') as special_approved,
  count(*) filter (where is_special and id_doc_type = 'passport') as with_passport
from public.beneficiaries;
`

const out = 'scripts/special-approvals-import.sql'
writeFileSync(out, sql, 'utf8')

console.log('─'.repeat(58))
console.log(`נוצר: ${out}`)
console.log(`רשומות:            ${values.length}`)
console.log(`עם דרכון (ללא ת"ז): ${withPassport}`)
if (noIdent.length) {
  console.log(`\n⚠️  ${noIdent.length} ללא ת"ז וללא דרכון — ייובאו בלי מזהה:`)
  for (const n of noIdent) console.log(`     שורה ${n.r}: ${n.name}`)
}
console.log('─'.repeat(58))
