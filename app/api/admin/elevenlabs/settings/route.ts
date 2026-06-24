import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { getElevenStatus, saveElevenConfig, listVoices } from '@/lib/elevenTts'

export const dynamic = 'force-dynamic'

// GET — סטטוס (האם יש מפתח, קול ומודל נבחרים) + רשימת הקולות הזמינים בחשבון
export async function GET() {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const status = await getElevenStatus()
  const voicesRes = status.hasKey ? await listVoices() : { ok: false, voices: [] as never[] }
  return NextResponse.json({
    hasKey: status.hasKey,
    voiceId: status.voiceId,
    modelId: status.modelId,
    voices: voicesRes.ok ? voicesRes.voices : [],
    voicesError: voicesRes.ok ? null : (voicesRes as { error?: string }).error ?? null,
  })
}

// POST — שמירת מפתח / קול / מודל. apiKey ריק = לא משנים את הקיים.
export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const body = await request.json().catch(() => null) as { apiKey?: string; voiceId?: string; modelId?: string } | null
  if (!body) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  const ok = await saveElevenConfig({ apiKey: body.apiKey, voiceId: body.voiceId, modelId: body.modelId })
  if (!ok) return NextResponse.json({ error: 'שמירת ההגדרות נכשלה' }, { status: 500 })

  const status = await getElevenStatus()
  const voicesRes = status.hasKey ? await listVoices() : { ok: false, voices: [] as never[] }
  return NextResponse.json({
    ok: true,
    hasKey: status.hasKey,
    voiceId: status.voiceId,
    modelId: status.modelId,
    voices: voicesRes.ok ? voicesRes.voices : [],
    voicesError: voicesRes.ok ? null : (voicesRes as { error?: string }).error ?? null,
  })
}
