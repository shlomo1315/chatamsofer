import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { buildKvitelDocx } from '@/lib/kvitelDocx'
import { buildKvitelPdf } from '@/lib/kvitelPdf'
import { KVITEL_LOGO } from '@/lib/kvitelDocLayout'
import { kvitelFileResponse } from '@/lib/kvitelFileResponse'

// הורדה חוזרת של קובץ ממנה שנסגרה: נבנה מהשורות שנרשמו בסגירה ובתאריך הסגירה — בדיוק מה שנשלח.
// POST { format } (ולא GET, כמו שאר ההורדות של הקוויטלאך).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('kvitel', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 })
  const body = await req.json().catch(() => null) as { format?: unknown } | null
  const format = body?.format
  if (format !== 'pdf' && format !== 'docx') return NextResponse.json({ error: 'פורמט לא נתמך' }, { status: 400 })

  const { data, error } = await db.from('kvitel_batches').select('closed_at, lines').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: 'טעינת המנה נכשלה' }, { status: 500 })
  if (!data?.lines?.length) return NextResponse.json({ error: 'המנה לא נמצאה' }, { status: 404 })

  const logoPng = await readFile(path.join(process.cwd(), 'public', KVITEL_LOGO.file)).catch(() => null)
  const date = new Date(data.closed_at)
  const lines = data.lines as string[]
  const bytes = format === 'pdf' ? await buildKvitelPdf({ lines, date, logoPng }) : await buildKvitelDocx({ lines, date, logoPng })
  return kvitelFileResponse(bytes, format, date)
}
