import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { generateSpeech } from '@/lib/elevenTts'

export const dynamic = 'force-dynamic'

const MAX_CHARS = 600 // השמעה מקדימה — מספיק להאזנה, חוסך עלות

// POST { text, voiceId? } — מייצר אודיו ומחזיר אותו ישירות (audio/mpeg) ללא העלאה לימות
export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })

  const body = await request.json().catch(() => null) as { text?: string; voiceId?: string } | null
  if (!body) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  const text = String(body.text ?? '').trim().slice(0, MAX_CHARS)
  if (!text) return NextResponse.json({ error: 'אין טקסט להשמעה' }, { status: 400 })

  const speech = await generateSpeech(text, { voiceId: body.voiceId })
  if (!speech.ok || !speech.audio) return NextResponse.json({ error: speech.error ?? 'יצירת הקול נכשלה' }, { status: 502 })

  return new NextResponse(speech.audio, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
  })
}
