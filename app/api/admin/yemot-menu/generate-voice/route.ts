import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { uploadFileToYemot, deleteFileFromYemot, yemotConfigured } from '@/lib/yemot'
import { generateSpeech } from '@/lib/elevenTts'
import { setMainMenuMessageAudio, MAIN_MENU_MESSAGE_META, getMainMenuMessages } from '@/lib/yemotMainMenu'

export const dynamic = 'force-dynamic'

// שלוחת התפריט הראשי בימות — ראו הערת התיקיות ב-recording/route.ts.
const MENU_EXT = process.env.YEMOT_MENU_EXT || '1'

function metaFor(key: string) {
  return MAIN_MENU_MESSAGE_META.find((m) => m.key === key)
}

// ⚠️ קובץ קול יחיד אינו יכול לשרת ערכים משתנים, ולכן הודעה שמכילה {משתנה}
// אינה כשירה ליצירה — היא חייבת להישאר בהקראת טקסט.
const hasPlaceholder = (t: string) => /\{[^}]+\}/.test(t)

async function generateOne(key: string, text: string): Promise<{ ok: true; audio: string } | { ok: false; error: string }> {
  const speech = await generateSpeech(text)
  if (!speech.ok || !speech.audio) return { ok: false, error: speech.error ?? 'יצירת הקול נכשלה' }

  // 🔴 חותמת בשם הקובץ — ראו ההסבר המלא ב-yemot-holiday/generate-voice.
  // שם קבוע גרם לימות לנגן את ההקלטה הישנה אחרי כל עריכה, בלי שום סימן.
  // ⚠️ הקובץ הקודם נקרא לפני השמירה, אחרת שמו כבר נדרס ולא נדע מה למחוק.
  const prevAudio = (await getMainMenuMessages())[key]?.audio ?? null

  const baseName = `tts_${key}_${Date.now().toString(36)}`
  const path = `ivr2:/${MENU_EXT}/${baseName}.mp3`
  const blob = new Blob([speech.audio], { type: 'audio/mpeg' })
  const up = await uploadFileToYemot(path, blob, `${baseName}.mp3`)
  if (!up.ok) return { ok: false, error: `העלאה לימות נכשלה: ${up.error}` }

  const saved = await setMainMenuMessageAudio(key, baseName)
  if (!saved) return { ok: false, error: 'הקול נוצר אך שמירת ההגדרה נכשלה' }

  // ניקוי הקובץ הקודם — best-effort, אחרי השמירה. ראו yemot-holiday.
  if (prevAudio && prevAudio !== baseName) {
    const gone = await deleteFileFromYemot(`ivr2:/${MENU_EXT}/${prevAudio}.mp3`)
    if (!gone.ok) console.warn(`[yemot-menu] מחיקת הקובץ הקודם נכשלה (${prevAudio}): ${gone.error}`)
  }
  return { ok: true, audio: baseName }
}

// POST — יצירת קול נוירוני.
//   { key, text }  → הודעה אחת
//   { all: true }  → כל ההודעות הכשירות
export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  if (!yemotConfigured()) return NextResponse.json({ error: 'YEMOT_TOKEN אינו מוגדר בשרת' }, { status: 500 })

  const body = await request.json().catch(() => null) as { key?: string; text?: string; all?: boolean } | null
  if (!body) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  if (body.all) {
    const msgs = await getMainMenuMessages()
    const results: Record<string, string> = {}
    const errors: Record<string, string> = {}
    for (const m of MAIN_MENU_MESSAGE_META.filter(x => x.allowAudio)) {
      const text = (msgs[m.key]?.text ?? m.defaultText ?? '').trim()
      // ⚠️ הודעה ריקה היא בחירה מפורשת ("דלג") — מדלגים בשקט ולא מדווחים ככשל.
      if (!text || hasPlaceholder(text)) continue
      const r = await generateOne(m.key, text)
      if (r.ok) results[m.key] = r.audio
      else errors[m.key] = r.error
    }
    return NextResponse.json({
      ok: Object.keys(errors).length === 0,
      generated: Object.keys(results),
      errors,
      messages: await getMainMenuMessages(),
    })
  }

  const key = String(body.key ?? '').trim()
  const meta = metaFor(key)
  if (!meta) return NextResponse.json({ error: 'מפתח הודעה לא מוכר' }, { status: 400 })

  const text = String(body.text ?? '').trim() || (await getMainMenuMessages())[key]?.text || meta.defaultText || ''
  if (!text) return NextResponse.json({ error: 'אין טקסט ליצירה' }, { status: 400 })
  if (!meta.allowAudio || hasPlaceholder(text)) {
    return NextResponse.json({ error: 'לא ניתן לייצר קול — הסר/י את המשתנה {...} מהטקסט תחילה' }, { status: 400 })
  }

  const r = await generateOne(key, text)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 })

  return NextResponse.json({ ok: true, audio: r.audio, ext: MENU_EXT, messages: await getMainMenuMessages() })
}
