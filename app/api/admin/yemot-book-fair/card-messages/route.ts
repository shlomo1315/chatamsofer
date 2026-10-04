import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import {
  uploadFileToYemot, deleteFileFromYemot, downloadFileFromYemot,
  bookFairPath, yemotConfigured,
} from '@/lib/yemot'
import { generateSpeech } from '@/lib/elevenTts'

// ─────────────────────────────────────────────────────────────────────────────
// הקלטות ההנחיות של הסליקה — "הקישו מספר כרטיס", "תוקף", וכו'.
//
// 🔴 אלה **הודעות מערכת של ימות** (M1422 וכו'), ולא הודעות שלנו:
// ברגע ששולחים credit_card= ימות משתלטת על השיחה ומקריאה אותן בקול
// שלה. דריסתן נעשית בדיוק אחת — קובץ בשם ההודעה בתיקיית השלוחה.
//
// ⚠️ השם הוא M1422 בדיוק (באות גדולה, בלי סיומת בשם הלוגי) — זה מה
// שימות מחפשת. שם אחר פשוט לא ייקרא, בלי שום שגיאה: ימות תמשיך
// להקריא את הברירת מחדל והמנהל יחשוב שההעלאה נכשלה.
//
// ⚠️ רק ההנחיות נדרסות. הספרות שהמתקשר מקיש אינן עוברות דרכנו אף
// פעם — זו דרישת PCI והיא אינה מושפעת מכאן.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * הודעות הסליקה שניתן לדרוס — הקודים והנוסחים מתיעוד ימות.
 *
 * ⚠️ רק ההודעות שהמתקשר באמת שומע בזרימה תקינה, ועוד שלוש שגיאות
 * שכיחות. ימות מכירה עשרות קודים נוספים (תשלומים, כרטיס שמור,
 * קופונים) שאינם רלוונטיים ליריד — תשלום יחיד, בלי טוקנים.
 */
export const CARD_MESSAGES = [
  // ── הזרימה הרגילה ──
  { code: 'M1422', label: 'הקשת מספר הכרטיס', text: 'הקישו מספר כרטיס משמאל לימין, סולמית לסיום' },
  { code: 'M1424', label: 'הקשת תוקף', text: 'הקישו את תוקף הכרטיס בארבע ספרות' },
  { code: 'M1428', label: 'הקשת שלוש ספרות (CVV)', text: 'הקישו את 3 הספרות בגב הכרטיס' },
  { code: 'M1429', label: 'הקשת תעודת זהות', text: 'הקישו את מספר תעודת הזהות של בעל הכרטיס' },
  { code: 'M1430', label: 'העסקה הצליחה', text: 'העיסקה התקבלה בהצלחה' },
  { code: 'M1431', label: 'מספר אישור', text: 'אישור מספר' },
  // ── שגיאות שהמתקשר עלול לשמוע ──
  { code: 'M1423', label: 'תוקף שגוי', text: 'תוקף הכרטיס שגוי — 4 ספרות (חודש ושנה)' },
  { code: 'M1426', label: 'העסקה נדחתה', text: 'העיסקה נדחתה — סטטוס סירוב' },
  { code: 'M1427', label: 'לנסות כרטיס אחר', text: 'נסו שנית עם כרטיס אחר' },
] as const

const CODES = new Set(CARD_MESSAGES.map(m => m.code))
const MAX_BYTES = 10 * 1024 * 1024

/** הסיומות שימות עשויה לשמור בהן. ⚠️ convertAudio ממירה ל-wav. */
const EXTS = ['wav', 'mp3'] as const
export const maxDuration = 300

/** GET — אילו הודעות כבר הוקלטו. */
export async function GET() {
  if (!(await requireStaff(['admin']))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }

  const recorded: Record<string, boolean> = {}
  for (const m of CARD_MESSAGES) {
    let found = false
    for (const ext of EXTS) {
      const f = await downloadFileFromYemot(bookFairPath(`${m.code}.${ext}`), 'bookFair')
      if (f.ok && f.data) { found = true; break }
    }
    recorded[m.code] = found
  }

  return NextResponse.json({
    messages: CARD_MESSAGES.map(m => ({ ...m, recorded: recorded[m.code] })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

/**
 * POST — העלאת הקלטה (multipart: code, file) או יצירת קול טבעי
 * (JSON: { code } ליצירה אחת, { all: true } לכולן).
 */
export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }
  if (!yemotConfigured('bookFair')) {
    return NextResponse.json({ error: 'טוקן ימות אינו מוגדר' }, { status: 500 })
  }

  // ── יצירת קול טבעי ──
  //
  // 🔴 אותו קול בדיוק כמו בשאר השלוחה: ElevenLabs מייצר מהנוסח,
  // והקובץ עולה בשם ההודעה של ימות (M1422). כך המתקשר שומע קול אחד
  // לכל אורך השיחה, גם בשלב הסליקה שמנוהל בצד ימות.
  const ct = request.headers.get('content-type') ?? ''
  if (ct.includes('application/json')) {
    const body = await request.json().catch(() => null) as
      { code?: string; all?: boolean; text?: string } | null
    if (!body) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

    const targets = body.all
      ? CARD_MESSAGES.map(m => ({ code: m.code, text: m.text }))
      : CARD_MESSAGES
        .filter(m => m.code === body.code)
        .map(m => ({ code: m.code, text: (body.text ?? '').trim() || m.text }))

    if (!targets.length) {
      return NextResponse.json({ error: 'קוד הודעה לא מוכר' }, { status: 400 })
    }

    const done: string[] = []
    const errors: Record<string, string> = {}
    for (const tgt of targets) {
      const speech = await generateSpeech(tgt.text)
      if (!speech.ok || !speech.audio) {
        errors[tgt.code] = speech.error ?? 'יצירת הקול נכשלה'
        continue
      }
      // ⚠️ MP3 — ימות ממירה בעצמה (convertAudio=1). ראו ההערה
      // ב-generate-voice: המרה מקדימה ל-PCM היא מה שהפיל את השלוחה.
      const up = await uploadFileToYemot(
        bookFairPath(`${tgt.code}.mp3`),
        new Blob([speech.audio], { type: 'audio/mpeg' }),
        `${tgt.code}.mp3`,
        'bookFair',
      )
      if (up.ok) done.push(tgt.code)
      else errors[tgt.code] = up.error ?? 'ההעלאה נכשלה'
    }

    console.log(`[card-messages] נוצרו ${done.length} הקלטות קול טבעי`)
    return NextResponse.json({
      ok: Object.keys(errors).length === 0,
      generated: done,
      errors,
    })
  }

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  const code = String(form.get('code') ?? '').trim()
  const file = form.get('file')
  // 🔴 רשימה סגורה: שם חופשי היה מאפשר לכתוב כל קובץ לשלוחה.
  if (!CODES.has(code as typeof CARD_MESSAGES[number]['code'])) {
    return NextResponse.json({ error: 'קוד הודעה לא מוכר' }, { status: 400 })
  }
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: 'לא צורף קובץ' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 10MB)' }, { status: 400 })
  }

  // ⚠️ שם קבוע ולא חותמת זמן — בניגוד לכל שאר ההקלטות: ימות מחפשת
  // בדיוק את M1422, ושם עם חותמת לא ייקרא כלל.
  const up = await uploadFileToYemot(
    bookFairPath(`${code}.wav`), file, `${code}.wav`, 'bookFair',
  )
  if (!up.ok) {
    console.error(`[card-messages] העלאת ${code} נכשלה:`, up.error)
    return NextResponse.json({ error: `העלאה לימות נכשלה: ${up.error}` }, { status: 502 })
  }

  console.log(`[card-messages] ✅ ${code} הועלתה`)
  return NextResponse.json({ ok: true, code })
}

/** DELETE — הסרה, חזרה להודעת ברירת המחדל של ימות. ?code=M1422 */
export async function DELETE(request: NextRequest) {
  if (!(await requireStaff(['admin']))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }
  const code = request.nextUrl.searchParams.get('code')?.trim() ?? ''
  if (!CODES.has(code as typeof CARD_MESSAGES[number]['code'])) {
    return NextResponse.json({ error: 'קוד הודעה לא מוכר' }, { status: 400 })
  }

  for (const ext of EXTS) {
    await deleteFileFromYemot(bookFairPath(`${code}.${ext}`), 'bookFair')
  }
  return NextResponse.json({ ok: true })
}
