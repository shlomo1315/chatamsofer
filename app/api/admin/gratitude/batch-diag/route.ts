import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, forbidden, getServiceClient } from '@/lib/apiAuth'
import { buildGratitudeBatchLetters } from '@/lib/gratitudeBatchLetters'
import { GRATITUDE_LETTER_SELECT, type GratitudeLetterRow } from '../[id]/shared'
import { selectBatch, type BatchFilters, type SentFilter } from '@/lib/gratitudeBatch'

// אבחון הפקת הקובץ המרוכז: מריץ את אותו מסלול בדיוק, אך מחזיר JSON עם
// השגיאה האמיתית ומדדי זיכרון/זמן — במקום ליפול ולהחזיר 502 בלי הסבר.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const mb = (n: number) => Math.round(n / 1024 / 1024)

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return forbidden('אבחון שמור לצוות')

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const sp = request.nextUrl.searchParams
  const SENT: SentFilter[] = ['all', 'unsent', 'sent']
  const filters: BatchFilters = {
    from: (sp.get('from') ?? '').trim() || null,
    to: (sp.get('to') ?? '').trim() || null,
    sent: SENT.includes(sp.get('sent') as SentFilter) ? (sp.get('sent') as SentFilter) : 'all',
  }

  const t0 = Date.now()
  const { data, error } = await db
    .from('gratitude_letters')
    .select(GRATITUDE_LETTER_SELECT)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ stage: 'db', error: error.message }, { status: 200 })
  }

  const letters = (data ?? []) as unknown as GratitudeLetterRow[]
  const picked = selectBatch(letters, filters)
  const dbMs = Date.now() - t0

  // מדד גודל אמיתי: אורך גוף הברכה הארוך ביותר, שממנו נגזר מספר העמודים.
  const bodyLens = picked.map(r => (r.body ?? '').length).sort((a, b) => b - a)

  const before = process.memoryUsage()
  const t1 = Date.now()
  try {
    const bytes = await buildGratitudeBatchLetters({ letters, filters })
    const after = process.memoryUsage()
    return NextResponse.json({
      ok: true,
      filters,
      totalLettersInDb: letters.length,
      selected: picked.length,
      dbMs,
      buildMs: Date.now() - t1,
      pdfBytes: bytes.length,
      longestBodyChars: bodyLens[0] ?? 0,
      top5BodyChars: bodyLens.slice(0, 5),
      heapBeforeMb: mb(before.heapUsed),
      heapAfterMb: mb(after.heapUsed),
      rssAfterMb: mb(after.rss),
    })
  } catch (e) {
    return NextResponse.json({
      ok: false,
      stage: 'build',
      filters,
      totalLettersInDb: letters.length,
      selected: picked.length,
      longestBodyChars: bodyLens[0] ?? 0,
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? (e.stack ?? '').split('\n').slice(0, 12) : [],
    }, { status: 200 })
  }
}
