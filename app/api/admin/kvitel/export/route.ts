import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { buildKvitelDocx } from '@/lib/kvitelDocx'
import { buildKvitelPdf } from '@/lib/kvitelPdf'
import { KVITEL_LOGO } from '@/lib/kvitelDocLayout'
import { kvitelFileResponse } from '@/lib/kvitelFileResponse'
import { kvitelExportLines, loadKvitelRequests, parseKvitelFilters } from '@/lib/kvitelQuery'

// ייצוא הקוויטל — אותו סינון כמו במסך (lib/kvitelQuery), כ-PDF בדף A4 (ברירת מחדל) או Word.
// הסינון בכתובת. הבקשות שסומנו (ids) — בגוף בקשת POST.
//
// ⚠️ לא להחזיר את ids לכתובת: חומת ההגנה (WAF, SizeRestrictions_QUERYSTRING) חוסמת
// כתובת ארוכה, ו-185 מזהים כבר חסמו את הייצוא ("ההורדה נכשלה"). גוף הבקשה לא נחסם.
// ⚠️ "לבדיקה" ו"בוטל" לעולם לא נכנסים לקובץ: שם שלא אושר לא מגיע לציון.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_IDS = 5000

type Format = 'pdf' | 'docx'

async function exportFile(request: NextRequest, ids: string[], format: unknown) {
  const staff = await requirePermission('kvitel', 'view')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const fmt: Format | null = format == null || format === 'pdf' ? 'pdf' : format === 'docx' ? 'docx' : null
  if (!fmt) return NextResponse.json({ error: 'פורמט לא נתמך' }, { status: 400 })
  if (ids.length > MAX_IDS || !ids.every(i => UUID_RE.test(i))) {
    return NextResponse.json({ error: 'רשימת מזהים לא תקינה' }, { status: 400 })
  }

  const filters = parseKvitelFilters(Object.fromEntries(request.nextUrl.searchParams.entries()))
  const { rows, error } = await loadKvitelRequests(db, filters)
  if (error) return NextResponse.json({ error: 'שליפת הבקשות נכשלה' }, { status: 500 })

  const lines = kvitelExportLines(rows, new Set(ids))
  if (!lines.length) return NextResponse.json({ error: 'אין שמות מאושרים לייצוא בסינון הזה' }, { status: 404 })

  const logoPng = await readFile(path.join(process.cwd(), 'public', KVITEL_LOGO.file)).catch(() => null)
  const date = new Date()
  const bytes = fmt === 'pdf' ? await buildKvitelPdf({ lines, date, logoPng }) : await buildKvitelDocx({ lines, date, logoPng })
  return kvitelFileResponse(bytes, fmt, date)
}

// GET — תאימות לקישור ישן (?ids=a,b&format=docx). מזהה אחד או כמה — לא רשימה ארוכה.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const ids = (sp.get('ids') ?? '').split(',').filter(Boolean)
  return exportFile(request, ids, sp.get('format'))
}

// POST { ids?: string[], format?: 'pdf' | 'docx' } — בלי ids: כל מה שעומד בסינון.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { ids?: unknown; format?: unknown } | null
  const raw = body?.ids ?? []
  if (!Array.isArray(raw) || !raw.every((i): i is string => typeof i === 'string')) {
    return NextResponse.json({ error: 'רשימת מזהים לא תקינה' }, { status: 400 })
  }
  return exportFile(request, raw, body?.format)
}
