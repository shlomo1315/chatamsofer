import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { syncMainVoice } from '@/lib/telephony/voiceFiles'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// יוצר בקול של שלמה את כל ההודעות הקבועות שעדיין אין להן קובץ (אחרי עריכת נוסח).
export async function POST() {
  if (!(await requireStaff(['admin']))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }
  return NextResponse.json(await syncMainVoice())
}
