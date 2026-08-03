import { NextResponse } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { getNedarimCreds, NEDARIM_URL } from '@/lib/nedarim'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// אבחון קריאה-בלבד: מציג את התגובה הגולמית של GetClient_Table מנדרים —
// כל המפתחות ברמה העליונה, Total, מספר השורות שחזרו בפועל, ומפתחות שורה
// לדוגמה. נבנה כדי לפצח למה getClientsTable מחזיר "משפחה אחת" בעוד שקיימות
// רבות: אם המשפחות יושבות תחת מפתח שאינו 'data', findClientByZeout סורק
// רשימה חלקית, לא מוצא, ומכריח יצירת כפילות בכל אישור לידה.
// לא מבצע שום כתיבה.
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ מנהל בלבד: הנקודה מחזירה את טבלת המשפחות המלאה מנדרים (שמות, ת"ז,
// כרטיסים). ההגדרות של נדרים כבר היו מוגנות למנהל, והנתונים עצמם לא — חוסר
// עקביות שהותיר את המידע הרגיש פתוח לכל תפקיד צוות.
export async function GET() {
  if (!(await requireStaff(['admin']))) return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  const creds = await getNedarimCreds()
  if (!creds) return NextResponse.json({ error: 'נדרים קארד אינו מוגדר' }, { status: 400 })

  const form = new URLSearchParams()
  form.set('Action', 'GetClient_Table')
  form.set('MosadId', creds.mosadId)
  form.set('MosadNumber', creds.mosadId)
  form.set('ApiPassword', creds.apiPassword)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)
  let text: string
  try {
    const res = await fetch(NEDARIM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: controller.signal,
      cache: 'no-store',
    })
    text = await res.text()
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  } finally { clearTimeout(timer) }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any
  try { parsed = JSON.parse(text) } catch {
    return NextResponse.json({ note: 'התגובה אינה JSON', rawSnippet: text.slice(0, 2000) })
  }

  // ⚠️ סורקים כל מפתח ברמה העליונה: איזה מהם מערך, וכמה פריטים בו — כך
  // נזהה אם המשפחות יושבות תחת 'data' או תחת מפתח אחר (List/Clients/וכו').
  const topKeys: Record<string, unknown> = {}
  const arrays: Record<string, number> = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (Array.isArray(v)) {
      arrays[k] = v.length
      topKeys[k] = `[מערך של ${v.length} פריטים]`
    } else if (v === null || typeof v !== 'object') {
      topKeys[k] = v
    } else {
      topKeys[k] = '[אובייקט]'
    }
  }

  // מפתחות של שורה לדוגמה — מכל מערך שנמצא — כדי לזהות איפה יושב Zeout/ClientId
  const sampleRowKeys: Record<string, string[]> = {}
  const sampleRow: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(parsed)) {
    if (Array.isArray(v) && v.length && v[0] && typeof v[0] === 'object') {
      sampleRowKeys[k] = Object.keys(v[0] as object)
      if (!Object.keys(sampleRow).length) Object.assign(sampleRow, v[0])
    }
  }

  return NextResponse.json({
    Result: parsed.Result,
    Total: parsed.Total,
    topKeys,
    arraysFound: arrays,        // ← הלב: איזה מערך יש וכמה פריטים בכל אחד
    sampleRowKeys,              // ← אילו שדות בכל שורה (לזהות Zeout/ClientId)
    sampleRow,                  // ← שורה אחת מלאה לדוגמה
    dataLength: Array.isArray(parsed.data) ? parsed.data.length : '(אין data מערך)',
  }, { headers: { 'Cache-Control': 'no-store' } })
}
