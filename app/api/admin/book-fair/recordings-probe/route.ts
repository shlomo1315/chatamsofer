import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { yemotToken, type YemotScope } from '@/lib/yemot'

// ─────────────────────────────────────────────────────────────────────────────
// אבחון: איפה הקלטות המתקשרים באמת יושבות בימות.
//
// 🔴 למה זה קיים: ההקלטות נשמרו במסד עם provider_path="30/9.wav", אבל
// כל ניסיון להוריד אותן נכשל — גם בנגן וגם בהעתקה לאחסון שלנו. כל
// הנתיבים שניחשנו (ivr2:/30/9.wav, ivr2:/9/30/9.wav, בשני החשבונות)
// החזירו "לא נמצא", ולקוח ששילם 839 ₪ נשאר בלי כתובת.
//
// ⚠️ ניחוש נוסף אינו פתרון. הראוט הזה *מציג את התיקייה* דרך
// GetIVR2Dir ו-ListFiles, ולכן הוא עונה על השאלה במקום לנחש אותה.
//
// ⚠️ קריאה בלבד — אינו כותב, אינו מוחק, ואינו חושף את הטוקן.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const API = 'https://www.call2all.co.il/ym/api'

/** קריאת API של ימות שמחזירה JSON, עם שגיאה קריאה במקום זריקה. */
async function ym(
  scope: YemotScope, fn: string, qs: Record<string, string>,
): Promise<unknown> {
  const token = yemotToken(scope)
  if (!token) return { error: 'אין טוקן לחשבון זה' }
  const p = new URLSearchParams({ token, ...qs })
  try {
    const res = await fetch(`${API}/${fn}?${p}`, { cache: 'no-store' })
    const text = await res.text()
    try { return JSON.parse(text) } catch { return { raw: text.slice(0, 400) } }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

export async function GET(request: NextRequest) {
  if (!(await requirePermission('book_fair', 'edit'))) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const extDir = (process.env.YEMOT_BOOK_FAIR_EXT || '9').trim()

  // הנתיבים שבאמת שמורים במסד — הם נקודת המוצא לבדיקה.
  const { data: recs } = await db.from('book_fair_recordings')
    .select('provider_path').order('created_at', { ascending: false }).limit(5)
  const paths = Array.from(new Set((recs ?? [])
    .map(r => String(r.provider_path ?? '')).filter(Boolean)))

  const scopes: YemotScope[] = ['bookFair', 'default']
  const out: Record<string, unknown> = {
    ext_dir: extDir,
    has_book_fair_token: Boolean(process.env.YEMOT_BOOK_FAIR_TOKEN?.trim()),
    paths_in_db: paths,
  }

  // ── 1. תוכן תיקיות השלוחה בשני החשבונות ──
  // ⚠️ גם השורש וגם תיקיית השלוחה: ההקלטות עשויות לשבת בכל אחת מהן.
  // ⚠️ כולל ApiRecord/ImportRecord: ימות שומרת שם הקלטות של מתקשרים,
  // ולא בתיקיית השלוחה כפי ש-"30/9.wav" מרמז.
  for (const scope of scopes) {
    for (const p of [
      'ivr2:/', `ivr2:/${extDir}`,
      'ivr2:/ApiRecord', 'ivr2:/ImportRecord',
      `ivr2:/${extDir}/ApiRecord`, 'ivr2:/30', 'ivr2:/15',
    ]) {
      out[`dir_${scope}_${p}`] = await ym(scope, 'GetIVR2Dir', { path: p })
    }
  }

  // ── 2. בדיקת כל נתיב שנשמר במסד, בכל צורה אפשרית ──
  // ⚠️ HEAD אינו נתמך; נבדק הטיפוס של התגובה: JSON = שגיאה, בינארי = הקובץ קיים.
  const probes: Record<string, string> = {}
  for (const raw of paths) {
    for (const scope of scopes) {
      for (const p of [
        `ivr2:/${raw}`,
        `ivr2:/${extDir}/${raw}`,
        // ⚠️ ייתכן ש-"30/9.wav" הוא כבר שלוחה/קובץ ולא תיקייה/קובץ:
        // ננסה גם את ההיפוך ואת שם הקובץ לבדו.
        `ivr2:/${raw.split('/').reverse().join('/')}`,
        `ivr2:/${raw.split('/').pop()}`,
      ]) {
        const token = yemotToken(scope)
        if (!token) continue
        const url = `${API}/DownloadFile?token=${encodeURIComponent(token)}&path=${encodeURIComponent(p)}`
        try {
          const res = await fetch(url, { cache: 'no-store' })
          const ct = res.headers.get('content-type') ?? ''
          const len = res.headers.get('content-length') ?? '?'
          const okBin = res.ok && !ct.includes('application/json')
          probes[`${scope} ${p}`] = okBin
            ? `✅ נמצא (${ct}, ${len} בתים)`
            : `❌ ${res.status} ${ct} ${(await res.text()).slice(0, 120)}`
        } catch (e) {
          probes[`${scope} ${p}`] = `❌ ${e instanceof Error ? e.message : String(e)}`
        }
      }
    }
  }
  out.probes = probes

  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
