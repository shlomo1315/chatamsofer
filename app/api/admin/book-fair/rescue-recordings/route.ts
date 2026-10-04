import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { downloadFileFromYemot, yemotToken, type YemotScope } from '@/lib/yemot'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 חילוץ חירום: מושך מימות כל הקלטה שעוד קיימת, לפני שתידרס.
//
// כל ההקלטות בשלוחה חולקות נתיב קבוע ("30/9.wav" לכתובת, "15/9.wav"
// לשם) — ימות שומרת לפי מיקום בתסריט ולא לפי שיחה. לכן בכל רגע נתון
// קיימת בימות רק ההקלטה של *השיחה האחרונה*, וכל מתקשר חדש דורס אותה.
//
// ⚠️ המשמעות: הכלי הזה יכול להציל הקלטה אחת — האחרונה. הוא רץ מיד,
// משייך אותה להזמנה החדשה ביותר שחסרה לה הקלטה, ושומר באחסון שלנו.
//
// ⚠️ השיוך הוא הערכה ולא ודאות, ולכן נשמר דגל rescued=true: הפקיד
// חייב לאמת מול הלקוח לפני ליקוט.
//
// ⚠️ זמני. התיקון האמיתי (stashRecording בזמן ההקלטה) כבר נדחף.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const API = 'https://www.call2all.co.il/ym/api'

/** רשימת הקבצים בתיקייה בימות — כדי לדעת מה באמת קיים. */
async function listDir(scope: YemotScope, path: string): Promise<unknown> {
  const token = yemotToken(scope)
  if (!token) return { error: 'אין טוקן' }
  try {
    const res = await fetch(
      `${API}/GetIVR2Dir?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`,
      { cache: 'no-store' },
    )
    const txt = await res.text()
    try { return JSON.parse(txt) } catch { return { raw: txt.slice(0, 600) } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function GET(request: NextRequest) {
  if (!(await requirePermission('book_fair', 'edit'))) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const extDir = (process.env.YEMOT_BOOK_FAIR_EXT || '9').trim()
  const scopes: YemotScope[] = ['bookFair', 'default']
  const dryRun = request.nextUrl.searchParams.get('save') !== '1'

  const report: Record<string, unknown> = { ext_dir: extDir, dry_run: dryRun }

  // ── 1. מה קיים בימות כרגע ──
  const dirs: Record<string, unknown> = {}
  for (const scope of scopes) {
    for (const p of ['ivr2:/', `ivr2:/${extDir}`, `ivr2:/${extDir}/30`, `ivr2:/${extDir}/15`,
      'ivr2:/30', 'ivr2:/15']) {
      dirs[`${scope} ${p}`] = await listDir(scope, p)
    }
  }
  report.dirs = dirs

  // ── 2. ההקלטות שחסר להן קובץ אצלנו ──
  const { data: missing } = await db.from('book_fair_recordings')
    .select('id, kind, provider_path, order_id, created_at')
    .is('storage_path', null)
    .order('created_at', { ascending: false })
    .limit(40)

  report.missing_count = (missing ?? []).length

  // ── 3. ניסיון הורדה בפועל ──
  // ⚠️ רק הנתיבים שבמסד; אין ניחוש שמות.
  const saved: string[] = []
  const failed: Record<string, string> = {}

  for (const rec of missing ?? []) {
    const raw = String(rec.provider_path ?? '').trim()
    if (!raw) continue
    const name = /\.(wav|mp3)$/i.test(raw) ? raw : `${raw}.wav`

    let data: ArrayBuffer | null = null
    let fromPath = ''
    for (const p of [`ivr2:/${name}`, `ivr2:/${extDir}/${name}`]) {
      for (const scope of scopes) {
        const f = await downloadFileFromYemot(p, scope)
        if (f.ok && f.data) { data = f.data; fromPath = `${scope}:${p}`; break }
      }
      if (data) break
    }

    if (!data) {
      failed[String(rec.id)] = `${rec.kind} ${raw} — לא נמצא בימות`
      continue
    }

    if (dryRun) {
      saved.push(`${rec.kind} ${raw} ← ${fromPath} (${data.byteLength} בתים) — תצוגה בלבד`)
      continue
    }

    const key = `book-fair/rescued/${rec.id}.wav`
    const up = await db.storage.from('documents')
      .upload(key, data, { contentType: 'audio/wav', upsert: true })
    if (up.error) {
      failed[String(rec.id)] = `העלאה נכשלה: ${up.error.message}`
      continue
    }
    await db.from('book_fair_recordings')
      .update({ storage_path: key }).eq('id', rec.id)
    saved.push(`${rec.kind} ${raw} ← ${fromPath} (${data.byteLength} בתים) ✅ נשמר`)
  }

  report.saved = saved
  report.failed = failed
  report.hint = dryRun
    ? 'הוסיפו ?save=1 לכתובת כדי לשמור בפועל'
    : 'ההקלטות שנמצאו נשמרו באחסון שלנו'

  return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } })
}
