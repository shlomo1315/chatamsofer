// ─────────────────────────────────────────────────────────────────────────────
// יצירה מחדש של כל הקלטות המערכת הטלפונית בקול הנוכחי.
//
// ⚠️ החלפת הקול בהגדרות משנה רק הקלטות *חדשות*. כל קובץ MP3 שכבר הועלה
// לימות ממשיך להתנגן בקול הישן לנצח — אין שום מסך שמראה זאת, והפער מתגלה
// רק כששומעים שתי הודעות עוקבות בשני קולות שונים.
//
// 🔴 המודול משותף למסלול הידני (API) ולמסלול האוטומטי (instrumentation),
// כדי ששניהם יחליפו בדיוק את אותם קבצים באותו אופן. שני עותקים של הלוגיקה
// היו נפרדים בשקט ברגע שאחד מהם מתוקן.
// ─────────────────────────────────────────────────────────────────────────────
import { getServiceClient } from './apiAuth'
import { uploadFileToYemot, deleteFileFromYemot } from './yemot'
import { generateSpeech } from './elevenTts'
import { spokenCenterDetails } from './holidayCenterSpeech'
import { setHolidayMessageAudio, HOLIDAY_MESSAGE_META, getHolidayMessages } from './yemotHolidayMessages'
import { setMaternityMessageAudio, MATERNITY_MESSAGE_META, getMaternityMessages } from './yemotMaternityMessages'
import { setMainMenuMessageAudio, MAIN_MENU_MESSAGE_META, getMainMenuMessages } from './yemotMainMenu'

/** כמה הקלטות לאצווה — נבחר כדי לסיים בבטחה בתוך חלון ה-100 שניות. */
export const BATCH = 8
const HOLIDAY_EXT = process.env.YEMOT_HOLIDAY_EXT || '8'
const hasPlaceholder = (t: string) => /\{[^}]+\}/.test(t)

/** פריט עבודה אחד — הודעת שלוחה או הקלטת מוקד. */
export interface Job {
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
export async function buildJobs(): Promise<Job[]> {
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
export async function runJob(job: Job): Promise<{ ok: boolean; error?: string }> {
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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ההחלפה האוטומטית — רצה ברקע אחרי שהקול הוחלף בהגדרות.
//
// ⚠️ למה אוטומטי ולא בלחיצה: המנהל מחליף קול ומקבל "נשמר בהצלחה", ומשם
// ואילך המערכת מדברת בשני קולות — החדש בהודעות הטקסט, הישן בכל קובץ
// שכבר הוקלט. הדרישה "שהכל יעבוד על הקול החדש" אינה מתקיימת בלי זה.
//
// ⚠️ רץ עד תום עם השהיה בין פריטים: ElevenLabs חוסמת קצב, וריצה צמודה
// מייצרת כשלים אקראיים שנראים כתקלה במערכת.
// ─────────────────────────────────────────────────────────────────────────────
export async function rebuildAllRecordings(): Promise<{ total: number; ok: number; failed: number }> {
  const jobs = await buildJobs()
  let ok = 0
  let failed = 0
  for (const job of jobs) {
    const r = await runJob(job)
    if (r.ok) { ok++ } else {
      failed++
      console.error(`[voice-rebuild] ${job.label}: ${r.error}`)
    }
    await new Promise(res => setTimeout(res, 400))
  }
  return { total: jobs.length, ok, failed }
}
