import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'
import { yemotConfigured, uploadFileToYemot, deleteFileFromYemot } from '@/lib/yemot'
import { generateSpeech, getElevenStatus } from '@/lib/elevenTts'
import { spokenCenterDetails } from '@/lib/holidayCenterSpeech'
import { setHolidayMessageAudio, HOLIDAY_MESSAGE_META, getHolidayMessages } from '@/lib/yemotHolidayMessages'
import { setMaternityMessageAudio, MATERNITY_MESSAGE_META, getMaternityMessages } from '@/lib/yemotMaternityMessages'
import { setMainMenuMessageAudio, MAIN_MENU_MESSAGE_META, getMainMenuMessages } from '@/lib/yemotMainMenu'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 יצירה מחדש של *כל* הקלטות המערכת הטלפונית בקול הנוכחי.
//
// ⚠️ למה זה נחוץ: החלפת הקול בהגדרות משנה רק הקלטות *חדשות*. כל קובץ MP3
// שכבר הועלה לימות ימשיך להתנגן בקול הישן לנצח — אין שום מסך שמראה זאת,
// והפער מתגלה רק כששומעים שתי הודעות עוקבות בשני קולות שונים.
//
// 🔴 רץ באצוות. יצירת קול + העלאה לימות היא ~3–6 שניות להודעה, ו-39
// הקלטות הן הרבה מעבר לחלון של Cloudflare (100 שניות) — ריצה אחת הייתה
// נקטעת ב-524 אחרי שכבר הוחלפו חלק מהקבצים, בלי דוח על מה הוחלף.
//
// ⚠️ הודעות עם {משתנה} מדולגות: קובץ יחיד אינו יכול לשרת ערך משתנה, והן
// מוקראות כטקסט ממילא.
//
// שימוש:  POST /api/admin/voice-rebuild-all         → מתחיל, מחזיר nextOffset
//         POST { offset: 8 }                        → ממשיך
//         GET  /api/admin/voice-rebuild-all         → מה מצב ההקלטות (ללא שינוי)
// ─────────────────────────────────────────────────────────────────────────────

/** כמה הקלטות לאצווה — נבחר כדי לסיים בבטחה בתוך חלון ה-100 שניות. */
const BATCH = 8
const HOLIDAY_EXT = process.env.YEMOT_HOLIDAY_EXT || '8'
const hasPlaceholder = (t: string) => /\{[^}]+\}/.test(t)

/** פריט עבודה אחד — הודעת שלוחה או הקלטת מוקד. */
interface Job {
  kind: 'holiday' | 'maternity' | 'menu' | 'center'
  key: string
  label: string
  text: string
}

/**
 * בניית רשימת העבודה המלאה, בסדר יציב.
 *
 * 🔴 הסדר חייב להיות דטרמיניסטי: האצווה הבאה נלקחת לפי offset, ורשימה
 * שמשנה סדר בין קריאות הייתה מדלגת על הקלטות ומייצרת אחרות פעמיים.
 */
async function buildJobs(): Promise<Job[]> {
  const jobs: Job[] = []

  const holiday = await getHolidayMessages()
  for (const m of HOLIDAY_MESSAGE_META) {
    if (!m.allowAudio) continue
    const text = (holiday[m.key]?.text ?? m.defaultText ?? '').trim()
    if (!text || hasPlaceholder(text)) continue
    jobs.push({ kind: 'holiday', key: m.key, label: `חגים · ${m.key}`, text })
  }

  const maternity = await getMaternityMessages()
  for (const m of MATERNITY_MESSAGE_META) {
    if (!m.allowAudio) continue
    const text = (maternity[m.key]?.text ?? m.defaultText ?? '').trim()
    if (!text || hasPlaceholder(text)) continue
    jobs.push({ kind: 'maternity', key: m.key, label: `יולדות · ${m.key}`, text })
  }

  const menu = await getMainMenuMessages()
  for (const m of MAIN_MENU_MESSAGE_META) {
    if (!m.allowAudio) continue
    const text = (menu[m.key]?.text ?? m.defaultText ?? '').trim()
    if (!text || hasPlaceholder(text)) continue
    jobs.push({ kind: 'menu', key: m.key, label: `תפריט · ${m.key}`, text })
  }

  // ⚠️ רק מוקדים שכבר יש להם הקלטה: יצירה למוקד שמעולם לא הוקלט היא
  // החלטה תפעולית (האם הוא בכלל פעיל), ולא חלק מהחלפת קול.
  const db = getServiceClient()
  if (db) {
    const { data } = await db.from('holiday_centers')
      .select('id, city, name, address, hours, audio_file')
      .not('audio_file', 'is', null)
      .order('id')
    for (const c of (data ?? []) as Record<string, unknown>[]) {
      const text = spokenCenterDetails(c as never)
      if (!text) continue
      jobs.push({
        kind: 'center', key: String(c.id),
        label: `מוקד · ${[c.city, c.name].filter(Boolean).join(' ')}`,
        text,
      })
    }
  }

  return jobs
}

/** יצירה מחדש של פריט אחד. מחזיר תוצאה ואינו זורק — כשל אחד אינו מפיל אצווה. */
async function runJob(job: Job): Promise<{ ok: boolean; error?: string }> {
  const speech = await generateSpeech(job.text)
  if (!speech.ok || !speech.audio) return { ok: false, error: speech.error ?? 'יצירת הקול נכשלה' }

  const blob = new Blob([speech.audio], { type: 'audio/mpeg' })

  if (job.kind === 'center') {
    const db = getServiceClient()
    if (!db) return { ok: false, error: 'שגיאת שרת' }
    const { data: row } = await db.from('holiday_centers')
      .select('audio_file').eq('id', job.key).maybeSingle()
    const prev = (row as { audio_file: string | null } | null)?.audio_file ?? null

    // 🔴 שם ייחודי לכל גרסה — ימות ממטמנת לפי שם הקובץ, ושם קבוע היה
    // משאיר את ההקלטה הישנה מתנגנת בלי שום סימן לתקלה.
    const baseName = `ctr_${job.key.replace(/-/g, '').slice(0, 12)}_${Date.now().toString(36)}`
    const up = await uploadFileToYemot(`ivr2:/${HOLIDAY_EXT}/${baseName}.mp3`, blob, `${baseName}.mp3`)
    if (!up.ok) return { ok: false, error: `העלאה לימות נכשלה: ${up.error}` }

    const { error } = await db.from('holiday_centers').update({ audio_file: baseName }).eq('id', job.key)
    if (error) return { ok: false, error: 'הקול נוצר אך שמירת ההגדרה נכשלה' }

    // ⚠️ מחיקה אחרי השמירה ו-best-effort: קובץ יתום עדיף על הודעה אילמת.
    if (prev && prev !== baseName) {
      for (const ext of ['mp3', 'wav']) {
        const gone = await deleteFileFromYemot(`ivr2:/${HOLIDAY_EXT}/${prev}.${ext}`)
        if (gone.ok) break
      }
    }
    return { ok: true }
  }

  const ext = job.kind === 'holiday' ? HOLIDAY_EXT
    : job.kind === 'maternity' ? (process.env.YEMOT_MATERNITY_EXT || '7')
    : (process.env.YEMOT_MENU_EXT || '')

  const prevMsgs = job.kind === 'holiday' ? await getHolidayMessages()
    : job.kind === 'maternity' ? await getMaternityMessages()
    : await getMainMenuMessages()
  const prev = prevMsgs[job.key]?.audio ?? null

  const baseName = `tts_${job.key}_${Date.now().toString(36)}`
  const path = ext ? `ivr2:/${ext}/${baseName}.mp3` : `ivr2:/${baseName}.mp3`
  const up = await uploadFileToYemot(path, blob, `${baseName}.mp3`)
  if (!up.ok) return { ok: false, error: `העלאה לימות נכשלה: ${up.error}` }

  const saved = job.kind === 'holiday' ? await setHolidayMessageAudio(job.key, baseName)
    : job.kind === 'maternity' ? await setMaternityMessageAudio(job.key, baseName)
    : await setMainMenuMessageAudio(job.key, baseName)
  if (!saved) return { ok: false, error: 'הקול נוצר אך שמירת ההגדרה נכשלה' }

  if (prev && prev !== baseName) {
    const gone = await deleteFileFromYemot(ext ? `ivr2:/${ext}/${prev}.mp3` : `ivr2:/${prev}.mp3`)
    if (!gone.ok) console.warn(`[voice-rebuild] מחיקת הקובץ הקודם נכשלה (${prev}): ${gone.error}`)
  }
  return { ok: true }
}

// GET — מה מצב ההקלטות. אינו משנה דבר.
export async function GET() {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const jobs = await buildJobs()
  const status = await getElevenStatus()
  return NextResponse.json({
    currentVoiceId: status.voiceId,
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
