import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { systemStatus, applyTree, maskedUrls, uploadRecording, callConfigured } from '@/lib/telephony/admin'
import {
  BOOK_FAIR_MESSAGE_META, BOOK_FAIR_MSG_KEY, TECHNOLINE_YERID_MSG_KEY,
  getBookFairMessages, saveBookFairMessages, setBookFairMessageAudio, type BookFairMessages,
} from '@/lib/bookFairPhoneMessages'

// המערכת הטלפונית של יריד הספרים בטכנוליין: מצב, שלוחה, נוסחים והקלטות.
// 🔴 עובד רק מול מערכת yerid ומפתח הנוסחים שלה. אין כאן שום קריאה למרכזיה.
export const dynamic = 'force-dynamic'

const SITE = () => (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })
const META = new Map(BOOK_FAIR_MESSAGE_META.map((m) => [m.key, m]))

async function snapshot() {
  return {
    status: systemStatus('yerid'),
    urls: maskedUrls(SITE(), 'yerid'),
    callsReady: callConfigured('yerid'),
    messages: await getBookFairMessages(TECHNOLINE_YERID_MSG_KEY),
    meta: BOOK_FAIR_MESSAGE_META,
  }
}

/** רק טקסטים: הקלטות מנוהלות בהעלאה ובהסרה, כדי ששמירה לא תדרוס קובץ שהועלה. */
function textsOnly(input: BookFairMessages): BookFairMessages {
  const out: BookFairMessages = {}
  for (const [key, m] of Object.entries(input)) {
    if (META.has(key) && typeof m?.text === 'string') out[key] = { text: m.text }
  }
  return out
}

/** הודעה דינמית שאיבדה את המשתנה שלה מוקראת כשקר. נדחה במפורש. */
function placeholderError(input: BookFairMessages): string | null {
  for (const meta of BOOK_FAIR_MESSAGE_META) {
    const text = input[meta.key]?.text
    if (!text || !meta.placeholders?.length) continue
    const missing = meta.placeholders.filter((p) => !text.includes(`{${p}}`))
    if (missing.length) return `"${meta.label}" חייב לכלול ${missing.map((p) => `{${p}}`).join(' ו')}`
  }
  return null
}

export async function GET() {
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()
  return NextResponse.json(await snapshot(), { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  if (!(await requirePermission('book_fair', 'edit'))) return forbidden()

  if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    const f = await req.formData()
    const key = String(f.get('key') ?? '')
    const file = f.get('file')
    if (!META.get(key)?.allowAudio) return bad('להודעה הזו אי אפשר להעלות הקלטה')
    if (!(file instanceof File)) return bad('לא נבחר קובץ')
    if (!/\.(mp3|wav)$/i.test(file.name)) return bad('יש להעלות קובץ mp3 או wav')
    const name = `rec_${key}_${Date.now()}`
    const res = await uploadRecording('yerid', String(f.get('extensionId') ?? ''), name, await file.arrayBuffer(), file.name)
    if (!res.ok) return bad(res.error, 502)
    if (!(await setBookFairMessageAudio(key, name, TECHNOLINE_YERID_MSG_KEY))) return bad('ההקלטה הועלתה אך לא נשמרה', 500)
    return NextResponse.json(await snapshot())
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return bad('בקשה לא תקינה')

  if (body.action === 'messages') {
    if (!body.messages || typeof body.messages !== 'object') return bad('חסרות הודעות')
    const input = textsOnly(body.messages as BookFairMessages)
    const err = placeholderError(input)
    if (err) return bad(err)
    if (!(await saveBookFairMessages(input, TECHNOLINE_YERID_MSG_KEY))) return bad('שגיאה בשמירה', 500)
    return NextResponse.json(await snapshot())
  }
  if (body.action === 'import') {
    // העתקת הנוסחים הכתובים מהמסד בלבד. הקלטות של המרכזיה לא קיימות בטכנוליין ולכן לא מועתקות.
    const old = await getBookFairMessages(BOOK_FAIR_MSG_KEY)
    if (!(await saveBookFairMessages(textsOnly(old), TECHNOLINE_YERID_MSG_KEY))) return bad('שגיאה בהעתקה', 500)
    return NextResponse.json(await snapshot())
  }
  if (body.action === 'clear-audio') {
    const key = String(body.key ?? '')
    if (!META.get(key)?.allowAudio) return bad('הודעה לא מוכרת')
    if (!(await setBookFairMessageAudio(key, null, TECHNOLINE_YERID_MSG_KEY))) return bad('שגיאה בהסרה', 500)
    return NextResponse.json(await snapshot())
  }
  if (body.action === 'tree') {
    const rootId = String(body.rootId ?? '')
    if (!/^\d+$/.test(rootId)) return bad('מזהה שלוחה לא תקין')
    return NextResponse.json({ steps: await applyTree('yerid', rootId, SITE()) })
  }
  return bad('פעולה לא מוכרת')
}
