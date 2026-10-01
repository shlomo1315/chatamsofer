// ─────────────────────────────────────────────────────────────────────────────
// חילוץ "משבצות" הספרים מקטלוג ה-PDF — כולל המסגרת, העיטורים והטקסט.
//
// 🔴 למה לא התמונות המוטמעות: החילוץ הקודם שלף את *קובצי הכריכה* בלבד,
// ולכן נאבדו המסגרת, עיגול "ספר חדש" והעיצוב סביבו. המשתמש ביקש "ללכוד
// מתוך הקטלוג את כל המשבצת". לכן כאן מרונדר *אזור מהעמוד* ולא אובייקט.
//
// 🔴 הגבולות נגזרים מהמק"טים עצמם ולא ממספרים קבועים:
//   · העמודות: המק"טים מתקבצים סביב 3 ערכי x לעמוד (ראו clusterBy).
//   · השורות:  אותו דבר על y.
// מספרים קבועים נשברו בין עמוד לעמוד — ב-4 העמודות נמצאות ב-159/312/466
// וב-5 ב-242/396/550, כי הפריסה מתהפכת בין עמוד ימני לשמאלי.
//
// ⚠️ המק"ט ב-PDF מרווח בתווים ("0 3 0 6"), ולכן ההשוואה היא על המחרוזת
// אחרי הסרת רווחים. סינון של /\b0\d{3}\b/ החזיר 0 התאמות וזו הסיבה.
//
// שימוש:
//   node scripts/extract-catalog-cards.mjs            — חילוץ לתיקייה מקומית
//   node scripts/extract-catalog-cards.mjs --upload    — + העלאה ל-Storage
//
// 🔴 ברירת המחדל אינה מעלה ואינה נוגעת במסד.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createCanvas } from '@napi-rs/canvas'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const PDF = process.argv[2]?.endsWith('.pdf') ? process.argv[2] : 'קטלוג היכל החתם סופר.pdf'
const UPLOAD = process.argv.includes('--upload')
const OUT = '.catalog-cards'

/** עמודי המוצרים. ⚠️ 15 הוא מחירון (102 מק"טים בטבלה) ולא משבצות. */
const PRODUCT_PAGES = [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

/** רזולוציית הרנדור. 2.5 ≈ 180DPI — חד להצגה באתר בלי קבצים כבדים. */
const SCALE = 2.5

/**
 * מקבץ ערכים לקבוצות לפי קרבה.
 *
 * ⚠️ 60pt: רוחב עמודה בקטלוג הוא ~150pt והפרש בין עמודות ~154pt, אז
 * 60 מפריד עמודות בוודאות אך סופג סטייה של כמה נקודות באותה עמודה
 * (המק"ט אינו מיושר פיקסל-מושלם בין כרטיסים).
 */
function clusterBy(values, tolerance) {
  const sorted = [...values].sort((a, b) => a - b)
  const groups = []
  for (const v of sorted) {
    const last = groups[groups.length - 1]
    if (last && v - last[last.length - 1] <= tolerance) last.push(v)
    else groups.push([v])
  }
  // מרכז כל קבוצה
  return groups.map(g => g.reduce((s, x) => s + x, 0) / g.length)
}

/** הערך הקרוב ביותr ברשימה, ואינדקסו. */
function nearest(list, v) {
  let bi = 0, bd = Infinity
  list.forEach((x, i) => { const d = Math.abs(x - v); if (d < bd) { bd = d; bi = i } })
  return bi
}

async function main() {
  const data = new Uint8Array(readFileSync(PDF))
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
  mkdirSync(OUT, { recursive: true })

  const results = []

  for (const pn of PRODUCT_PAGES) {
    const page = await doc.getPage(pn)
    const vp = page.getViewport({ scale: 1 })
    const tc = await page.getTextContent()

    // ── מק"טים בעמוד ──
    const skus = []
    for (const it of tc.items) {
      const compact = (it.str || '').replace(/\s+/g, '')
      if (/^0[1-9]\d{2}$/.test(compact)) {
        skus.push({ sku: compact, x: it.transform[4], y: it.transform[5] })
      }
    }
    if (!skus.length) { console.log(`עמוד ${pn}: אין מק"טים — מדולג`); continue }

    // ── הגריד של העמוד הזה ──
    const colCenters = clusterBy(skus.map(s => s.x), 60)
    const rowCenters = clusterBy(skus.map(s => s.y), 60)

    // רוחב/גובה תא: המרווח בין מרכזים. בעמודה/שורה בודדת — נפילה לברירה.
    const colGap = colCenters.length > 1
      ? Math.min(...colCenters.slice(1).map((c, i) => c - colCenters[i]))
      : 154
    const rowGap = rowCenters.length > 1
      ? Math.min(...rowCenters.slice(1).map((c, i) => c - rowCenters[i]))
      : 195

    console.log(`עמוד ${pn}: ${skus.length} מק"טים · ${colCenters.length} עמודות · ${rowCenters.length} שורות · תא ${colGap.toFixed(0)}×${rowGap.toFixed(0)}`)

    // ── רנדור העמוד פעם אחת, וחיתוך ממנו ──
    // ⚠️ רנדור לכל כרטיס בנפרד היה מרנדר את העמוד 10 פעמים (איטי מאוד
    // ו-16 עמודים × 10). רנדור אחד + crop מהקנבס זהה בתוצאה.
    const rvp = page.getViewport({ scale: SCALE })
    const pageCanvas = createCanvas(Math.ceil(rvp.width), Math.ceil(rvp.height))
    const pctx = pageCanvas.getContext('2d')
    pctx.fillStyle = '#ffffff'
    pctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    await page.render({ canvasContext: pctx, viewport: rvp }).promise

    for (const s of skus) {
      const ci = nearest(colCenters, s.x)
      const ri = nearest(rowCenters, s.y)
      const cx = colCenters[ci]
      const cy = rowCenters[ri]

      // ── גבולות התא ב-pt ──
      //
      // 🔴 המק"ט יושב בתחתית הכרטיס, ולכן התא נמשך *מעלה* ממנו:
      // כמעט כל הגובה מעל שורת המק"ט, ושוליים קטנים מתחתיה.
      //
      // ⚠️ המרכז נלקח מהאשכול ולא מהמק"ט הבודד — מק"ט שמיושר מעט
      // אחרת מהשאר היה מזיז את כל החיתוך שלו.
      const padX = colGap * 0.5
      const left = cx - padX
      const right = cx + padX
      const bottom = cy - rowGap * 0.07          // מעט מתחת למק"ט
      const top = cy + rowGap * 0.93             // כל השאר מעליו

      // המרה לפיקסלים. ⚠️ ציר ה-y של PDF הפוך לציר הקנבס.
      const px = Math.max(0, Math.round(left * SCALE))
      const py = Math.max(0, Math.round((vp.height - top) * SCALE))
      const pw = Math.min(pageCanvas.width - px, Math.round((right - left) * SCALE))
      const ph = Math.min(pageCanvas.height - py, Math.round((top - bottom) * SCALE))

      if (pw < 20 || ph < 20) {
        console.log(`   ⚠️ ${s.sku}: אזור קטן מדי (${pw}×${ph}) — מדולג`)
        continue
      }

      const card = createCanvas(pw, ph)
      const cctx = card.getContext('2d')
      cctx.fillStyle = '#ffffff'
      cctx.fillRect(0, 0, pw, ph)
      cctx.drawImage(pageCanvas, px, py, pw, ph, 0, 0, pw, ph)

      const file = `${OUT}/${s.sku}.png`
      writeFileSync(file, card.toBuffer('image/png'))
      results.push({ sku: s.sku, page: pn, file, w: pw, h: ph })
    }
  }

  console.log(`\n✅ ${results.length} משבצות נחלצו לתיקיית ${OUT}/`)

  if (!UPLOAD) {
    console.log('💡 חילוץ מקומי בלבד. בדקו את התמונות בעין, ואז הריצו שוב עם --upload\n')
    return
  }

  // ── העלאה ──
  // 🔴 רק אחרי בדיקה חזותית. ראו ההערה בראש הקובץ.
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } })

  let up = 0, failed = 0
  for (const r of results) {
    const { data: book } = await db.from('book_fair_books')
      .select('id').ilike('sku', r.sku).maybeSingle()
    if (!book) { console.log(`   ⚠️ ${r.sku} אינו בקטלוג — מדולג`); continue }

    // ⚠️ חותמת זמן בשם: שם קבוע היה מוצג מהמטמון של הדפדפן גם אחרי
    // ההחלפה, והתמונה הישנה הייתה נשארת על המסך.
    const path = `cards/${r.sku}-${Date.now().toString(36)}.png`
    const { error } = await db.storage.from('book-fair')
      .upload(path, readFileSync(r.file), { contentType: 'image/png', upsert: true })
    if (error) { console.error(`   ✗ ${r.sku}: ${error.message}`); failed++; continue }

    await db.from('book_fair_books').update({ image_path: path }).eq('id', book.id)
    up++
  }
  console.log(`\n✅ ${up} הועלו${failed ? ` · ${failed} נכשלו` : ''}\n`)
}

main().catch(e => { console.error('נכשל:', e); process.exit(1) })
