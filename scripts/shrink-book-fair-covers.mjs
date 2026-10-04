// המרת כריכות היריד לגרסה קלה, פעם אחת.
//
// 🔴 למה לא שירות ההמרה של Supabase: מדידה הראתה שההמרה החיה
// (render/image?width=…) לוקחת 0.5–2 שניות *בכל קריאה* — היא אינה
// נשמרת במטמון כראוי. עם 111 כריכות זה גרוע יותר מהקובץ המקורי,
// שמוגש ב-0.09 שניות מה-CDN.
//
// הפתרון: להמיר פעם אחת, לשמור כקובץ נפרד (<path>.sm.webp) לצד
// המקור, ולהגיש אותו ישירות — מהירות ה-CDN במשקל של 10KB.
//
// ⚠️ המקור אינו נמחק: מסכי הניהול והורדת קבצים צריכים אותו מלא.
//
// הרצה:  node scripts/shrink-book-fair-covers.mjs
//        node scripts/shrink-book-fair-covers.mjs --force   (גם קיימים)

import fs from 'node:fs'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const WIDTH = 400          // רוחב התצוגה בכרטיס כפול, לצגים חדים
const SUFFIX = '.sm.webp'
const BUCKET = 'book-fair-images'

const force = process.argv.includes('--force')

function env(name) {
  const src = fs.readFileSync('.env.local', 'utf8')
  const m = src.match(new RegExp(`^${name}=(.*)$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : null
}

const URL_BASE = env('NEXT_PUBLIC_SUPABASE_URL')
const KEY = env('SUPABASE_SERVICE_ROLE_KEY')
if (!URL_BASE || !KEY) {
  console.error('חסר NEXT_PUBLIC_SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY ב-.env.local')
  process.exit(1)
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }

/** הורדה, הקטנה ליחס מקורי, והעלאה כ-webp. */
async function shrink(path) {
  const res = await fetch(`${URL_BASE}/storage/v1/object/public/${BUCKET}/${path}`)
  if (!res.ok) return { ok: false, why: `הורדה ${res.status}` }
  const img = await loadImage(Buffer.from(await res.arrayBuffer()))

  const w = Math.min(WIDTH, img.width)
  const h = Math.round(img.height * (w / img.width))
  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  const out = await canvas.encode('webp', 82)

  const dest = `${path}${SUFFIX}`
  const up = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${dest}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'image/webp', 'x-upsert': 'true' },
    body: out,
  })
  if (!up.ok) return { ok: false, why: `העלאה ${up.status} ${await up.text()}` }
  return { ok: true, bytes: out.length, was: img.width }
}

const books = await (await fetch(
  `${URL_BASE}/rest/v1/book_fair_books?select=sku,image_path&image_path=not.is.null&limit=1000`,
  { headers: H },
)).json()

if (!Array.isArray(books)) {
  console.error('שליפת הספרים נכשלה:', JSON.stringify(books))
  process.exit(1)
}

// מה כבר קיים — כדי לא להמיר מחדש בכל הרצה
const existing = new Set()
if (!force) {
  const list = await (await fetch(`${URL_BASE}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit: 2000, prefix: '' }),
  })).json()
  if (Array.isArray(list)) for (const f of list) existing.add(f.name)
}

console.log(`${books.length} כריכות · רוחב ${WIDTH} · webp`)
let done = 0, skipped = 0, failed = 0, total = 0

for (const b of books) {
  if (!force && existing.has(`${b.image_path}${SUFFIX}`)) { skipped++; continue }
  const r = await shrink(b.image_path)
  if (r.ok) {
    done++; total += r.bytes
    process.stdout.write(`\r  הומרו ${done} · ${Math.round(total / 1024)}KB סה"כ   `)
  } else {
    failed++
    console.log(`\n  ✗ ${b.sku}: ${r.why}`)
  }
}

console.log(`\n✓ ${done} הומרו · ${skipped} דולגו · ${failed} נכשלו`)
if (done) console.log(`  ממוצע ${Math.round(total / done / 1024)}KB לכריכה`)
