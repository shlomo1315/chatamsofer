import { NextResponse } from 'next/server'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { getBookFairMessages } from '@/lib/yemotBookFairMessages'

export const dynamic = 'force-dynamic'

const API = 'https://www.call2all.co.il/ym/api'

// ─────────────────────────────────────────────────────────────────────────────
// איפה באמת יושבות ההקלטות של שלוחת היריד.
//
// 🔴 למה זה קיים: ההודעות נשמרו עם שם קובץ (tts_*), והשלוחה שלחה לימות
// `f-tts_welcome_xxx` — אבל ימות ענתה "שגיאה" וניתקה, כי הקובץ לא היה
// בתיקייה שבה היא חיפשה. הסיבה: YEMOT_BOOK_FAIR_EXT לא הוגדר בשרת,
// הקוד נפל לברירת המחדל '9', וההקלטות הועלו ל-ivr2:/9.
//
// ⚠️ התסמין מטעה: אין שום שגיאה בלוגים שלנו — אנחנו מחזירים 200 תקין
// עם הוראה לנגן קובץ שאינו קיים. רק ימות יודעת שהוא חסר.
//
// הסריקה כאן עוברת על כל השלוחות ומדווחת היכן קבצי tts_ של היריד
// יושבים בפועל, כדי שאפשר יהיה להצביע על התיקייה הנכונה.
// ─────────────────────────────────────────────────────────────────────────────

/** השלוחות הסבירות. 1-9 מכסה כל שלוחה רגילה בימות. */
const SCAN = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

async function listDir(token: string, folder: string): Promise<string[]> {
  const url = `${API}/GetIVR2Dir?token=${encodeURIComponent(token)}`
    + `&path=${encodeURIComponent(`ivr2:/${folder}`)}`
  const res = await fetch(url, { cache: 'no-store' }).catch(() => null)
  if (!res) return []
  const json = await res.json().catch(() => null) as { files?: unknown } | null
  const raw = Array.isArray(json?.files) ? json.files : []
  return raw
    .map(f => {
      if (typeof f === 'string') return f
      const o = f as { name?: unknown; fileName?: unknown }
      return String(o.name ?? o.fileName ?? '')
    })
    .filter(Boolean)
}

export async function GET() {
  if (!(await requireStaff(['admin']))) return unauthorized()

  const token = process.env.YEMOT_TOKEN
  if (!token) return NextResponse.json({ error: 'YEMOT_TOKEN אינו מוגדר בשרת' }, { status: 500 })

  // מה ההגדרות שלנו מצפות לשמוע
  const msgs = await getBookFairMessages()
  const expected = new Set<string>()
  for (const m of Object.values(msgs)) {
    if (m?.audio) expected.add(String(m.audio))
  }

  // מה קיים בפועל בכל שלוחה
  const dirs = await Promise.all(
    SCAN.map(async folder => ({ folder, files: await listDir(token, folder) }))
  )

  const found: Record<string, string[]> = {}
  const whereIsEach: Record<string, string[]> = {}
  for (const { folder, files } of dirs) {
    const tts = files.filter(n => /^tts_/.test(n))
    if (tts.length) found[folder] = tts
    for (const n of tts) {
      const base = n.replace(/\.(mp3|wav)$/i, '')
      if (!expected.has(base)) continue
      ;(whereIsEach[base] ??= []).push(folder)
    }
  }

  const missing = [...expected].filter(b => !whereIsEach[b])

  return NextResponse.json({
    configured_ext: process.env.YEMOT_BOOK_FAIR_EXT ?? '(לא מוגדר — ברירת מחדל 9)',
    expected_count: expected.size,
    // 🔴 העיקר: לאיזו תיקייה ההקלטות של היריד הגיעו בפועל
    found_in_folders: Object.fromEntries(
      Object.entries(found).map(([f, list]) => [f, list.length])
    ),
    matched_folders: [...new Set(Object.values(whereIsEach).flat())],
    missing_count: missing.length,
    missing: missing.slice(0, 20),
    all_dirs: Object.fromEntries(dirs.map(d => [d.folder, d.files.length])),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
