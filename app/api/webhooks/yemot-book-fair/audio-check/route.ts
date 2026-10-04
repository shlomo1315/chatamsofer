import { NextResponse, type NextRequest } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getBookFairMessages } from '@/lib/yemotBookFairMessages'
import { yemotToken } from '@/lib/yemot'

export const dynamic = 'force-dynamic'

const API = 'https://www.call2all.co.il/ym/api'

// ─────────────────────────────────────────────────────────────────────────────
// האם קבצי ההקלטה של היריד באמת יושבים בשלוחה.
//
// 🔴 למה זה קיים: השלוחה ענתה "שגיאה" וניתקה, וחשדנו בקבצים חסרים —
// אבל לא הייתה שום דרך *לראות* מה יש בתיקייה. בלי זה חוזרים לנחש,
// וכל ניחוש עולה פריסה ושיחת בדיקה.
//
// ⚠️ מוגן באותו ApiToken של השלוחה ולא בהתחברות צוות: הוא נועד
// לאבחון מהיר בזמן תקלה, כשאין גישה לדפדפן מחובר. אין כאן שום מידע
// אישי — רק שמות קבצים.
//
// ⚠️ fail-closed: בלי טוקן תקין מוחזר 401 לפני כל פנייה לימות.
// ─────────────────────────────────────────────────────────────────────────────

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

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

export async function GET(request: NextRequest) {
  const expected = process.env.YEMOT_WEBHOOK_SECRET ?? ''
  const got = request.nextUrl.searchParams.get('ApiToken') ?? ''
  if (!expected || !got || !safeEqual(got, expected)) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 })
  }

  const token = yemotToken('bookFair')
  if (!token) return NextResponse.json({ error: 'YEMOT_TOKEN אינו מוגדר בשרת' }, { status: 500 })

  const ext = process.env.YEMOT_BOOK_FAIR_EXT || '9'

  // מה ההגדרות מצפות לשמוע
  const msgs = await getBookFairMessages()
  const expectedFiles = new Set<string>()
  for (const m of Object.values(msgs)) if (m?.audio) expectedFiles.add(String(m.audio))

  // מה קיים בפועל — בשלוחה שלנו, ובשאר כגיבוי לאיתור
  const folders = [ext, ...['1', '7', '8', '9'].filter(f => f !== ext)]
  const dirs = await Promise.all(
    folders.map(async f => ({ folder: f, files: await listDir(token, f) })),
  )

  const here = dirs.find(d => d.folder === ext)?.files ?? []
  const hereBases = new Set(here.map(n => n.replace(/\.(mp3|wav)$/i, '')))
  const missing = [...expectedFiles].filter(b => !hereBases.has(b))

  // 🔴 רישום בתיקייה אינו הוכחה שהקובץ מתנגן: קובץ באורך אפס, או
  // כזה שהמרת האודיו שלו נכשלה, מופיע ברשימה בדיוק כמו תקין.
  // ⚠️ זו הטעות שחזרה עליה פעמיים — "הקבצים שם" נבדק ברשימה בלבד.
  const probeNames = here.filter(n => /^tts_/.test(n)).slice(0, 4)
  const probes = await Promise.all(probeNames.map(async name => {
    const r = await fetch(
      `${API}/DownloadFile?token=${encodeURIComponent(token)}`
      + `&path=${encodeURIComponent(`ivr2:/${ext}/${name}`)}`,
      { cache: 'no-store' },
    ).catch(() => null)
    if (!r) return { name, ok: false, why: 'בקשה נכשלה' }
    const type = r.headers.get('content-type') ?? ''
    const len = Number(r.headers.get('content-length') ?? 0)
    // ⚠️ ימות מחזירה JSON עם שגיאה ולא קוד HTTP כשהקובץ פגום
    if (type.includes('json')) {
      return { name, ok: false, why: (await r.text()).slice(0, 120) }
    }
    // 🔴 כותרת ה-WAV: ימות מנגנת רק PCM 8kHz מונו 16 ביט. קובץ
    // בקצב דגימה אחר נשמר, מופיע ברשימה, וניתן להורדה — אבל אינו
    // מתנגן, וזה בדיוק מה שאיננו רואים בשום לוג.
    const buf = Buffer.from(await r.arrayBuffer())
    const riff = buf.subarray(0, 4).toString('latin1')
    const wave = buf.subarray(8, 12).toString('latin1')
    // fmt chunk: ערוצים @22, קצב דגימה @24, ביטים לדגימה @34
    const fmt = riff === 'RIFF' && wave === 'WAVE' ? {
      format: buf.readUInt16LE(20),
      channels: buf.readUInt16LE(22),
      sampleRate: buf.readUInt32LE(24),
      bits: buf.readUInt16LE(34),
    } : null
    return { name, ok: len > 1000, bytes: buf.length, riff, wave, fmt }
  }))

  return NextResponse.json({
    ext,
    audio_enabled: process.env.YEMOT_BOOK_FAIR_AUDIO === '1',
    expected: expectedFiles.size,
    present_here: [...expectedFiles].length - missing.length,
    missing_count: missing.length,
    missing: missing.slice(0, 10),
    // 🔴 העיקר: האם הקובץ באמת ניתן להורדה ובגודל סביר
    probes,
    // רשימת הקבצים בתיקייה — כדי לראות אם הם שם בשם אחר
    files_here: here.slice(0, 40),
    other_folders: Object.fromEntries(
      dirs.filter(d => d.folder !== ext).map(d => [d.folder, d.files.filter(n => /^tts_/.test(n)).length]),
    ),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
