import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { uploadFileToYemot, yemotConfigured } from '@/lib/yemot'
import { generateSpeech } from '@/lib/elevenTts'
import { getIvrConfig, saveIvrConfig } from '@/lib/ivrBuilder'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// ─────────────────────────────────────────────────────────────────────────────
// יצירת קול נוירוני להודעת שלוחה — ElevenLabs → ימות.
//
// ⚠️ אותו דפוס בדיוק כמו yemot-maternity/generate-voice, כדי שהתנהגות
// הקול תהיה זהה בכל המערכת.
//
// ⚠️ הקבצים נשמרים בשלוחה ייעודית ולא מעורבבים עם קבצי החגים/יולדות:
// מחיקת שלוחה כאן לא תמחק קובץ ששלוחה אחרת משתמשת בו.
// ─────────────────────────────────────────────────────────────────────────────

/** השלוחה בימות שבה נשמרים קבצי הקול של הבונה. */
const IVR_EXT = process.env.YEMOT_FOLDER_IVR_FILES || '1'

/**
 * ⚠️ הודעה עם {משתנה} אינה כשירה לקול מוקלט: קובץ יחיד אינו יכול
 * לשרת ערכים משתנים, והמתקשר היה שומע את שם המשתנה כפי שהוא.
 */
const hasPlaceholder = (t: string) => /\{[^}]+\}/.test(t)

/** שם קובץ בטוח מתוך מזהה השלוחה. */
const safeName = (s: string) => String(s).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)

export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }
  if (!yemotConfigured()) {
    return NextResponse.json({ error: 'YEMOT_TOKEN אינו מוגדר בשרת' }, { status: 500 })
  }

  let body: { nodeId?: string; field?: 'prompt' | 'invalid'; text?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const nodeId = String(body.nodeId ?? '').trim()
  const field = body.field === 'invalid' ? 'invalid' : 'prompt'
  if (!nodeId) return NextResponse.json({ error: 'לא נבחרה שלוחה' }, { status: 400 })

  const cfg = await getIvrConfig()
  const node = cfg.nodes.find(n => n.id === nodeId)
  if (!node) return NextResponse.json({ error: 'השלוחה לא נמצאה' }, { status: 404 })

  // ⚠️ הטקסט מהבקשה גובר על השמור: המנהל מקליט את מה שהוא רואה על
  // המסך, גם אם טרם שמר אותו.
  const text = String(body.text ?? node[field]?.text ?? '').trim()
  if (!text) return NextResponse.json({ error: 'אין טקסט להקראה' }, { status: 400 })
  if (hasPlaceholder(text)) {
    return NextResponse.json(
      { error: 'ההודעה מכילה {משתנה} ואינה ניתנת להקלטה — קובץ יחיד אינו יכול לשרת ערכים משתנים' },
      { status: 400 },
    )
  }

  const speech = await generateSpeech(text)
  if (!speech.ok || !speech.audio) {
    return NextResponse.json({ error: speech.error ?? 'יצירת הקול נכשלה' }, { status: 502 })
  }

  const baseName = `ivr_${safeName(nodeId)}_${field}`
  const path = `ivr2:/${IVR_EXT}/${baseName}.mp3`
  const up = await uploadFileToYemot(
    path, new Blob([speech.audio as BlobPart], { type: 'audio/mpeg' }), `${baseName}.mp3`)
  if (!up.ok) {
    return NextResponse.json({ error: `העלאה לימות נכשלה: ${up.error}` }, { status: 502 })
  }

  // ── שמירת הפניה לקובץ במבנה ──
  // ⚠️ נשמר על עותק ולא במקום: כישלון שמירה חייב להשאיר את המבנה
  // הקודם שלם ולא מבנה חלקי.
  const next = {
    ...cfg,
    nodes: cfg.nodes.map(n =>
      n.id === nodeId
        ? { ...n, [field]: { text, file: baseName } }
        : n),
  }
  const saved = await saveIvrConfig(next)
  if (!saved.ok) {
    return NextResponse.json(
      { error: `הקול נוצר בימות אך שמירת ההגדרה נכשלה: ${saved.error}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, file: baseName })
}

/** DELETE — הסרת הקובץ וחזרה ל-TTS חי. */
export async function DELETE(request: NextRequest) {
  if (!(await requireStaff(['admin']))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }

  let body: { nodeId?: string; field?: 'prompt' | 'invalid' }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  const nodeId = String(body.nodeId ?? '').trim()
  const field = body.field === 'invalid' ? 'invalid' : 'prompt'
  if (!nodeId) return NextResponse.json({ error: 'לא נבחרה שלוחה' }, { status: 400 })

  const cfg = await getIvrConfig()
  // ⚠️ הקובץ עצמו נשאר בימות ורק ההפניה מוסרת: מחיקה משם היא בלתי
  // הפיכה, וקובץ יתום אינו מזיק.
  const next = {
    ...cfg,
    nodes: cfg.nodes.map(n =>
      n.id === nodeId && n[field]
        ? { ...n, [field]: { text: n[field]?.text ?? '', file: null } }
        : n),
  }
  const saved = await saveIvrConfig(next)
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
