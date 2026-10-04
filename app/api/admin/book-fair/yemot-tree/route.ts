import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { yemotToken, type YemotScope } from '@/lib/yemot'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 סריקת עץ התיקיות של ימות — להפסיק לנחש איפה ההקלטות.
//
// עשרה נתיבים שניחשתי החזירו 0 קבצים, בעוד שהקבצים נראים בבירור
// בממשק של ימות (2.37M, 02:36 דקות). במקום לנחש אחד-עשר, הכלי הזה
// *מטייל* בעץ: מתחיל מהשורש, נכנס לכל תיקייה שהוא מוצא, ומדווח איפה
// יש קבצי אודיו.
//
// ⚠️ עומק מוגבל ל-3 ותקרת תיקיות: עץ של ימות עשוי להיות גדול, ובקשה
// שתרוץ דקות תיפול ב-timeout בלי להחזיר דבר.
//
// ⚠️ קריאה בלבד. אינו כותב, אינו מוחק, ואינו חושף את הטוקן.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const API = 'https://www.call2all.co.il/ym/api'
const MAX_DEPTH = 3
const MAX_DIRS = 60

type Entry = { name?: string; fileType?: string; size?: number; mtime?: string }

async function dir(token: string, path: string): Promise<{
  dirs: string[]; files: Entry[]; error?: string
}> {
  try {
    const res = await fetch(
      `${API}/GetIVR2Dir?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`,
      { cache: 'no-store' },
    )
    const j = await res.json().catch(() => null) as {
      dirs?: Entry[]; files?: Entry[]; responseStatus?: string
    } | null
    if (!j) return { dirs: [], files: [], error: 'תשובה שאינה JSON' }
    if (j.responseStatus && j.responseStatus !== 'OK') {
      return { dirs: [], files: [], error: String(j.responseStatus) }
    }
    return {
      dirs: (j.dirs ?? []).map(d => String(d.name ?? '')).filter(Boolean),
      files: j.files ?? [],
    }
  } catch (e) {
    return { dirs: [], files: [], error: e instanceof Error ? e.message : String(e) }
  }
}

export async function GET(request: NextRequest) {
  if (!(await requirePermission('book_fair', 'edit'))) return forbidden()

  const scope = (request.nextUrl.searchParams.get('scope') ?? 'bookFair') as YemotScope
  const root = request.nextUrl.searchParams.get('root') ?? 'ivr2:/'
  const token = yemotToken(scope)
  if (!token) return NextResponse.json({ error: 'אין טוקן לחשבון זה' }, { status: 400 })

  // ⚠️ BFS ולא רקורסיה: כך העומק נשלט, ותיקייה אחת עמוקה אינה בולעת
  // את כל התקציב.
  const queue: { path: string; depth: number }[] = [{ path: root, depth: 0 }]
  const seen = new Set<string>()
  const withAudio: Record<string, { count: number; sample: string[]; totalMB: number }> = {}
  const empty: string[] = []
  const errors: Record<string, string> = {}

  while (queue.length && seen.size < MAX_DIRS) {
    const { path, depth } = queue.shift()!
    if (seen.has(path)) continue
    seen.add(path)

    const r = await dir(token, path)
    if (r.error) { errors[path] = r.error; continue }

    // 🔴 רק קבצי אודיו מעניינים — הקלטת מתקשר היא wav של מאות KB.
    const audio = r.files.filter(f =>
      /\.(wav|mp3)$/i.test(String(f.name ?? '')) || f.fileType === 'AUDIO')

    if (audio.length) {
      withAudio[path] = {
        count: audio.length,
        sample: audio.slice(0, 4).map(f => String(f.name ?? '')),
        totalMB: Math.round(
          audio.reduce((s, f) => s + (Number(f.size) || 0), 0) / 1048576 * 10) / 10,
      }
    } else if (!r.dirs.length) {
      empty.push(path)
    }

    if (depth < MAX_DEPTH) {
      for (const d of r.dirs) {
        const sub = path.endsWith('/') ? `${path}${d}` : `${path}/${d}`
        if (!seen.has(sub)) queue.push({ path: sub, depth: depth + 1 })
      }
    }
  }

  return NextResponse.json({
    scope, root,
    scanned: seen.size,
    // 🔴 זו התשובה: בדיוק אילו תיקיות מכילות קבצי אודיו.
    folders_with_audio: withAudio,
    empty_folders: empty.slice(0, 20),
    errors,
    hint: 'folders_with_audio מראה איפה ההקלטות באמת יושבות. אפשר להוסיף ?scope=default או ?root=ivr2:/9',
  }, { headers: { 'Cache-Control': 'no-store' } })
}
