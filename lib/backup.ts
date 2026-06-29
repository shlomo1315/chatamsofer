// יצירת גיבוי מלא: כל טבלאות ה-DB (JSON) + כל הקבצים מ-Storage → קובץ ZIP אחד.
import JSZip from 'jszip'
import type { SupabaseClient } from '@supabase/supabase-js'

// הטבלאות המגובות. select('*') לכל אחת, בעמודים של 1000.
const TABLES = [
  'beneficiaries', 'loans', 'maternity_aids', 'financial_aid_requests',
  'widow_requests', 'widow_support_payments', 'lineage_nodes', 'documents',
  'recovery_homes', 'card_centers', 'app_settings', 'profiles',
]
const STORAGE_BUCKET = 'documents'

async function dumpTable(admin: SupabaseClient, table: string): Promise<{ rows: unknown[]; error?: string }> {
  const rows: unknown[] = []
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await admin.from(table).select('*').range(from, from + pageSize - 1)
    if (error) {
      if (error.code === '42P01') return { rows, error: 'table missing' } // טבלה לא קיימת — מדלגים
      return { rows, error: error.message }
    }
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return { rows }
}

// מוריד רקורסיבית את כל הקבצים מהדלי ומוסיף ל-ZIP תחת files/<path>
async function addStorageFiles(admin: SupabaseClient, zip: JSZip, manifest: Record<string, unknown>): Promise<void> {
  let fileCount = 0, errCount = 0
  const folder = zip.folder('files')!
  async function walk(prefix: string) {
    const { data, error } = await admin.storage.from(STORAGE_BUCKET).list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
    if (error || !data) return
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      // תיקייה: id חסר (Supabase מסמן תיקיות בלי metadata/id)
      if (item.id === null || (item.metadata == null && !item.name.includes('.'))) {
        await walk(path)
        continue
      }
      const { data: blob, error: dErr } = await admin.storage.from(STORAGE_BUCKET).download(path)
      if (dErr || !blob) { errCount++; continue }
      const buf = Buffer.from(await blob.arrayBuffer())
      folder.file(path, buf)
      fileCount++
    }
  }
  try { await walk('') } catch { /* best-effort */ }
  manifest.storageFiles = fileCount
  manifest.storageErrors = errCount
}

// יוצר את ה-ZIP ומחזיר Buffer + סיכום
export async function generateBackup(admin: SupabaseClient): Promise<{ buffer: Buffer; manifest: Record<string, unknown> }> {
  const zip = new JSZip()
  const manifest: Record<string, unknown> = { createdAt: new Date().toISOString(), tables: {} as Record<string, number> }
  const db = zip.folder('database')!

  for (const table of TABLES) {
    const { rows, error } = await dumpTable(admin, table)
    db.file(`${table}.json`, JSON.stringify(rows, null, 2));
    (manifest.tables as Record<string, number | string>)[table] = error ? `error: ${error}` : rows.length
  }

  await addStorageFiles(admin, zip, manifest)

  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  return { buffer, manifest }
}

// שם קובץ גיבוי לפי חותמת זמן: backup-YYYY-MM-DD-HHmm.zip
export function backupFilename(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.zip`
}
