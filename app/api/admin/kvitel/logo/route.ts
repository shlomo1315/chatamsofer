import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { scrambleBytes, DOC_CIPHER_ID } from '@/lib/docCipher'
import { KVITEL_LOGO } from '@/lib/kvitelDocLayout'

// הלוגו לתצוגה המקדימה של הקוויטל, כ-JSON מעורבל ולא כתמונה (אותה שיטה כמו /api/files/data).
// ⚠️ כתמונה רגילה (<img src="/logo-heichal-bw.png">) מסנן התוכן החליף אותה בריבוע אפור מטושטש,
// כי יש בלוגו ציור פנים. הדפדפן מפענח ומצייר על canvas (KvitelLogo ב-KvitelPreview.tsx).
// בקובץ שיורד (PDF/Word) הלוגו מוטמע בשרת, ולא נוגעים בו כאן.

export const runtime = 'nodejs'

export async function GET() {
  const staff = await requirePermission('kvitel', 'view')
  if (!staff) return forbidden()
  const buf = await readFile(path.join(process.cwd(), 'public', KVITEL_LOGO.file)).catch(() => null)
  if (!buf) return NextResponse.json({ error: 'הלוגו לא נמצא' }, { status: 404 })
  return NextResponse.json(
    { enc: DOC_CIPHER_ID, data: Buffer.from(scrambleBytes(new Uint8Array(buf))).toString('base64') },
    { headers: { 'Cache-Control': 'private, max-age=86400' } },
  )
}
