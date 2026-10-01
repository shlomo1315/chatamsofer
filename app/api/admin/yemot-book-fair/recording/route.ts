import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { uploadFileToYemot, yemotConfigured } from '@/lib/yemot'
import {
  setBookFairMessageAudio, BOOK_FAIR_MESSAGE_META, getBookFairMessages,
} from '@/lib/yemotBookFairMessages'

export const dynamic = 'force-dynamic'

// שלוחת יריד הספרים בימות — שם נשמרות ההקלטות.
// ⚠️ ניתן לשינוי בסביבה: מספר השלוחה נקבע בממשק ימות ואינו תחת שליטתנו.
const BOOK_FAIR_EXT = process.env.YEMOT_BOOK_FAIR_EXT || '9'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/m4a', 'audio/x-m4a']

function metaFor(key: string) {
  return BOOK_FAIR_MESSAGE_META.find((m) => m.key === key)
}

// POST — העלאת הקלטה אנושית להודעה (multipart: key, file)
export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  if (!yemotConfigured()) return NextResponse.json({ error: 'YEMOT_TOKEN אינו מוגדר בשרת — לא ניתן להעלות הקלטה' }, { status: 500 })

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  const key = String(form.get('key') ?? '').trim()
  const file = form.get('file')
  const meta = metaFor(key)
  if (!meta) return NextResponse.json({ error: 'מפתח הודעה לא מוכר' }, { status: 400 })
  if (!meta.allowAudio) return NextResponse.json({ error: 'להודעה זו אין אפשרות הקלטה (הודעה דינמית)' }, { status: 400 })
  if (!(file instanceof Blob) || file.size === 0) return NextResponse.json({ error: 'לא צורף קובץ' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 10MB)' }, { status: 400 })
  const fileType = (file as File).type || ''
  if (fileType && !ALLOWED.includes(fileType)) return NextResponse.json({ error: `סוג קובץ לא נתמך (${fileType})` }, { status: 400 })

  const baseName = `rec_${key}`
  const path = `ivr2:/${BOOK_FAIR_EXT}/${baseName}.wav`
  const up = await uploadFileToYemot(path, file, `${baseName}.wav`)
  if (!up.ok) return NextResponse.json({ error: `העלאה לימות נכשלה: ${up.error}` }, { status: 502 })

  // שמירת שם הקובץ (יחסי לשלוחה) — השלוחה תשמיע f-<baseName>
  const saved = await setBookFairMessageAudio(key, baseName)
  if (!saved) return NextResponse.json({ error: 'הקובץ הועלה אך שמירת ההגדרה נכשלה' }, { status: 500 })

  return NextResponse.json({ ok: true, audio: baseName, messages: await getBookFairMessages() })
}

// DELETE — הסרת ההקלטה (חזרה ל-TTS). ?key=...
// ⚠️ הקובץ נשאר בימות אך אינו בשימוש — מחיקה שלו אינה נדרשת כדי
// שהטקסט יחזור להישמע, ומחיקה כושלת לא תחסום את החזרה ל-TTS.
export async function DELETE(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const key = request.nextUrl.searchParams.get('key')?.trim() ?? ''
  if (!metaFor(key)) return NextResponse.json({ error: 'מפתח הודעה לא מוכר' }, { status: 400 })
  const ok = await setBookFairMessageAudio(key, null)
  if (!ok) return NextResponse.json({ error: 'שגיאה בהסרה' }, { status: 500 })
  return NextResponse.json({ ok: true, messages: await getBookFairMessages() })
}
