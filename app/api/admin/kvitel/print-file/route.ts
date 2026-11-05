import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { buildKvitelDocx } from '@/lib/kvitelDocx'
import { buildKvitelPdf } from '@/lib/kvitelPdf'
import { KVITEL_LOGO } from '@/lib/kvitelDocLayout'
import { kvitelExportLines, loadKvitelRequests, parseKvitelFilters } from '@/lib/kvitelQuery'

// הורדת קוויטלאך חדשים כ-PDF או Word. ההורדה לא משנה סטטוס — הסימון "נשלח לציון" נעשה בנפרד.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_IDS = 500

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const staff = await requirePermission('kvitel', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const body = await req.json().catch(() => null) as { ids?: unknown; format?: unknown } | null
  const ids = Array.isArray(body?.ids) ? body.ids : null
  const format = body?.format
  if (!ids || !ids.length || ids.length > MAX_IDS || !ids.every((i): i is string => typeof i === 'string' && UUID_RE.test(i))) {
    return NextResponse.json({ error: 'רשימת מזהים לא תקינה' }, { status: 400 })
  }
  if (format !== 'pdf' && format !== 'docx') return NextResponse.json({ error: 'פורמט לא נתמך' }, { status: 400 })

  // רק "ממתין לשליחה" — כמו ההדפסה
  const { rows, error } = await loadKvitelRequests(db, parseKvitelFilters({ status: 'pending' }))
  if (error) return NextResponse.json({ error: 'טעינת הבקשות נכשלה' }, { status: 500 })
  const lines = kvitelExportLines(rows.filter(r => r.status === 'pending'), new Set<string>(ids))
  if (!lines.length) return NextResponse.json({ error: 'אין שמות להורדה' }, { status: 404 })

  const logoPng = await readFile(path.join(process.cwd(), 'public', KVITEL_LOGO.file)).catch(() => null)
  const date = new Date()
  const bytes = format === 'pdf' ? await buildKvitelPdf({ lines, date, logoPng }) : await buildKvitelDocx({ lines, date, logoPng })
  const type = format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return new NextResponse(Buffer.from(bytes), {
    headers: { 'Content-Type': type, 'Content-Disposition': `attachment; filename="kvitel.${format}"`, 'Cache-Control': 'no-store' },
  })
}
