import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { uploadFileToYemot, deleteFileFromYemot, yemotConfigured } from '@/lib/yemot'
import { generateSpeech } from '@/lib/elevenTts'
import {
  setBookFairMessageAudio, BOOK_FAIR_MESSAGE_META, getBookFairMessages,
} from '@/lib/yemotBookFairMessages'

export const dynamic = 'force-dynamic'
// 🔴 67 נוסחים × ~4 שניות חורגים בהרבה מברירת המחדל: הבקשה הייתה
// נקטעת באמצע, חלק מהקבצים היו מועלים, והמסך היה מדווח כישלון כללי
// בלי לומר מה כן נוצר.
export const maxDuration = 300

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
  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 MP3 — בדיוק כמו בחגים וביולדות, שבהן הקול הטבעי עובד.
  //
  // ⚠️ כאן היה הבאג שהפיל את השלוחה: היריד היה *היחיד* שביקש
  // `pcm_8000` והעלה `.wav`. כל שיחה עם טוקן `f-` נותקה מיד אחרי
  // הברכה — 100% מהשיחות, בכל תצורה שנוסתה (13/14 שדות, Digits/No,
  // עם keys ובלי, פתיחה משורשרת ומופרדת). במקביל *כל* שיחה עם `t-`
  // עבדה. ההוכחה בלוגים של 04.10: 07:57-10:28 ו-13:14 (t-) התקדמו
  // עד מק"ט ומחיר, וכל שיחות ה-f- הסתיימו ב-noop=hangup.
  //
  // ⚠️ ההנחה ש"ימות מנגנת 8kHz בלבד" הובילה לתיקון מראש מיותר:
  // `uploadFileToYemot` שולח `convertAudio=1`, כלומר **ימות ממירה
  // בעצמה** לפורמט הניגון שלה. אין צורך להמיר לפניה — ודווקא ההמרה
  // המקדימה היא מה ששבר.
  // ─────────────────────────────────────────────────────────────────────────
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
    // ⚠️ שתי הסיומות: הקבצים שנוצרו עד 04.10 הם `.wav` פגומים (PCM),
    // והחדשים `.mp3`. מחיקה של סיומת אחת בלבד הייתה משאירה בשלוחה
    // בדיוק את הקבצים ששברו אותה.
    for (const ext of ['mp3', 'wav'] as const) {
      const gone = await deleteFileFromYemot(`ivr2:/${BOOK_FAIR_EXT}/${prevAudio}.${ext}`)
      if (!gone.ok) console.warn(`[yemot-book-fair] מחיקת הקובץ הקודם נכשלה (${prevAudio}.${ext}): ${gone.error}`)
    }
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
    const results: Record<string, string> = {}
    const errors: Record<string, string> = {}

    // 🔴 רק מה שחסר: יצירה חוזרת של 67 קבצים בכל לחיצה היא בזבוז
    // ארוך שגם חורג מזמן הבקשה. מי שרוצה לחדש נוסח בודד — יש כפתור
    // ייעודי לכל הודעה.
    //
    // ⚠️ הקלטה אנושית (rec_) לעולם אינה נדרסת כאן.
    const pending = BOOK_FAIR_MESSAGE_META
      .filter(m => m.allowAudio)
      .filter(m => {
        const text = (msgs[m.key]?.text ?? m.defaultText ?? '').trim()
        if (!text || hasPlaceholder(text)) return false
        return !msgs[m.key]?.audio
      })
      .map(m => m.key)

    // ⚠️ מנה מוגבלת: כל קובץ לוקח כמה שניות, ו-67 ברצף חורגים מזמן
    // הבקשה גם עם maxDuration. המסך קורא שוב עד ש-remaining מתאפס.
    const BATCH = 12
    for (const key of pending.slice(0, BATCH)) {
      const text = (msgs[key]?.text ?? metaFor(key)?.defaultText ?? '').trim()
      const r = await generateOne(key, text)
      if (r.ok) results[key] = r.audio
      else errors[key] = r.error
    }

    const remaining = Math.max(0, pending.length - BATCH)
    return NextResponse.json({
      ok: Object.keys(errors).length === 0,
      generated: Object.keys(results),
      errors,
      // 🔴 כמה נותרו — בלי זה המסך אינו יודע שצריך לקרוא שוב,
      // והמשתמש היה רואה "נוצרו 12" וחושב שסיים.
      remaining,
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
