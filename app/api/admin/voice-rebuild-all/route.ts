import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { yemotConfigured } from '@/lib/yemot'
import { getElevenStatus, getVoiceStale } from '@/lib/elevenTts'
import { buildJobs, runJob, BATCH } from '@/lib/voiceRebuild'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 יצירה מחדש של *כל* הקלטות המערכת הטלפונית בקול הנוכחי — מסלול ידני.
//
// ⚠️ המסלול הרגיל אינו כאן: החלפת קול בהגדרות מסמנת את ההקלטות כמיושנות,
// והשרת מחליף אותן מעצמו ברקע (instrumentation → tickVoiceRebuild). המסלול
// הזה נשאר להרצה מיידית ולבדיקת מצב.
//
// 🔴 רץ באצוות: יצירת קול + העלאה לימות היא ~3–6 שניות להודעה, ועשרות
// הקלטות הן הרבה מעבר לחלון של Cloudflare (100 שניות) — ריצה אחת הייתה
// נקטעת ב-524 אחרי שכבר הוחלפו חלק מהקבצים, בלי דוח על מה הוחלף.
// ─────────────────────────────────────────────────────────────────────────────

// GET — מה מצב ההקלטות. אינו משנה דבר.
export async function GET() {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const jobs = await buildJobs()
  const status = await getElevenStatus()
  const stale = await getVoiceStale()
  return NextResponse.json({
    currentVoiceId: status.voiceId,
    pendingRebuild: stale.stale,
    markedAt: stale.markedAt,
    totalRecordings: jobs.length,
    byKind: jobs.reduce<Record<string, number>>((a, j) => ({ ...a, [j.kind]: (a[j.kind] ?? 0) + 1 }), {}),
    items: jobs.map(j => j.label),
  })
}

// POST { offset? } — מייצר אצווה אחת בקול הנוכחי.
export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  if (!yemotConfigured()) return NextResponse.json({ error: 'YEMOT_TOKEN אינו מוגדר בשרת' }, { status: 500 })

  const status = await getElevenStatus()
  if (!status.hasKey || !status.voiceId) {
    return NextResponse.json({ error: 'ElevenLabs אינו מוגדר — יש לבחור קול בהגדרות' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({})) as { offset?: number }
  const offset = Math.max(0, Number(body.offset ?? 0) || 0)

  const jobs = await buildJobs()
  const slice = jobs.slice(offset, offset + BATCH)

  const done: string[] = []
  const errors: Record<string, string> = {}
  for (const job of slice) {
    const r = await runJob(job)
    if (r.ok) done.push(job.label)
    else errors[job.label] = r.error ?? 'תקלה'
  }

  const nextOffset = offset + slice.length
  const finished = nextOffset >= jobs.length

  return NextResponse.json({
    voiceId: status.voiceId,
    progress: { total: jobs.length, rebuiltSoFar: nextOffset, inThisBatch: slice.length, done: finished },
    rebuilt: done,
    errors,
    nextOffset: finished ? null : nextOffset,
  })
}
