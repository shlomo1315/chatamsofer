// גיבוי מלא כזרם — אותו תוכן בדיוק כמו generateBackup, בלי להחזיק אותו בזיכרון.
//
// 🔴 הרקע: generateBackup בנה את הגיבוי כולו בזיכרון — כל קבצי ה-Storage
// מוחזקים יחד, ומעליהם ה-ZIP המוגמר כ-Buffer אחד. בגיבוי של 3.7GB זה הגיע
// ל-15.9GB מתוך 24GB, וזה גדל עם כל מסמך שנסרק. הגיבוי רץ *בתוך התהליך
// שמגיש את האתר*, ולכן חריגה אינה מפילה רק את הגיבוי אלא את האתר כולו.
//
// ⚠️ הפתרון אינו "לכתוב לדיסק": לשירות אין volume, והדיסק המקומי ארעי ולא
// מובטח. במקום זה הגיבוי נבנה כזרם ונשלח ל-Drive תוך כדי היצירה — קובץ
// יורד, נכתב לארכיון, ומשוחרר. שיא הזיכרון אינו תלוי בגודל הגיבוי.
//
// ⚠️ הקצב נקבע ע"י הצרכן (ההעלאה): הלופ ממתין לאירוע 'entry' אחרי כל קובץ,
// כך שלא נצברות מנות בתור הפנימי של archiver. בלי זה היינו מחליפים דליפה
// אחת באחרת — הכל בתור במקום הכל ב-Buffer.
import archiver from 'archiver'
import { once } from 'events'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Readable } from 'stream'

// ⚠️ חייב להישאר זהה לרשימה שב-lib/backup.ts — שתי הדרכים מגבות את אותו דבר.
const TABLES = [
  'beneficiaries', 'loans', 'maternity_aids', 'financial_aid_requests',
  'widow_requests', 'widow_support_payments', 'lineage_nodes', 'documents',
  'recovery_homes', 'card_centers', 'app_settings', 'profiles',
]
const STORAGE_BUCKET = 'documents'
const PAGE = 1000

export type BackupManifest = Record<string, unknown>

async function dumpTable(admin: SupabaseClient, table: string): Promise<{ rows: unknown[]; error?: string }> {
  const rows: unknown[] = []
  let from = 0
  for (;;) {
    const { data, error } = await admin.from(table).select('*').range(from, from + PAGE - 1)
    if (error) {
      if (error.code === '42P01') return { rows, error: 'table missing' }
      return { rows, error: error.message }
    }
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return { rows }
}

/**
 * מתחיל לבנות את הגיבוי ומחזיר מיד את הזרם, כדי שההעלאה תתחיל לזרום בזמן
 * שהקבצים עוד נאספים. ה-manifest נפתר בסוף (הוא כולל את ספירת הקבצים, שידועה
 * רק אחרי המעבר עליהם) — ולכן הוא *אינו* נכנס לארכיון עצמו כמו קודם, אלא
 * מוחזר לקורא לצורך רישום ודיווח.
 *
 * ⚠️ manifest.json כן נכתב לארכיון, אך בלי ספירת הקבצים — היא אינה ידועה
 * בזמן הכתיבה, וזרם אינו ניתן לחזרה לאחור. הספירה חוזרת ב-Promise.
 */
export function createBackupArchive(admin: SupabaseClient): {
  stream: Readable
  done: Promise<BackupManifest>
} {
  const archive = archiver('zip', {
    // רמה 1: קבצי ה-Storage (תמונות/PDF) דחוסים ממילא, ודחיסה כבדה עליהם
    // מבזבזת CPU בלי להקטין את הקובץ.
    zlib: { level: 1 },
  })

  const done = (async (): Promise<BackupManifest> => {
    const manifest: BackupManifest = { createdAt: new Date().toISOString(), tables: {} as Record<string, number | string> }
    const tables = manifest.tables as Record<string, number | string>

    // ממתין שהקובץ שנוסף אכן ייכתב לזרם לפני שממשיכים לבא אחריו.
    // ⚠️ מריצים את ההמתנה *אחרי* append: 'entry' נפלט בסיום הכתיבה שלו.
    const appendPaced = async (data: Buffer | string, name: string) => {
      const entry = once(archive, 'entry')
      archive.append(data, { name })
      await entry
    }

    try {
      for (const table of TABLES) {
        const { rows, error } = await dumpTable(admin, table)
        tables[table] = error ? `error: ${error}` : rows.length
        await appendPaced(JSON.stringify(rows, null, 2), `database/${table}.json`)
      }

      // ⚠️ נכתב לפני הקבצים, כי אחריהם אי אפשר לחזור אחורה בזרם. ספירת
      // הקבצים אינה כאן בכוונה — היא חוזרת בערך המוחזר.
      await appendPaced(JSON.stringify({ ...manifest, note: 'ספירת הקבצים ביומן הגיבוי' }, null, 2), 'manifest.json')

      let fileCount = 0, errCount = 0
      const walk = async (prefix: string): Promise<void> => {
        const { data, error } = await admin.storage.from(STORAGE_BUCKET)
          .list(prefix, { limit: PAGE, sortBy: { column: 'name', order: 'asc' } })
        if (error || !data) return
        for (const item of data) {
          const path = prefix ? `${prefix}/${item.name}` : item.name
          // תיקייה: Supabase מסמן אותה בלי id/metadata
          if (item.id === null || (item.metadata == null && !item.name.includes('.'))) {
            await walk(path)
            continue
          }
          const { data: blob, error: dErr } = await admin.storage.from(STORAGE_BUCKET).download(path)
          if (dErr || !blob) { errCount++; continue }
          // ⚠️ ה-Buffer חי רק עד שהוא נכתב לארכיון. זה כל העניין: קובץ אחד
          // בזיכרון בכל רגע, ולא כולם יחד.
          await appendPaced(Buffer.from(await blob.arrayBuffer()), `files/${path}`)
          fileCount++
        }
      }
      await walk('')

      manifest.storageFiles = fileCount
      manifest.storageErrors = errCount
      await archive.finalize()
      return manifest
    } catch (e) {
      // מבטל את הזרם כדי שהצרכן ייפול ולא ימתין לנצח על גיבוי חלקי.
      archive.abort()
      throw e
    }
  })()

  return { stream: archive as unknown as Readable, done }
}

/** שם קובץ גיבוי לפי חותמת זמן: backup-YYYY-MM-DD-HHmm.zip */
export function backupFilename(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.zip`
}
