// יצירת קול טבעי (ElevenLabs) להודעת הרישום + העלאה לימות ושמירת שם הקובץ.
// השיחה היוצאת תנגן את הקובץ אם הוגדרה תבנית קמפיין שמנגנת קובץ (YEMOT_ANNOUNCE_TEMPLATE_ID),
// אחרת תיפול-לאחור להקראת הטקסט (TTS).
import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { uploadFileToYemot, yemotConfigured } from '@/lib/yemot'
import { generateSpeech } from '@/lib/elevenTts'
import { getRegistrationCallText, setRegistrationCallAudio } from '@/lib/registrationCallMessage'

export const dynamic = 'force-dynamic'

// נתיב הקובץ בימות (השלוחה/תיקייה שאליה מועלה קול הודעת הרישום)
const REG_AUDIO_PATH = 'ivr2:/8/reg_announce.mp3'
const REG_AUDIO_NAME = 'reg_announce'

export async function POST() {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  if (!yemotConfigured()) return NextResponse.json({ error: 'YEMOT_TOKEN אינו מוגדר בשרת' }, { status: 500 })

  const text = await getRegistrationCallText()
  if (!text.trim()) return NextResponse.json({ error: 'אין טקסט ליצירה' }, { status: 400 })

  const speech = await generateSpeech(text)
  if (!speech.ok || !speech.audio) return NextResponse.json({ error: speech.error ?? 'יצירת הקול נכשלה' }, { status: 502 })

  const blob = new Blob([speech.audio], { type: 'audio/mpeg' })
  const up = await uploadFileToYemot(REG_AUDIO_PATH, blob, `${REG_AUDIO_NAME}.mp3`)
  if (!up.ok) return NextResponse.json({ error: `העלאה לימות נכשלה: ${up.error}` }, { status: 502 })

  const saved = await setRegistrationCallAudio(REG_AUDIO_NAME)
  if (!saved) return NextResponse.json({ error: 'הקול נוצר אך שמירת ההגדרה נכשלה' }, { status: 500 })

  return NextResponse.json({ ok: true, audio: REG_AUDIO_NAME })
}

// הסרת הקול הטבעי — חזרה להקראת טקסט (TTS)
export async function DELETE() {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const ok = await setRegistrationCallAudio(null)
  if (!ok) return NextResponse.json({ error: 'שגיאה בהסרה' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
