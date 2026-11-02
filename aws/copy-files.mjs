// רץ בתוך משימת ECS (node:22). קריאה בלבד מ-Supabase Storage, כתיבה ל-S3 תחת <bucket>/<path>. מדפיס דוח מקור מול יעד.
import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
const base = process.env.SUPABASE_URL.replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const target = process.env.FILES_BUCKET
const s3 = new S3Client({ region: 'eu-central-1' })
const H = { apikey: key, Authorization: `Bearer ${key}` }
const j = async (u, o) => { const r = await fetch(base + u, { headers: H, ...o }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r }

async function listAll(bucket, prefix = '') {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const rows = await (await j(`/storage/v1/object/list/${bucket}`, { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ prefix, limit: 1000, offset }) })).json()
    for (const r of rows) {
      if (r.id === null) out.push(...await listAll(bucket, `${prefix}${r.name}/`))
      else out.push({ path: `${prefix}${r.name}`, type: r.metadata?.mimetype })
    }
    if (rows.length < 1000) return out
  }
}
const buckets = await (await j('/storage/v1/bucket')).json()
console.log('REPORT bucket|source_files|dest_files|match')
for (const b of buckets) {
  const files = await listAll(b.name)
  for (let i = 0; i < files.length; i += 8) {
    await Promise.all(files.slice(i, i + 8).map(async f => {
      const r = await j(`/storage/v1/object/${b.name}/${f.path.split('/').map(encodeURIComponent).join('/')}`)
      await s3.send(new PutObjectCommand({ Bucket: target, Key: `${b.name}/${f.path}`, Body: Buffer.from(await r.arrayBuffer()), ContentType: f.type }))
    }))
  }
  let n = 0, token
  do { const r = await s3.send(new ListObjectsV2Command({ Bucket: target, Prefix: `${b.name}/`, ContinuationToken: token })); n += r.KeyCount; token = r.NextContinuationToken } while (token)
  console.log(`REPORT ${b.name}|${files.length}|${n}|${files.length === n ? 'ok' : 'DIFF'}`)
}
