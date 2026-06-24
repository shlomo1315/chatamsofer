import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { uploadFileToYemot, yemotConfigured } from '@/lib/yemot'
import { generateSpeech } from '@/lib/elevenTts'
import { setMaternityMessageAudio, MATERNITY_MESSAGE_META, getMaternityMessages } from '@/lib/yemotMaternityMessages'

export const dynamic = 'force-dynamic'

// שלוחת היולדות בימות — שם נשמרים קבצי הקול
const MATERNITY_EXT = '7'

function metaFor(key: string) {
  return MATERNITY_MESSAGE_META.find((m) => m.key === key)
}

// הודעה כשירה ליצירת קול נוירוני: ניתנת להקלטה ואינה דינמית (בלי {משתנים}),
// כי קובץ יחיד לא יכול לשרת ערכים משתנים.
function eligible(key: string): boolean {
  const m = metaFor(key)
  return !!m && m.allowAudio && !(m.placeholders && m.placeholders.length)
}

// יצירת קול נוירוני להודעה אחת — מייצר ב-ElevenLabs ומעלה לימות
async function generateOne(key: string, text: string): Promise<{ ok: true; audio: string } | { ok: false; error: string }> {
  const speech = await generateSpeech(text)
  if (!speech.ok || !speech.audio) return { ok: false, error: speech.error ?? 'יצירת הקול נכשלה' }

  const baseName = `tts_${key}`
  const path = `ivr2:/${MATERNITY_EXT}/${baseName}.mp3`
  const blob = new Blob([speech.audio], { type: 'audio/mpeg' })
  const up = await uploadFileToYemot(path, blob, `${baseName}.mp3`)
  if (!up.ok) return { ok: false, error: `העלאה לימות נכשלה: ${up.error}` }

  const saved = await setMaternityMessageAudio(key, baseName)
  if (!saved) return { ok: false, error: 'הקול נוצר אך שמירת ההגדרה נכשלה' }
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
    const msgs = await getMaternityMessages()
    const keys = MATERNITY_MESSAGE_META.filter((m) => eligible(m.key)).map((m) => m.key)
    const results: Record<string, string> = {}
    const errors: Record<string, string> = {}
    for (const key of keys) {
      const text = (msgs[key]?.text ?? metaFor(key)?.defaultText ?? '').trim()
      if (!text) { errors[key] = 'אין טקסט'; continue }
      const r = await generateOne(key, text)
      if (r.ok) results[key] = r.audio
      else errors[key] = r.error
    }
    return NextResponse.json({
      ok: Object.keys(errors).length === 0,
      generated: Object.keys(results),
      errors,
      messages: await getMaternityMessages(),
    })
  }

  // יצירה להודעה בודדת
  const key = String(body.key ?? '').trim()
  if (!metaFor(key)) return NextResponse.json({ error: 'מפתח הודעה לא מוכר' }, { status: 400 })
  if (!eligible(key)) return NextResponse.json({ error: 'להודעה זו לא ניתן לייצר קול (הודעה דינמית או ללא אפשרות אודיו)' }, { status: 400 })

  const text = String(body.text ?? '').trim() || (await getMaternityMessages())[key]?.text || metaFor(key)?.defaultText || ''
  if (!text) return NextResponse.json({ error: 'אין טקסט ליצירה' }, { status: 400 })

  const r = await generateOne(key, text)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 })

  return NextResponse.json({ ok: true, audio: r.audio, messages: await getMaternityMessages() })
}
