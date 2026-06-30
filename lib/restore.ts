// שחזור גיבוי מלא מקובץ ZIP: טוען בחזרה את כל טבלאות ה-DB (upsert) + כל הקבצים ל-Storage.
// פעולה מסוכנת — דורסת/מעדכנת נתונים קיימים לפי המפתח. לשימוש שחזור אסון בלבד.
import JSZip from 'jszip'
import type { SupabaseClient } from '@supabase/supabase-js'

const STORAGE_BUCKET = 'documents'

// סדר שחזור לפי תלויות מפתח-זר: עצמאיות תחילה, ואז beneficiaries, ואז התלויות בו.
// lineage_nodes ממוין לפי generation (הורה לפני ילד) בגלל הפניה עצמית.
const RESTORE_ORDER = [
  'profiles', 'app_settings', 'recovery_homes', 'card_centers', 'lineage_nodes',
  'beneficiaries',
  'loans', 'maternity_aids', 'financial_aid_requests', 'widow_requests',
  'widow_support_payments', 'documents',
]
// עמודת ההתנגשות ל-upsert (ברירת מחדל id)
const CONFLICT_COL: Record<string, string> = { app_settings: 'key' }

type TableResult = { table: string; restored: number; error?: string }

function contentTypeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', svg: 'image/svg+xml',
    doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain', zip: 'application/zip', mp3: 'audio/mpeg', wav: 'audio/wav',
  }
  return map[ext] || 'application/octet-stream'
}

export async function restoreBackup(
  admin: SupabaseClient,
  buffer: Buffer,
  opts: { restoreFiles?: boolean } = {},
): Promise<{ ok: boolean; tables: TableResult[]; filesRestored: number; fileErrors: number; error?: string }> {
  const restoreFiles = opts.restoreFiles !== false
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch {
    return { ok: false, tables: [], filesRestored: 0, fileErrors: 0, error: 'קובץ ה-ZIP אינו תקין' }
  }

  // אימות בסיסי שזה אכן גיבוי שלנו
  if (!zip.file('manifest.json') && !zip.folder('database')) {
    return { ok: false, tables: [], filesRestored: 0, fileErrors: 0, error: 'הקובץ אינו גיבוי תקין של המערכת' }
  }

  const tables: TableResult[] = []

  // ─── שחזור טבלאות ───
  for (const table of RESTORE_ORDER) {
    const entry = zip.file(`database/${table}.json`)
    if (!entry) continue // טבלה לא בגיבוי — מדלגים
    let rows: Record<string, unknown>[]
    try {
      rows = JSON.parse(await entry.async('string'))
      if (!Array.isArray(rows)) throw new Error('not array')
    } catch {
      tables.push({ table, restored: 0, error: 'JSON לא תקין' })
      continue
    }
    if (rows.length === 0) { tables.push({ table, restored: 0 }); continue }

    // lineage_nodes — מיון לפי דור כדי שהורים יוטענו לפני ילדים (FK עצמי)
    if (table === 'lineage_nodes') {
      rows = [...rows].sort((a, b) => (Number(a.generation) || 0) - (Number(b.generation) || 0))
    }

    const conflict = CONFLICT_COL[table] || 'id'
    let restored = 0
    let tableErr: string | undefined
    const BATCH = 500
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH)
      const { error } = await admin.from(table).upsert(chunk, { onConflict: conflict })
      if (error) {
        if (error.code === '42P01') { tableErr = 'הטבלה אינה קיימת'; break }
        tableErr = error.message; break
      }
      restored += chunk.length
    }
    tables.push({ table, restored, error: tableErr })
  }

  // ─── שחזור קבצי Storage ───
  let filesRestored = 0, fileErrors = 0
  if (restoreFiles) {
    const filesFolder = zip.folder('files')
    if (filesFolder) {
      const entries: { path: string; file: JSZip.JSZipObject }[] = []
      zip.forEach((relPath, file) => {
        if (file.dir) return
        if (!relPath.startsWith('files/')) return
        entries.push({ path: relPath.slice('files/'.length), file })
      })
      for (const { path, file } of entries) {
        try {
          const buf = await file.async('nodebuffer')
          const { error } = await admin.storage.from(STORAGE_BUCKET).upload(path, buf, {
            upsert: true, contentType: contentTypeFor(path),
          })
          if (error) { fileErrors++; continue }
          filesRestored++
        } catch { fileErrors++ }
      }
    }
  }

  const hadTableError = tables.some(t => t.error)
  return { ok: !hadTableError, tables, filesRestored, fileErrors }
}
