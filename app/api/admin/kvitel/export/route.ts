import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { buildKvitelDocx } from '@/lib/kvitelDocx'
import { kvitelExportLines, loadKvitelRequests, parseKvitelFilters } from '@/lib/kvitelQuery'

// ייצוא הקוויטל לקובץ Word — אותו סינון כמו במסך (lib/kvitelQuery).
// ?ids=a,b — רק הבקשות שסומנו. בלי ids — כל מה שעומד בסינון, מכל הערוצים יחד.
//
// ⚠️ "לבדיקה" ו"בוטל" לעולם לא נכנסים לקובץ: שם שלא אושר לא מגיע לציון.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const staff = await requirePermission('kvitel', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const sp = request.nextUrl.searchParams
  const filters = parseKvitelFilters(Object.fromEntries(sp.entries()))
  const ids = new Set((sp.get('ids') ?? '').split(',').filter(x => UUID_RE.test(x)))

  const { rows, error } = await loadKvitelRequests(db, filters)
  if (error) return NextResponse.json({ error: 'שליפת הבקשות נכשלה' }, { status: 500 })

  const lines = kvitelExportLines(rows, ids)
  if (!lines.length) return NextResponse.json({ error: 'אין שמות מאושרים לייצוא בסינון הזה' }, { status: 404 })

  const logoPng = await readFile(path.join(process.cwd(), 'public', 'logo-voucher.png')).catch(() => null)
  const bytes = await buildKvitelDocx({ lines, date: new Date(), logoPng })
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date())
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="kvitel-${day}.docx"; filename*=UTF-8''${encodeURIComponent(`קוויטל-${day}.docx`)}`,
      'Cache-Control': 'no-store',
    },
  })
}
