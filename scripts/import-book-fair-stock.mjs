// ─────────────────────────────────────────────────────────────────────────────
// עדכון מלאי/מחיר קטלוג יריד הספרים מ"רשימה עם מלאי מעודכן.xlsx".
//
// ⚠️ מצטבר ולא דורס: מק"ט קיים מתעדכן, חדש נוסף, וספר שאינו בקובץ
// נשאר בקטלוג ללא שינוי. ראו scripts/import-book-fair.mjs לייבוא המקורי.
//
// ⚠️ הבדל מבני מהקובץ המקורי: אין כאן עמודת "שם המכון" — publisher
// נלקח רק מ"מחבר/ מו"ל". גיליון המקור: "נתונים למערכת הזמנות".
//
// שימוש:
//   node scripts/import-book-fair-stock.mjs "<קובץ.xlsx>"          — תצוגה מקדימה
//   node scripts/import-book-fair-stock.mjs "<קובץ.xlsx>" --write  — כתיבה למסד
//
// 🔴 ברירת המחדל היא תצוגה מקדימה. כתיבה דורשת דגל מפורש.
// ─────────────────────────────────────────────────────────────────────────────

import ExcelJS from 'exceljs'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch { /* אין קובץ — נסתמך על משתני הסביבה */ }

const file = process.argv[2]
const write = process.argv.includes('--write')
if (!file) {
  console.error('שימוש: node scripts/import-book-fair-stock.mjs "<קובץ.xlsx>" [--write]')
  process.exit(1)
}

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

const clean = s => cell(s).replace(/[‎‏‪-‮⁦-⁩]/g, '').trim()

// ── קריאה ──
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(file)
// ⚠️ הגיליון הרלוונטי הוא "נתונים למערכת הזמנות" — לא בהכרח הראשון.
const ws = wb.worksheets.find(s => s.name === 'נתונים למערכת הזמנות') ?? wb.worksheets[0]

// 🔴 מיקומי העמודות נקראים משורת הכותרות ולא מקובעים: בקובץ של
// 1.10.26 נוספה עמודת "מלאי יריד" והמק"ט זז מעמודה 7 ל-8. סקריפט
// שמקבע אינדקסים קורא בשקט את העמודה הלא נכונה.
const HEADER_MAP = {
  title:  ['שם הספר'],
  vols:   ['מספר כרכים'],
  price:  ['מחיר יריד', 'מחיר'],
  author: ['מחבר/ מו"ל', 'מחבר/ מו״ל', 'מחבר'],
  cat:    ['קטגוריה'],
  stock:  ['מלאי הזמנות', 'מלאי'],
  sku:    ['מק"ט', 'מק״ט', 'מקט'],
}

const norm = s => clean(s).replace(/["'״׳]/g, '').replace(/\s+/g, ' ').trim()
const headerRow = ws.getRow(1)
const col = {}
for (let c = 1; c <= ws.columnCount; c++) {
  const h = norm(headerRow.getCell(c).value)
  if (!h) continue
  for (const [field, names] of Object.entries(HEADER_MAP)) {
    // ⚠️ הראשון זוכה — "מלאי הזמנות" לפני "מלאי יריד".
    if (col[field] === undefined && names.some(n => norm(n) === h)) col[field] = c
  }
}

const missing = ['title', 'price', 'stock', 'sku'].filter(f => col[f] === undefined)
if (missing.length) {
  console.error(`🔴 לא נמצאו עמודות: ${missing.join(', ')}`)
  console.error(`   כותרות בקובץ: ${Array.from({ length: ws.columnCount }, (_, i) => norm(headerRow.getCell(i + 1).value)).filter(Boolean).join(' | ')}`)
  process.exit(1)
}

const at = (r, f) => col[f] === undefined ? '' : clean(r.getCell(col[f]).value)

const rows = []
for (let i = 2; i <= ws.rowCount; i++) {
  const r = ws.getRow(i)
  const v = {
    title:  at(r, 'title'),
    vols:   at(r, 'vols'),
    price:  at(r, 'price'),
    author: at(r, 'author'),
    cat:    at(r, 'cat'),
    stock:  at(r, 'stock'),
    sku:    at(r, 'sku'),
  }
  if (!v.sku && !v.title) continue
  rows.push({ ...v, row: i })
}

// ── המרה ──
const books = []
const skipped = []
const warnings = []

for (const r of rows) {
  if (!r.sku)   { skipped.push({ ...r, why: 'אין מק"ט' }); continue }
  if (!r.title) { skipped.push({ ...r, why: 'אין שם ספר' }); continue }
  // 🔴 0301 "חתם סופר על הש"ס" מפוצל ל-14 כרכים נפרדים למכירה (החלטת
  // המשתמש) — מטופל בסקריפט נפרד לאחר קבלת רשימת שמות הכרכים.
  if (r.sku === '0301') { skipped.push({ ...r, why: 'ממתין לפיצול ל-14 כרכים — לא מיובא כאן' }); continue }

  const priceNum = /^\d+(\.\d+)?$/.test(r.price) ? Number(r.price) : null
  const priceOk = priceNum !== null

  const unlimited = /לא\s*מוגבל/.test(r.stock)
  const soldOut = /אזל/.test(r.stock)
  // 🔴 "?" = מלאי טרם נספר. אין להחליט 0 בשקט — משאירים את שדה המלאי
  // הקיים ללא שינוי (updateStock=false) ורק מדווחים.
  const unknownStock = r.stock === '?' || r.stock === ''
  const stockNum = /^\d+$/.test(r.stock) ? Number(r.stock) : 0

  if (!priceOk) warnings.push({ ...r, why: `מחיר לא תקין: "${r.price}"` })
  if (unknownStock) warnings.push({ ...r, why: 'מלאי לא ידוע ("?") — לא ישונה' })

  books.push({
    sku: r.sku,
    title: r.title,
    author: r.author || null,
    publisher: r.author || null,
    description: r.cat || null,
    volumes: /^\d+$/.test(r.vols) ? Number(r.vols) : 1,
    price_agorot: priceOk ? Math.round(priceNum * 100) : null,
    unlimited_stock: unlimited,
    updateStock: !unknownStock,
    // ⚠️ מלאי אחד לשני הערוצים — ראו מיגרציית 20261001.
    stock_total: unlimited || soldOut ? 0 : stockNum,
    _row: r.row,
  })
}

// ── דוח ──
console.log(`\n📚 ${books.length} ספרים נקראו מתוך ${rows.length} שורות`)
if (skipped.length) {
  console.log(`\n⚠️ ${skipped.length} שורות דולגו:`)
  skipped.forEach(s => console.log(`   שורה ${s.row}: ${s.why} · "${s.title}"`))
}
if (warnings.length) {
  console.log(`\n🔴 ${warnings.length} אזהרות:`)
  warnings.forEach(w => console.log(`   שורה ${w.row} · ${w.sku} · ${w.title} — ${w.why}`))
}

console.log('\nדוגמה (5 ראשונים):')
books.slice(0, 5).forEach(b =>
  console.log(`   ${b.sku} · ${b.title} · ${b.volumes} כר׳ · ${b.price_agorot != null ? (b.price_agorot / 100).toFixed(2) + '₪' : 'ללא מחיר'} · ${b.unlimited_stock ? 'בלתי מוגבל' : b.updateStock ? b.stock_total + ' עותקים' : 'מלאי לא משתנה'}`)
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

const { data: existing, error: exErr } = await db
  .from('book_fair_books').select('id, sku, stock_total, unlimited_stock')
if (exErr) { console.error('שליפת הקיימים נכשלה:', exErr.message); process.exit(1) }

const bySku = new Map((existing ?? []).map(b => [b.sku.toLowerCase(), b]))
let added = 0, updated = 0, failed = 0, stockMoves = 0

for (const b of books) {
  const { _row, updateStock, ...row } = b
  if (row.price_agorot == null) delete row.price_agorot
  const prev = bySku.get(b.sku.toLowerCase())

  if (prev) {
    // 🔴 המלאי אינו נכתב ישירות ב-update אלא דרך book_fair_adjust_stock:
    // כתיבה ישירה עוקפת את היומן ושוברת את ההתאמה בין העמודה לתנועות,
    // והביקורת הלילית הייתה מתריעה על כל ספר שיובא.
    const stockTotal = row.stock_total
    delete row.stock_total

    const { error } = await db.from('book_fair_books').update(row).eq('id', prev.id)
    if (error) { console.error(`  ✗ ${b.sku}: ${error.message}`); failed++; continue }
    updated++

    // ⚠️ ספר בלתי-מוגבל אינו מנהל מלאי — אין מה ליישר.
    if (updateStock && !row.unlimited_stock) {
      const delta = stockTotal - (prev.stock_total ?? 0)
      if (delta) {
        const { error: sErr } = await db.rpc('book_fair_adjust_stock', {
          p_book_id: prev.id, p_channel: 'web', p_delta: delta,
          p_reason: 'import', p_note: 'ייבוא עדכון מלאי',
        })
        if (sErr) console.error(`  ⚠ ${b.sku}: עדכון המלאי נכשל — ${sErr.message}`)
        else stockMoves++
      }
    }
  } else {
    if (row.price_agorot == null) row.price_agorot = 0
    if (row.stock_total == null) row.stock_total = 0
    const { data, error } = await db.from('book_fair_books').insert(row).select('id').single()
    if (error) { console.error(`  ✗ ${b.sku}: ${error.message}`); failed++; continue }
    added++
    if (row.stock_total > 0 && !row.unlimited_stock) {
      await db.from('book_fair_stock_ledger').insert({
        book_id: data.id, channel: 'web', delta: row.stock_total,
        reason: 'import', note: 'ייבוא עדכון מלאי',
      })
    }
  }
}

console.log(`\n✅ ${added} נוספו · ${updated} עודכנו · ${stockMoves} תנועות מלאי${failed ? ` · ${failed} נכשלו` : ''}\n`)
