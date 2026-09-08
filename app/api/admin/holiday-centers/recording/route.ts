import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { getServiceClient } from '@/lib/apiAuth'
import { uploadFileToYemot, yemotConfigured } from '@/lib/yemot'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// הקלטה אנושית לפרטי מוקד — שם, כתובת, ימים ושעות.
//
// ⚠️ אותה שלוחה שבה יושבות שאר הקלטות החגים (YEMOT_HOLIDAY_EXT), כדי
// שקובץ של מוקד לא ידרוס הקלטה של שלוחת היולדות ולהיפך.
//
// 🔴 שם הקובץ כולל חותמת זמן. ימות ממטמנת לפי שם הקובץ, ושם קבוע
// (ctr_<id>) היה משמיע את ההקלטה הישנה לנצח — בלי שום סימן שמשהו
// לא התעדכן, וזו תקלה שאי אפשר לאבחן מהצד השני של הקו.
// ─────────────────────────────────────────────────────────────────────────────

const HOLIDAY_EXT = process.env.YEMOT_HOLIDAY_EXT || '8'
const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave',
  'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
]

// POST — העלאת הקלטה למוקד (multipart: center_id, file)
export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }
  if (!yemotConfigured()) {
    return NextResponse.json({ error: 'YEMOT_TOKEN אינו מוגדר בשרת — לא ניתן להעלות הקלטה' }, { status: 500 })
  }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  const centerId = String(form.get('center_id') ?? '').trim()
  const file = form.get('file')
  if (!centerId) return NextResponse.json({ error: 'חסר מזהה מוקד' }, { status: 400 })
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: 'לא צורף קובץ' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 10MB)' }, { status: 400 })
  }
  const fileType = (file as File).type || ''
  if (fileType && !ALLOWED.includes(fileType)) {
    return NextResponse.json({ error: `סוג קובץ לא נתמך (${fileType})` }, { status: 400 })
  }

  // ⚠️ המוקד חייב להתקיים — אחרת הקובץ עולה לימות ונשאר יתום.
  const { data: exists } = await db.from('holiday_centers')
    .select('id').eq('id', centerId).maybeSingle()
  if (!exists) return NextResponse.json({ error: 'המוקד לא נמצא' }, { status: 404 })

  // 🔴 חותמת זמן בשם — ראו ההערה למעלה.
  const baseName = `ctr_${centerId.replace(/-/g, '').slice(0, 12)}_${Date.now()}`
  const path = `ivr2:/${HOLIDAY_EXT}/${baseName}.wav`
  const up = await uploadFileToYemot(path, file, `${baseName}.wav`)
  if (!up.ok) {
    return NextResponse.json({ error: `העלאה לימות נכשלה: ${up.error}` }, { status: 502 })
  }

  const { error } = await db.from('holiday_centers')
    .update({ audio_file: baseName }).eq('id', centerId)
  if (error) {
    return NextResponse.json({ error: 'הקובץ הועלה אך שמירת ההגדרה נכשלה' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, audio_file: baseName })
}

// DELETE — הסרת ההקלטה (חזרה להקראה מהשדות). ?center_id=...
//
// ⚠️ הקובץ נשאר בימות ואינו נמחק: מחיקה מרחוק שנכשלת באמצע הייתה
// מותירה הגדרה שמצביעה על קובץ שאינו קיים — ואז לא נשמע דבר.
export async function DELETE(request: NextRequest) {
  if (!(await requireStaff(['admin']))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const centerId = request.nextUrl.searchParams.get('center_id')?.trim() ?? ''
  if (!centerId) return NextResponse.json({ error: 'חסר מזהה מוקד' }, { status: 400 })

  const { error } = await db.from('holiday_centers')
    .update({ audio_file: null }).eq('id', centerId)
  if (error) return NextResponse.json({ error: 'שגיאה בהסרה' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
