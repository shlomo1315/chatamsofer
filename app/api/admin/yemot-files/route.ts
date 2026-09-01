import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { deleteFileFromYemot } from '@/lib/yemot'
import { getHolidayMessages } from '@/lib/yemotHolidayMessages'
import { getMaternityMessages } from '@/lib/yemotMaternityMessages'
import { getMainMenuMessages } from '@/lib/yemotMainMenu'

export const dynamic = 'force-dynamic'

const API = 'https://www.call2all.co.il/ym/api'

// ─────────────────────────────────────────────────────────────────────────────
// מה באמת יושב בתיקיות השמע של ימות.
//
// 🔴 למה זה קיים: ההגדרות שלנו אומרות איזה קובץ *אמור* להתנגן, אבל אף
// מסך לא הראה מה קיים שם בפועל. קובץ שהועלה ולא שויך, או שיוך שמצביע
// על קובץ שנמחק — שניהם בלתי נראים, והתסמין היחיד הוא הודעה שלא
// נשמעת או שנשמעת ישנה.
//
// ⚠️ שמות הקבצים כוללים חותמת זמן (כדי לעקוף את מטמון ימות), ולכן כל
// יצירה מחדש משאירה את הקודם. בלי ניקוי התיקייה מתמלאת בעשרות הקלטות
// נטושות שאי אפשר להבחין בינן לבין הפעילה.
//
// ⚠️ 🔴 תיקייה 1 משותפת לתפריט הראשי ולבונה השלוחות (YEMOT_MENU_EXT
// ו-YEMOT_FOLDER_IVR_FILES שניהם '1'). לכן קובץ ivr_* בתיקייה 1 אינו
// יתום גם אם אינו מוכר לתפריט — הוא שייך לבונה. ההבחנה כאן היא לפי
// התחילית, ולא לפי התיקייה בלבד.
// ─────────────────────────────────────────────────────────────────────────────

const FOLDERS = {
  menu: process.env.YEMOT_MENU_EXT || '1',
  holiday: process.env.YEMOT_HOLIDAY_EXT || '8',
  maternity: '7',
} as const

type Scope = keyof typeof FOLDERS

async function listDir(token: string, folder: string) {
  const url = `${API}/GetIVR2Dir?token=${encodeURIComponent(token)}`
    + `&path=${encodeURIComponent(`ivr2:/${folder}`)}`
  const res = await fetch(url, { cache: 'no-store' })
  const json = await res.json().catch(() => null) as { files?: unknown } | null
  const raw = Array.isArray(json?.files) ? json.files : []
  // ⚠️ ימות מחזירה מבנה שאינו מתועד באופן יציב — לוקחים רק את השם,
  // ומתעלמים בשקט מרשומה שאין בה שם במקום להפיל את המסך.
  return raw
    .map(f => {
      if (typeof f === 'string') return f
      const o = f as { name?: unknown; fileName?: unknown }
      return String(o.name ?? o.fileName ?? '')
    })
    .filter(Boolean)
}

/** השיוכים הפעילים בשלוחה — שם הקובץ (בלי סיומת) → שם ההודעה. */
async function activeAudio(scope: Scope): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const put = (msgs: Record<string, { audio?: string | null }>) => {
    for (const [key, m] of Object.entries(msgs)) {
      if (m?.audio) out[String(m.audio)] = key
    }
  }
  if (scope === 'holiday') put(await getHolidayMessages())
  else if (scope === 'maternity') put(await getMaternityMessages())
  else put(await getMainMenuMessages())
  return out
}

export async function GET(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return unauthorized()

  const token = process.env.YEMOT_TOKEN
  if (!token) return NextResponse.json({ error: 'YEMOT_TOKEN אינו מוגדר בשרת' }, { status: 500 })

  const scope = (request.nextUrl.searchParams.get('scope') ?? 'holiday') as Scope
  if (!(scope in FOLDERS)) return NextResponse.json({ error: 'שלוחה לא מוכרת' }, { status: 400 })

  const folder = FOLDERS[scope]
  const [names, active] = await Promise.all([listDir(token, folder), activeAudio(scope)])

  const files = names.map(name => {
    const base = name.replace(/\.(mp3|wav)$/i, '')
    const linkedTo = active[base] ?? null
    // ⚠️ קובץ שאינו שלנו (ivr_* של בונה השלוחות, ext.ini, הקלטות ידניות
    // ישנות) אינו מסומן כיתום: מחיקתו הייתה משתקת שלוחה שאיננו מנהלים.
    const ours = /^tts_/.test(base)
    return {
      name, base, linkedTo,
      kind: /^tts_/.test(base) ? 'tts' : /^ivr_/.test(base) ? 'builder' : 'other',
      orphan: ours && !linkedTo,
    }
  })

  return NextResponse.json({
    folder,
    // 🔴 נאמר במפורש: מי שרואה כאן קבצים זרים צריך לדעת למה.
    shared: folder === (process.env.YEMOT_MENU_EXT || '1'),
    files,
    orphans: files.filter(f => f.orphan).length,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// מחיקת קבצים יתומים בלבד.
//
// 🔴 מוחק רק מה שהשרת עצמו סימן כיתום — הלקוח שולח שמות, והשרת מאמת
// אותם מחדש מול השיוכים. רשימה שמגיעה מהלקוח בלי אימות היא דלת למחיקת
// ההקלטה הפעילה.
export async function POST(request: NextRequest) {
  if (!(await requireStaff(['admin']))) return unauthorized()

  const token = process.env.YEMOT_TOKEN
  if (!token) return NextResponse.json({ error: 'YEMOT_TOKEN אינו מוגדר בשרת' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as { scope?: string; names?: string[] }
  const scope = (body.scope ?? 'holiday') as Scope
  if (!(scope in FOLDERS)) return NextResponse.json({ error: 'שלוחה לא מוכרת' }, { status: 400 })

  const folder = FOLDERS[scope]
  const [names, active] = await Promise.all([listDir(token, folder), activeAudio(scope)])
  const wanted = new Set((body.names ?? []).map(String))

  let deleted = 0
  const failed: string[] = []
  for (const name of names) {
    if (!wanted.has(name)) continue
    const base = name.replace(/\.(mp3|wav)$/i, '')
    // 🔒 האימות מחדש: משויך או לא-שלנו → לא נוגעים, גם אם הלקוח ביקש.
    if (!/^tts_/.test(base) || active[base]) continue
    const r = await deleteFileFromYemot(`ivr2:/${folder}/${name}`)
    if (r.ok) deleted++
    else failed.push(name)
  }

  console.log(`[yemot-files] ${scope}: נמחקו ${deleted} יתומים` + (failed.length ? `, נכשלו ${failed.length}` : ''))
  return NextResponse.json({ ok: true, deleted, failed })
}
