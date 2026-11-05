// הגשת קובצי הקול של ההודעות הקבועות לטכנוליין. ציבורי בכוונה: אלה הודעות המרכזיה
// עצמן (לא נתוני אנשים), והשם הוא hash. ⚠️ אין middleware בפרויקט.
import { NextResponse } from 'next/server'
import { loadVoiceFile } from '@/lib/telephony/voiceFiles'

export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params
  const m = /^([a-f0-9]{16})\.wav$/.exec(name)
  if (!m) return new NextResponse(null, { status: 404 })
  const buf = await loadVoiceFile(m[1])
  if (!buf) return new NextResponse(null, { status: 404 })
  return new NextResponse(buf, {
    headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}
