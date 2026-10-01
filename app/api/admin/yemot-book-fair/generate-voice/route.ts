import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { uploadFileToYemot, deleteFileFromYemot, yemotConfigured } from '@/lib/yemot'
import { generateSpeech } from '@/lib/elevenTts'
import {
  setBookFairMessageAudio, BOOK_FAIR_MESSAGE_META, getBookFairMessages,
} from '@/lib/yemotBookFairMessages'

export const dynamic = 'force-dynamic'

// שלוחת יריד הספרים בימות — שם נשמרים קבצי הקול.
const BOOK_FAIR_EXT = process.env.YEMOT_BOOK_FAIR_EXT || '9'

function metaFor(key: string) {
  return BOOK_FAIR_MESSAGE_META.find((m) => m.key === key)
}

// הודעה כשירה ליצירת קול: ניתנת להקלטה ואין בטקסט בפועל משתנה {...}
// (קובץ יחיד אינו יכול לשרת ערכים משתנים).
const hasPlaceholder = (t: string) => /\{[^}]+\}/.test(t)
function eligible(key: string, text: string): boolean {
  const m = metaFor(key)
  return !!m && m.allowAudio && !hasPlaceholder(text)
}

async function generateOne(key: string, text: string): Promise<{ ok: true; audio: string } | { ok: false; error: string }> {
  const speech = await generateSpeech(text)
  if (!speech.ok || !speech.audio) return { ok: false, error: speech.error ?? 'יצירת הקול נכשלה' }

  // 🔴 חותמת זמן בשם הקובץ, ולא שם קבוע: ימות מחזיקה את הקובץ במטמון
  // לפי שמו, ולכן שם קבוע גרם לכך שההקלטה *הישנה* המשיכה להתנגן אחרי
  // כל עריכה — בלי שום סימן לכך שמשהו לא בסדר.
  //
  // ⚠️ שם הקובץ הקודם נקרא *לפני* השמירה, אחרת הוא כבר נדרס ולא נדע
  // מה למחוק.
  const prevAudio = (await getBookFairMessages())[key]?.audio ?? null

  const baseName = `tts_${key}_${Date.now().toString(36)}`
  const path = `ivr2:/${BOOK_FAIR_EXT}/${baseName}.mp3`
  const blob = new Blob([speech.audio], { type: 'audio/mpeg' })
  const up = await uploadFileToYemot(path, blob, `${baseName}.mp3`)
  if (!up.ok) return { ok: false, error: `העלאה לימות נכשלה: ${up.error}` }

  const saved = await setBookFairMessageAudio(key, baseName)
  if (!saved) return { ok: false, error: 'הקול נוצר אך שמירת ההגדרה נכשלה' }

  // ניקוי הקובץ הקודם — best-effort ואחרי השמירה: כישלון מחיקה משאיר
  // קובץ מיותר בימות, אבל לא שובר את ההשמעה החדשה.
  if (prevAudio && prevAudio !== baseName) {
    const gone = await deleteFileFromYemot(`ivr2:/${BOOK_FAIR_EXT}/${prevAudio}.mp3`)
    if (!gone.ok) console.warn(`[yemot-book-fair] מחיקת הקובץ הקודם נכשלה (${prevAudio}): ${gone.error}`)
  }
  return { ok: true, audio: baseName }
}

// POST — יצירת קול נוירוני.
//   { key, text }  → הודעה אחת
//   { all: true }  → כל ההודעות הכשירות (טקסט מתוך ההגדרות השמורות)
export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  if (!yemotConfigured()) return NextResponse.json({ error: 'YEMOT_TOKEN אינו מוגדר בשרת' }, { status: 500 })

  const body = await request.json().catch(() => null) as { key?: string; text?: string; all?: boolean } | null
  if (!body) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  if (body.all) {
    const msgs = await getBookFairMessages()
    const keys = BOOK_FAIR_MESSAGE_META.filter((m) => m.allowAudio).map((m) => m.key)
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
      messages: await getBookFairMessages(),
    })
  }

  const key = String(body.key ?? '').trim()
  if (!metaFor(key)) return NextResponse.json({ error: 'מפתח הודעה לא מוכר' }, { status: 400 })

  const text = String(body.text ?? '').trim() || (await getBookFairMessages())[key]?.text || metaFor(key)?.defaultText || ''
  if (!text) return NextResponse.json({ error: 'אין טקסט ליצירה' }, { status: 400 })
  if (!eligible(key, text)) return NextResponse.json({ error: 'לא ניתן לייצר קול — הסר/י את המשתנה {...} מהטקסט תחילה' }, { status: 400 })

  const r = await generateOne(key, text)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 })

  return NextResponse.json({ ok: true, audio: r.audio, messages: await getBookFairMessages() })
}
