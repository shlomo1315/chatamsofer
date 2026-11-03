// רץ בתוך משימת ECS (node:22). קריאה בלבד מ-Supabase Storage של המקור, והעלאה דרך ה-Storage API של היעד ב-AWS
// (storage-api שומר ב-S3 במבנה משלו, ולכן אי אפשר לכתוב ישר ל-S3). מדפיס דוח מקור מול יעד.
const SRC = { base: process.env.SUPABASE_URL.replace(/\/$/, ''), key: process.env.SUPABASE_SERVICE_ROLE_KEY }
const DST = { base: process.env.DST_URL.replace(/\/$/, ''), key: process.env.DST_KEY }
const call = (e, u, o = {}) => fetch(e.base + u, { ...o, headers: { apikey: e.key, Authorization: `Bearer ${e.key}`, ...o.headers } })
// ניסיון חוזר (עד 6 פעמים, המתנה גדלה עד דקה, בסך הכול כ-3 דקות) על 403/429/5xx ושגיאות רשת: חסימה רגעית של ה-WAF או עומס לא צריכים להפיל העתקה של אלפי קבצים
const sleep = ms => new Promise(r => setTimeout(r, ms))
const retryable = s => s === 403 || s === 429 || s >= 500
const ok = async (e, u, o) => {
  for (let i = 1; ; i++) {
    let r, err
    try { r = await call(e, u, o); if (r.ok) return r; err = new Error(`${r.status} ${u} ${(await r.text()).slice(0, 200)}`) } catch (x) { err = x }
    if (i >= 6 || (r && !retryable(r.status))) throw err
    console.log(`RETRY ${i} ${u} ${err.message.slice(0, 80)}`)
    await sleep(Math.min(60000, 5000 * 2 ** i))
  }
}
const json = { 'content-type': 'application/json' }
const enc = p => p.split('/').map(encodeURIComponent).join('/')

async function listAll(e, bucket, label, prefix = '', cnt = { n: 0, next: 1000 }) {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const rows = await (await ok(e, `/storage/v1/object/list/${bucket}`, { method: 'POST', headers: json, body: JSON.stringify({ prefix, limit: 1000, offset }) })).json()
    for (const r of rows) {
      if (r.id === null) out.push(...await listAll(e, bucket, label, `${prefix}${r.name}/`, cnt))
      else {
        out.push({ path: `${prefix}${r.name}`, type: r.metadata?.mimetype })
        if (++cnt.n >= cnt.next) { console.log(`SCAN ${bucket} ${label}: ${cnt.n} קבצים נמצאו`); cnt.next += 1000 }
      }
    }
    if (rows.length < 1000) return out
  }
}

const buckets = await (await ok(SRC, '/storage/v1/bucket')).json()
const have = new Set((await (await ok(DST, '/storage/v1/bucket')).json()).map(b => b.name))
console.log('REPORT bucket|source_files|dest_files|match')
let bad = 0
const failed = []
for (const b of buckets) {
  if (!have.has(b.name)) {
    await ok(DST, '/storage/v1/bucket', { method: 'POST', headers: json, body: JSON.stringify({ id: b.id, name: b.name, public: b.public, file_size_limit: b.file_size_limit, allowed_mime_types: b.allowed_mime_types }) })
  }
  console.log(`SCAN ${b.name} מתחיל`)
  const [files, dst] = await Promise.all([listAll(SRC, b.name, "מקור"), listAll(DST, b.name, "יעד")])
  console.log(`SCAN ${b.name} הסתיים: מקור ${files.length}, יעד ${dst.length}`)
  // הרצה חוזרת מדלגת על קבצים שכבר הועתקו
  const done = new Set(dst.map(f => f.path))
  const todo = files.filter(f => !done.has(f.path))
  console.log(`PROGRESS ${b.name} 0/${todo.length} (0%) | דולגו ${files.length - todo.length} שכבר הועתקו`)
  for (let i = 0; i < todo.length; i += 6) {
    await Promise.all(todo.slice(i, i + 6).map(async f => {
      // קובץ שנכשל אחרי כל הניסיונות לא עוצר את השאר: נרשם ב-FAILED בסוף הדוח וההעתקה מסתיימת בשגיאה
      try {
        const body = Buffer.from(await (await ok(SRC, `/storage/v1/object/${b.name}/${enc(f.path)}`)).arrayBuffer())
        await ok(DST, `/storage/v1/object/${b.name}/${enc(f.path)}`, { method: 'POST', headers: { 'content-type': f.type || 'application/octet-stream', 'x-upsert': 'true' }, body })
      } catch (x) { failed.push(`${b.name}/${f.path}`); console.log(`SKIP ${b.name}/${f.path} ${String(x.message).slice(0, 80)}`) }
    }))
    const d = Math.min(i + 6, todo.length)
    console.log(`PROGRESS ${b.name} ${d}/${todo.length} (${Math.round(d * 100 / todo.length)}%)`)
  }
  const n = (await listAll(DST, b.name, "יעד")).length
  const m = files.length === n ? 'ok' : 'DIFF'
  if (m !== 'ok') bad++
  console.log(`REPORT ${b.name}|${files.length}|${n}|${m}`)
}
for (const p of failed) console.log(`FAILED ${p}`)
if (failed.length) console.log(`FAILED_COUNT ${failed.length} (הרצה חוזרת תעתיק רק אותם)`)
if (bad || failed.length) process.exit(1)
