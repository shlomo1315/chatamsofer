// רץ בתוך משימת ECS (node:22). קריאה בלבד מ-Supabase Storage של המקור, והעלאה דרך ה-Storage API של היעד ב-AWS
// (storage-api שומר ב-S3 במבנה משלו, ולכן אי אפשר לכתוב ישר ל-S3). מדפיס דוח מקור מול יעד.
const SRC = { base: process.env.SUPABASE_URL.replace(/\/$/, ''), key: process.env.SUPABASE_SERVICE_ROLE_KEY }
const DST = { base: process.env.DST_URL.replace(/\/$/, ''), key: process.env.DST_KEY }
const call = (e, u, o = {}) => fetch(e.base + u, { ...o, headers: { apikey: e.key, Authorization: `Bearer ${e.key}`, ...o.headers } })
const ok = async (e, u, o) => { const r = await call(e, u, o); if (!r.ok) throw new Error(`${r.status} ${u} ${(await r.text()).slice(0, 200)}`); return r }
const json = { 'content-type': 'application/json' }
const enc = p => p.split('/').map(encodeURIComponent).join('/')

async function listAll(e, bucket, prefix = '') {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const rows = await (await ok(e, `/storage/v1/object/list/${bucket}`, { method: 'POST', headers: json, body: JSON.stringify({ prefix, limit: 1000, offset }) })).json()
    for (const r of rows) {
      if (r.id === null) out.push(...await listAll(e, bucket, `${prefix}${r.name}/`))
      else out.push({ path: `${prefix}${r.name}`, type: r.metadata?.mimetype })
    }
    if (rows.length < 1000) return out
  }
}

const buckets = await (await ok(SRC, '/storage/v1/bucket')).json()
const have = new Set((await (await ok(DST, '/storage/v1/bucket')).json()).map(b => b.name))
console.log('REPORT bucket|source_files|dest_files|match')
let bad = 0
for (const b of buckets) {
  if (!have.has(b.name)) {
    await ok(DST, '/storage/v1/bucket', { method: 'POST', headers: json, body: JSON.stringify({ id: b.id, name: b.name, public: b.public, file_size_limit: b.file_size_limit, allowed_mime_types: b.allowed_mime_types }) })
  }
  const files = await listAll(SRC, b.name)
  for (let i = 0; i < files.length; i += 6) {
    await Promise.all(files.slice(i, i + 6).map(async f => {
      const body = Buffer.from(await (await ok(SRC, `/storage/v1/object/${b.name}/${enc(f.path)}`)).arrayBuffer())
      await ok(DST, `/storage/v1/object/${b.name}/${enc(f.path)}`, { method: 'POST', headers: { 'content-type': f.type || 'application/octet-stream', 'x-upsert': 'true' }, body })
    }))
  }
  const n = (await listAll(DST, b.name)).length
  const m = files.length === n ? 'ok' : 'DIFF'
  if (m !== 'ok') bad++
  console.log(`REPORT ${b.name}|${files.length}|${n}|${m}`)
}
if (bad) process.exit(1)
