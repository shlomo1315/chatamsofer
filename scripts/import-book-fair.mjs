// ─────────────────────────────────────────────────────────────────────────────
// ייבוא קטלוג יריד הספרים מאקסל.
//
// ⚠️ מצטבר ולא דורס: מק"ט קיים מתעדכן, חדש נוסף, וספר שאינו בקובץ
// נשאר בקטלוג. הקובץ הוא "חלק ראשון" ויגיעו אחריו עוד.
//
// שימוש:
//   node scripts/import-book-fair.mjs "<קובץ.xlsx>"          — תצוגה מקדימה
//   node scripts/import-book-fair.mjs "<קובץ.xlsx>" --write  — כתיבה למסד
//
// 🔴 ברירת המחדל היא תצוגה מקדימה. כתיבה דורשת דגל מפורש.
// ─────────────────────────────────────────────────────────────────────────────

import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

// טעינת .env.local (הסקריפט רץ מחוץ ל-Next)
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch { /* אין קובץ — נסתמך על משתני הסביבה */ }

const file = process.argv[2]
const write = process.argv.includes('--write')
if (!file) {
  console.error('שימוש: node scripts/import-book-fair.mjs "<קובץ.xlsx>" [--write]')
  process.exit(1)
}

/** ערך תא כטקסט — exceljs מחזיר אובייקטים לנוסחאות ולטקסט מעוצב. */
function cell(v) {
  if (v == null) return ''
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('')
    if (v.text !== undefined) return String(v.text)
    if (v.result !== undefined) return String(v.result)
    return ''
  }
  return String(v).trim()
}

/**
 * ⚠️ תווי כיווניות בלתי נראים מגיעים מהדבקה ושוברים השוואות מק"ט
 * ובדיקות תקינות. זו תקלה חוזרת במערכת — ראו invisible-chars-emails.
 */
const clean = s => cell(s).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim()

// ── קריאה ──
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
const ws = wb.worksheets[0]

const rows = []
// ⚠️ סריקה לפי אינדקס ולא eachRow: הגיליון מעוצב עד שורה 912 בעוד
// שהנתונים מסתיימים ב-62, ו-eachRow עוצר בשורה הריקה הראשונה.
for (let i = 2; i <= ws.rowCount; i++) {
  const r = ws.getRow(i)
  const v = {
    inst:   clean(r.getCell(1).value),
    title:  clean(r.getCell(2).value),
    vols:   clean(r.getCell(3).value),
    price:  clean(r.getCell(4).value),
    author: clean(r.getCell(5).value),
    cat:    clean(r.getCell(6).value),
    stock:  clean(r.getCell(7).value),
    sku:    clean(r.getCell(8).value),
  }
  if (!v.sku && !v.title) continue
  rows.push({ ...v, row: i })
}

// ── המרה ──
const books = []
const skipped = []

for (const r of rows) {
  if (!r.sku)   { skipped.push({ ...r, why: 'אין מק"ט' }); continue }
  if (!r.title) { skipped.push({ ...r, why: 'אין שם ספר' }); continue }

  // מחיר: "126" → 12600 אגורות. "45 לכרך" ו-"" אינם ניתנים לפירוש.
  const priceNum = /^\d+(\.\d+)?$/.test(r.price) ? Number(r.price) : null
  const priceOk = priceNum !== null

  // ⚠️ "לא מוגבל" = הזמנה מהמו"ל, לא מספר גדול. ראו מיגרציה 20260923.
  const unlimited = /לא\s*מוגבל/.test(r.stock)
  const soldOut = /אזל/.test(r.stock)
  const stockNum = /^\d+$/.test(r.stock) ? Number(r.stock) : 0

  books.push({
    sku: r.sku,
    title: r.title,
    author: r.author || null,
    publisher: r.inst || null,
    // הקטגוריה נשמרת כתיאור — אין לה עמודה משלה בסכמה.
    description: r.cat || null,
    volumes: /^\d+$/.test(r.vols) ? Number(r.vols) : 1,
    price_agorot: priceOk ? Math.round(priceNum * 100) : 0,
    unlimited_stock: unlimited,
    // 🔴 כל המלאי נכנס לערוץ האתר. ההפרדה לטלפון היא החלטה תפעולית
    // שנעשית במסך המלאי, ולא ניחוש של הסקריפט.
    stock_web: unlimited || soldOut ? 0 : stockNum,
    stock_phone: 0,
    // 🔴 ספר בלי מחיר תקין נכנס כלא-פעיל: הוא לא יוצג בחנות עד
    // שייקבע מחיר, אבל גם לא ייעלם ויישכח.
    is_active: priceOk,
    _note: !priceOk ? `מחיר לא תקין: "${r.price}"` : null,
    _row: r.row,
  })
}

// ── דוח ──
const noPrice = books.filter(b => !b.is_active)
const unlim = books.filter(b => b.unlimited_stock)
const counted = books.filter(b => !b.unlimited_stock)

console.log(`\n📚 ${books.length} ספרים נקראו מתוך ${rows.length} שורות`)
console.log(`   · ${unlim.length} מלאי בלתי מוגבל`)
console.log(`   · ${counted.length} עם מלאי מספרי (סה"כ ${counted.reduce((s, b) => s + b.stock_web, 0)} עותקים)`)
console.log(`   · ${books.filter(b => b.volumes > 1).length} רב-כרכיים`)
if (skipped.length) console.log(`   ⚠️ ${skipped.length} שורות דולגו`)

if (noPrice.length) {
  console.log(`\n🔴 ${noPrice.length} ספרים ללא מחיר תקין — ייובאו כ*לא פעילים*:`)
  noPrice.forEach(b => console.log(`   שורה ${b._row} · ${b.sku} · ${b.title} — ${b._note}`))
}
if (skipped.length) {
  console.log('\n⚠️ שורות שדולגו:')
  skipped.forEach(s => console.log(`   שורה ${s.row}: ${s.why}`))
}

console.log('\nדוגמה (5 ראשונים):')
books.slice(0, 5).forEach(b =>
  console.log(`   ${b.sku} · ${b.title} · ${b.volumes} כר׳ · ${(b.price_agorot / 100).toFixed(2)}₪ · ${b.unlimited_stock ? 'בלתי מוגבל' : b.stock_web + ' עותקים'}`)
)

if (!write) {
  console.log('\n💡 תצוגה מקדימה בלבד. להרצה אמיתית הוסיפו --write\n')
  process.exit(0)
}

// ── כתיבה ──
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('\n🔴 חסרים NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// ⚠️ שליפת הקיימים לפי מק"ט: upsert על unique index עובד, אבל אנחנו
// רוצים לדעת *מה* התעדכן ומה נוסף — ולא לדרוס מלאי של ספר קיים.
const { data: existing, error: exErr } = await db
  .from('book_fair_books').select('id, sku, stock_web, stock_phone')
if (exErr) { console.error('שליפת הקיימים נכשלה:', exErr.message); process.exit(1) }

const bySku = new Map((existing ?? []).map(b => [b.sku.toLowerCase(), b]))
let added = 0, updated = 0, failed = 0

for (const b of books) {
  const { _note, _row, ...row } = b
  const prev = bySku.get(b.sku.toLowerCase())

  if (prev) {
    // 🔴 המלאי אינו נדרס בעדכון: הוא משתנה ממכירות ומהעברות, והקובץ
    // אינו יודע מה קרה מאז. רק פרטי הספר מתעדכנים.
    const { stock_web, stock_phone, ...meta } = row
    const { error } = await db.from('book_fair_books').update(meta).eq('id', prev.id)
    if (error) { console.error(`  ✗ ${b.sku}: ${error.message}`); failed++ }
    else updated++
  } else {
    const { data, error } = await db.from('book_fair_books').insert(row).select('id').single()
    if (error) { console.error(`  ✗ ${b.sku}: ${error.message}`); failed++; continue }
    added++
    // ⚠️ מלאי פתיחה נרשם ביומן, אחרת ביקורת המלאי תתריע על כל ספר חדש.
    if (row.stock_web > 0) {
      await db.from('book_fair_stock_ledger').insert({
        book_id: data.id, channel: 'web', delta: row.stock_web,
        reason: 'import', note: 'ייבוא קטלוג ראשוני',
      })
    }
  }
}

console.log(`\n✅ ${added} נוספו · ${updated} עודכנו${failed ? ` · ${failed} נכשלו` : ''}\n`)
