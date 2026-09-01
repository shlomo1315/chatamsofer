import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { uploadFileToYemot, deleteFileFromYemot, yemotConfigured } from '@/lib/yemot'
import { generateSpeech } from '@/lib/elevenTts'
import { setHolidayMessageAudio, HOLIDAY_MESSAGE_META, getHolidayMessages } from '@/lib/yemotHolidayMessages'

export const dynamic = 'force-dynamic'

// ⚠️ שלוחת חלוקות החגים — תיקייה נפרדת משלוחת היולדות, אחרת קבצים בשמות זהים
// (tts_<key>) דורסים אלה את אלה. ניתן לשינוי דרך YEMOT_HOLIDAY_EXT.
const HOLIDAY_EXT = process.env.YEMOT_HOLIDAY_EXT || '8'

function metaFor(key: string) {
  return HOLIDAY_MESSAGE_META.find((m) => m.key === key)
}

// הודעה כשירה ליצירת קול נוירוני: ניתנת להקלטה ואינה דינמית (בלי {משתנים}),
// כי קובץ יחיד לא יכול לשרת ערכים משתנים. נחסם רק אם הטקסט בפועל מכיל משתנה {...}.
const hasPlaceholder = (t: string) => /\{[^}]+\}/.test(t)
function eligible(key: string, text: string): boolean {
  const m = metaFor(key)
  return !!m && m.allowAudio && !hasPlaceholder(text)
}

// יצירת קול נוירוני להודעה אחת — מייצר ב-ElevenLabs ומעלה לימות
async function generateOne(key: string, text: string): Promise<{ ok: true; audio: string } | { ok: false; error: string }> {
  const speech = await generateSpeech(text)
  if (!speech.ok || !speech.audio) return { ok: false, error: speech.error ?? 'יצירת הקול נכשלה' }

  // ⚠️ הקובץ הקודם נקרא *לפני* השמירה, אחרת שמו כבר נדרס ולא נדע מה למחוק.
  const prevAudio = (await getHolidayMessages())[key]?.audio ?? null

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 שם ייחודי לכל גרסה — ולא `tts_<key>` קבוע.
  //
  // ⚠️ זה היה באג שקט וקשה לאבחון: השם הקבוע גרם לכל יצירה מחדש לדרוס
  // את אותו נתיב בימות, וימות המשיכה לנגן את הגרסה שבמטמון שלה. המנהל
  // ערך את הטקסט, לחץ "יצירת קול טבעי", קיבל "נשמר בהצלחה" — ובטלפון
  // נשמעה ההקלטה הישנה. אין שום סימן לתקלה בשום מסך.
  //
  // ⚠️ החותמת חייבת להיות בשם הקובץ ולא בפרמטר שאילתה: ימות מנגנת קובץ
  // מהתיקייה שלה לפי שם, ואין שם שכבת HTTP שאפשר לעקוף בה מטמון.
  // ─────────────────────────────────────────────────────────────────────────
  const baseName = `tts_${key}_${Date.now().toString(36)}`
  const path = `ivr2:/${HOLIDAY_EXT}/${baseName}.mp3`
  const blob = new Blob([speech.audio], { type: 'audio/mpeg' })
  const up = await uploadFileToYemot(path, blob, `${baseName}.mp3`)
  if (!up.ok) return { ok: false, error: `העלאה לימות נכשלה: ${up.error}` }

  const saved = await setHolidayMessageAudio(key, baseName)
  if (!saved) return { ok: false, error: 'הקול נוצר אך שמירת ההגדרה נכשלה' }

  // ── ניקוי הקובץ הקודם ──
  // ⚠️ אחרי השמירה ולא לפניה: אם המחיקה תרוץ קודם וההעלאה תיכשל, השלוחה
  // תישאר בלי שום קובץ ותשמיע שקט. עדיף קובץ יתום מהודעה אילמת.
  // ⚠️ best-effort: כישלון מחיקה אינו הופך יצירה מוצלחת לכישלון.
  if (prevAudio && prevAudio !== baseName) {
    const gone = await deleteFileFromYemot(`ivr2:/${HOLIDAY_EXT}/${prevAudio}.mp3`)
    if (!gone.ok) console.warn(`[yemot-holiday] מחיקת הקובץ הקודם נכשלה (${prevAudio}): ${gone.error}`)
  }
  return { ok: true, audio: baseName }
}

// POST — יצירת קול נוירוני.
//   { key, text }      → הודעה אחת
//   { all: true }      → כל ההודעות הכשירות (טקסט מתוך ההגדרות השמורות)
export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  if (!yemotConfigured()) return NextResponse.json({ error: 'YEMOT_TOKEN אינו מוגדר בשרת' }, { status: 500 })

  const body = await request.json().catch(() => null) as { key?: string; text?: string; all?: boolean } | null
  if (!body) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  // יצירה לכל ההודעות הכשירות
  if (body.all) {
    const msgs = await getHolidayMessages()
    const keys = HOLIDAY_MESSAGE_META.filter((m) => m.allowAudio).map((m) => m.key)
    const results: Record<string, string> = {}
    const errors: Record<string, string> = {}
    for (const key of keys) {
      const text = (msgs[key]?.text ?? metaFor(key)?.defaultText ?? '').trim()
      if (!text) { errors[key] = 'אין טקסט'; continue }
      if (hasPlaceholder(text)) continue // הודעה דינמית — מדלגים בשקט
      const r = await generateOne(key, text)
      if (r.ok) results[key] = r.audio
      else errors[key] = r.error
    }
    return NextResponse.json({
      ok: Object.keys(errors).length === 0,
      generated: Object.keys(results),
      errors,
      messages: await getHolidayMessages(),
    })
  }

  // יצירה להודעה בודדת
  const key = String(body.key ?? '').trim()
  if (!metaFor(key)) return NextResponse.json({ error: 'מפתח הודעה לא מוכר' }, { status: 400 })

  const text = String(body.text ?? '').trim() || (await getHolidayMessages())[key]?.text || metaFor(key)?.defaultText || ''
  if (!text) return NextResponse.json({ error: 'אין טקסט ליצירה' }, { status: 400 })
  if (!eligible(key, text)) return NextResponse.json({ error: 'לא ניתן לייצר קול — הסר/י את המשתנה {...} מהטקסט תחילה' }, { status: 400 })

  const r = await generateOne(key, text)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 })

  return NextResponse.json({ ok: true, audio: r.audio, messages: await getHolidayMessages() })
}
