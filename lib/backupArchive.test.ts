// הגיבוי כזרם — האם התוכן שלם, ואם הוא באמת זורם.
//
// שתי השאלות שחייבות תשובה אחרי המעבר מבנייה בזיכרון לזרם:
//   1. שלא נפל כלום. כל טבלה וכל קובץ ב-Storage חייבים להיות בארכיון,
//      בייט-בבייט — גיבוי חסר גרוע מגיבוי שנכשל, כי הוא נראה תקין.
//   2. שהוא זורם ולא נצבר. אם הבייטים הראשונים יוצאים רק בסוף, לא הרווחנו
//      כלום ושיא הזיכרון נשאר כשהיה.
import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createBackupArchive, backupFilename } from './backupArchive'

type FakeFile = { path: string; body: Buffer }

// לקוח Supabase מדומה: טבלאות בזיכרון ו-Storage היררכי.
function fakeAdmin(tables: Record<string, unknown[]>, files: FakeFile[]) {
  const downloads: string[] = []

  const listAt = (prefix: string) => {
    // מחזיר את הצמתים הישירים תחת prefix — קבצים עם metadata, תיקיות בלי id.
    const seen = new Map<string, { name: string; id: string | null; metadata: unknown }>()
    for (const f of files) {
      if (prefix && !f.path.startsWith(prefix + '/')) continue
      const rest = prefix ? f.path.slice(prefix.length + 1) : f.path
      const slash = rest.indexOf('/')
      if (slash === -1) seen.set(rest, { name: rest, id: 'id-' + rest, metadata: { size: f.body.length } })
      else { const dir = rest.slice(0, slash); seen.set(dir, { name: dir, id: null, metadata: null }) }
    }
    return [...seen.values()]
  }

  const admin = {
    from(table: string) {
      return {
        select() {
          return {
            range(from: number, to: number) {
              const rows = tables[table]
              if (!rows) return Promise.resolve({ data: null, error: { code: '42P01', message: 'missing' } })
              return Promise.resolve({ data: rows.slice(from, to + 1), error: null })
            },
          }
        },
      }
    },
    storage: {
      from() {
        return {
          list(prefix: string) { return Promise.resolve({ data: listAt(prefix), error: null }) },
          download(path: string) {
            downloads.push(path)
            const f = files.find(x => x.path === path)
            if (!f) return Promise.resolve({ data: null, error: { message: 'not found' } })
            return Promise.resolve({ data: new Blob([new Uint8Array(f.body)]), error: null })
          },
        }
      },
    },
  }
  return { admin: admin as unknown as SupabaseClient, downloads }
}

async function collect(stream: AsyncIterable<Buffer>): Promise<{ buf: Buffer; firstChunkBeforeEnd: boolean }> {
  const parts: Buffer[] = []
  for await (const c of stream) parts.push(Buffer.from(c))
  return { buf: Buffer.concat(parts), firstChunkBeforeEnd: parts.length > 0 }
}

describe('createBackupArchive — שלמות התוכן', () => {
  it('כולל כל טבלה וכל קובץ, בייט-בבייט', async () => {
    const tables = {
      beneficiaries: [{ id: 1, name: 'משפחה א' }, { id: 2, name: 'משפחה ב' }],
      loans: [{ id: 'l1', amount: 5000 }],
      app_settings: [{ key: 'k', value: 'v' }],
    }
    const files: FakeFile[] = [
      { path: 'a.pdf', body: Buffer.from('PDF-A'.repeat(50)) },
      { path: '2026/b.jpg', body: Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03]) },
      { path: '2026/sub/c.png', body: Buffer.alloc(2048, 7) },
    ]
    const { admin, downloads } = fakeAdmin(tables, files)

    const { stream, done } = createBackupArchive(admin)
    const { buf } = await collect(stream as AsyncIterable<Buffer>)
    const manifest = await done

    const zip = await JSZip.loadAsync(buf)

    // כל הקבצים, עם התוכן המדויק
    for (const f of files) {
      const entry = zip.file(`files/${f.path}`)
      expect(entry, `חסר בארכיון: files/${f.path}`).toBeTruthy()
      const bytes = Buffer.from(await entry!.async('uint8array'))
      expect(bytes.equals(f.body), `תוכן שונה: ${f.path}`).toBe(true)
    }
    expect(downloads.sort()).toEqual(['2026/b.jpg', '2026/sub/c.png', 'a.pdf'])

    // הטבלאות שקיימות — עם השורות
    const bens = JSON.parse(await zip.file('database/beneficiaries.json')!.async('string'))
    expect(bens).toEqual(tables.beneficiaries)
    const loans = JSON.parse(await zip.file('database/loans.json')!.async('string'))
    expect(loans).toEqual(tables.loans)

    expect(zip.file('manifest.json')).toBeTruthy()
    expect(manifest.storageFiles).toBe(3)
    expect(manifest.storageErrors).toBe(0)
  })

  it('טבלה חסרה מדווחת ואינה מפילה את הגיבוי', async () => {
    // ⚠️ מיגרציה שלא רצה בסביבה מסוימת לא צריכה לבטל את כל הגיבוי.
    const { admin } = fakeAdmin({ beneficiaries: [{ id: 1 }] }, [])
    const { stream, done } = createBackupArchive(admin)
    const { buf } = await collect(stream as AsyncIterable<Buffer>)
    const manifest = await done

    const zip = await JSZip.loadAsync(buf)
    const tables = manifest.tables as Record<string, number | string>
    expect(tables.beneficiaries).toBe(1)
    expect(String(tables.loans)).toContain('table missing')
    // גם לטבלה החסרה נכתב קובץ (מערך ריק) — כדי שהשחזור לא ייתקל בחסר
    expect(zip.file('database/loans.json')).toBeTruthy()
  })

  it('קובץ שההורדה שלו נכשלה נספר כשגיאה ואינו עוצר את הגיבוי', async () => {
    const files: FakeFile[] = [{ path: 'ok.pdf', body: Buffer.from('fine') }]
    const { admin } = fakeAdmin({ beneficiaries: [] }, files)
    // מזריקים קובץ שקיים ברשימה אך לא בהורדה
    const spy = admin as unknown as { storage: { from: () => { list: (p: string) => Promise<unknown>; download: (p: string) => Promise<unknown> } } }
    const realFrom = spy.storage.from
    spy.storage.from = () => {
      const api = realFrom()
      return {
        list: (p: string) => p === '' ? Promise.resolve({ data: [
          { name: 'ok.pdf', id: 'i1', metadata: { size: 4 } },
          { name: 'gone.pdf', id: 'i2', metadata: { size: 9 } },
        ], error: null }) : Promise.resolve({ data: [], error: null }),
        download: api.download,
      }
    }

    const { stream, done } = createBackupArchive(admin)
    await collect(stream as AsyncIterable<Buffer>)
    const manifest = await done

    expect(manifest.storageFiles).toBe(1)
    expect(manifest.storageErrors).toBe(1)
  })

  it('⚠️ זורם באמת — בייטים יוצאים לפני שהבנייה הסתיימה', async () => {
    // אם הבייטים הראשונים היו יוצאים רק בסוף, שיא הזיכרון היה נשאר כשהיה
    // וכל המעבר לזרם לא היה שווה כלום.
    const files: FakeFile[] = Array.from({ length: 12 }, (_, i) => ({
      path: `f${i}.bin`, body: Buffer.alloc(64 * 1024, i + 1),
    }))
    const { admin } = fakeAdmin({ beneficiaries: [{ id: 1 }] }, files)

    const { stream, done } = createBackupArchive(admin)
    let doneResolved = false
    void done.then(() => { doneResolved = true })

    let sawDataBeforeDone: boolean | null = null
    for await (const _c of stream as AsyncIterable<Buffer>) {
      void _c
      if (sawDataBeforeDone === null) sawDataBeforeDone = !doneResolved
    }
    await done

    expect(sawDataBeforeDone).toBe(true)
  })
})

describe('תאימות לשחזור', () => {
  // ⚠️ גיבוי שאי אפשר לשחזר אינו גיבוי. lib/restore מחפש מבנה מדויק:
  // manifest.json (או תיקיית database), database/<טבלה>.json, וקבצים תחת
  // files/. הבדיקה מקבעת את המבנה כדי ששינוי בבונה לא ישבור את המשחזר בשקט.
  const RESTORE_TABLES = [
    'beneficiaries', 'loans', 'maternity_aids', 'financial_aid_requests',
    'widow_requests', 'widow_support_payments', 'lineage_nodes', 'documents',
    'recovery_homes', 'card_centers', 'app_settings', 'profiles',
  ]

  it('מייצר בדיוק את המבנה ש-lib/restore מחפש', async () => {
    const { admin } = fakeAdmin(
      Object.fromEntries(RESTORE_TABLES.map(t => [t, [{ id: t }]])),
      [{ path: 'docs/x.pdf', body: Buffer.from('x') }],
    )
    const { stream, done } = createBackupArchive(admin)
    const { buf } = await collect(stream as AsyncIterable<Buffer>)
    await done

    const zip = await JSZip.loadAsync(buf)

    // הבדיקה שהמשחזר עושה כדי לזהות גיבוי תקין
    expect(zip.file('manifest.json') || zip.folder('database')).toBeTruthy()

    // כל טבלה שהמשחזר מחפש
    for (const table of RESTORE_TABLES) {
      const entry = zip.file(`database/${table}.json`)
      expect(entry, `המשחזר מחפש database/${table}.json ולא ימצא`).toBeTruthy()
      expect(JSON.parse(await entry!.async('string'))).toEqual([{ id: table }])
    }

    // הקבצים — תחת התחילית שהמשחזר חותך
    const filePaths = Object.keys(zip.files).filter(p => p.startsWith('files/') && !zip.files[p].dir)
    expect(filePaths).toEqual(['files/docs/x.pdf'])
  })
})

describe('backupFilename', () => {
  it('בונה שם לפי חותמת זמן', () => {
    expect(backupFilename(new Date(2026, 7, 10, 13, 36))).toBe('backup-2026-08-10-1336.zip')
  })
})
