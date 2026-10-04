import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { downloadFileFromYemot, yemotToken, type YemotScope } from '@/lib/yemot'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 חילוץ רטרואקטיבי של הקלטות מתקשרים מתיקיית ApiVoice בימות.
//
// ההקלטות *קיימות* — הן פשוט לא נמצאו, כי הערך שימות מחזירה ב-bf_addr
// ("30/9.wav") אינו נתיב קובץ אלא <שניות>/<שלוחה>. השם האמיתי נבנה
// מהמטא-דאטה של השיחה:
//
//   DID-<מספר המערכת>-Phone-<טלפון המתקשר>-Folder-<שלוחה>-in.wav-<חותמת>
//
// ⚠️ חותמת הזמן אינה שמורה אצלנו, ולכן אי אפשר לבנות את השם מראש.
// במקום זאת התיקייה *נסרקת*, וכל קובץ מותאם להזמנה לפי טלפון המתקשר
// וקרבה בזמן.
//
// ⚠️ ברירת המחדל היא תצוגה בלבד. ?save=1 שומר בפועל.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const API = 'https://www.call2all.co.il/ym/api'

type YemotFile = { name?: string; path?: string; mtime?: string }

/** קבצי ApiVoice בחשבון נתון. */
/**
 * 🔴 ApiVoice יושבת *בתוך* Trash, לא בשורש.
 *
 * ⚠️ הצילום מממשק ימות הראה את נתיב הניווט "ApiVoice ‹ Trash ‹
 * שלוחה ראשית" — כלומר ימות מעבירה הקלטות API לסל המיחזור. סריקת
 * ivr2:/ApiVoice לבדה החזירה 0 קבצים, בעוד הקבצים עצמם קיימים
 * ונראים בממשק.
 *
 * ⚠️ כל המועמדים נסרקים ומאוחדים: המבנה עשוי להשתנות בין חשבונות,
 * ועדיף לסרוק חמישה נתיבים מאשר לנחש אחד.
 */
const VOICE_DIRS = [
  // 🔴 התיעוד: "ההקלטות נשמרות בתוך תיקיית Record שבתוך התיקיה".
  // "30/9.wav" = תיקייה 30, קובץ 9 — והן יושבות תחת Record.
  'ivr2:/30/Record',
  'ivr2:/15/Record',
  'ivr2:/9/Record',
  'ivr2:/Record',
  'ivr2:/30',
  'ivr2:/15',
  // נתיבים שנצפו בממשק
  'ivr2:/ApiVoice',
  'ivr2:/Trash/ApiVoice',
  'ivr2:/ApiRecord',
  'ivr2:/Trash/ApiRecord',
  'ivr2:/Trash',
]

async function listVoice(scope: YemotScope): Promise<YemotFile[]> {
  const token = yemotToken(scope)
  if (!token) return []

  const out: YemotFile[] = []
  for (const dir of VOICE_DIRS) {
    try {
      const res = await fetch(
        `${API}/GetIVR2Dir?token=${encodeURIComponent(token)}&path=${encodeURIComponent(dir)}`,
        { cache: 'no-store' },
      )
      const j = await res.json().catch(() => null) as { files?: YemotFile[] } | null
      for (const f of j?.files ?? []) {
        // ⚠️ הנתיב נשמר על הקובץ: ההורדה בהמשך חייבת לדעת מאיזו
        // תיקייה הוא בא, ולא להניח ApiVoice.
        out.push({ ...f, path: `${dir}/${String(f.name ?? '')}` })
      }
    } catch { /* תיקייה שאינה קיימת — ממשיכים לבאה */ }
  }
  return out
}

/**
 * פירוק שם קובץ ApiVoice.
 *
 * ⚠️ ה-wav יושב *באמצע* השם ("...-in.wav-1791146153") ולא בסופו —
 * חיתוך סיומת רגיל היה הורס אותו.
 */
function parseVoiceName(name: string): { phone: string; folder: string; ts: number } | null {
  const m = name.match(/DID-(\d+)-Phone-(\d+)-Folder-([^-]+)-in\.wav-(\d+)/i)
  if (!m) return null
  return { phone: m[2], folder: m[3], ts: Number(m[4]) }
}

/** נרמול טלפון להשוואה — ימות מחזירה בלי אפס מוביל לעיתים. */
function phoneKey(p: string): string {
  const d = String(p ?? '').replace(/\D/g, '').replace(/^972/, '')
  return d.startsWith('0') ? d.slice(1) : d
}

export async function GET(request: NextRequest) {
  if (!(await requirePermission('book_fair', 'edit'))) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const save = request.nextUrl.searchParams.get('save') === '1'
  const scopes: YemotScope[] = ['bookFair', 'default']

  // ── 1. כל קבצי ApiVoice ──
  const pool: { scope: YemotScope; name: string; path: string; phone: string; ts: number }[] = []
  for (const scope of scopes) {
    for (const f of await listVoice(scope)) {
      const nm = String(f.name ?? '')
      const meta = parseVoiceName(nm)
      const path = String(f.path ?? `ivr2:/ApiVoice/${nm}`)
      if (meta) {
        pool.push({ scope, name: nm, path, phone: phoneKey(meta.phone), ts: meta.ts })
        continue
      }
      // 🔴 שם שאינו בפורמט DID-...-Phone-... עדיין נאסף.
      //
      // ⚠️ בתיקיית Record השמות הם "9.wav" בלבד — בלי טלפון ובלי
      // חותמת. ההתאמה שם היא לפי mtime מול שעת ההזמנה, ולכן הקובץ
      // נרשם עם ts מה-mtime ובלי טלפון (phone ריק = מתאים לכולם).
      // ⚠️ ימות מחזירה "04/10/2026 23:38" — פורמט יום/חודש/שנה
      // ש-Date.parse מפרש הפוך. ההיפוך ל-ISO נעשה כאן.
      const mt = f.mtime
        ? Date.parse(String(f.mtime).replace(
            /^(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'))
        : NaN
      if (Number.isFinite(mt)) {
        pool.push({ scope, name: nm, path, phone: '', ts: Math.floor(mt / 1000) })
      }
    }
  }

  // ── 2. ההקלטות שחסר להן קובץ, עם הטלפון והזמן של ההזמנה ──
  const { data: missing } = await db.from('book_fair_recordings')
    .select('id, kind, created_at, order:book_fair_orders(customer_phone, order_number)')
    .is('storage_path', null)
    .order('created_at', { ascending: false })
    .limit(60)

  const report: string[] = []
  let saved = 0

  for (const rec of missing ?? []) {
    // ⚠️ Supabase מחזיר join של רבים-לאחד כאובייקט *או* כמערך.
    const ord = (Array.isArray(rec.order) ? rec.order[0] : rec.order) as
      { customer_phone?: string; order_number?: string } | null
    const phone = phoneKey(String(ord?.customer_phone ?? ''))
    const label = `${ord?.order_number ?? '?'} ${rec.kind}`
    // ⚠️ אין טלפון אינו חוסם: קובץ מתיקיית Record מותאם לפי זמן
    // בלבד, ולכן הוא עדיין יכול להימצא.
    if (!phone) report.push(`${label} — אין טלפון, התאמה לפי זמן בלבד`)

    const recSec = Math.floor(new Date(rec.created_at as string).getTime() / 1000)

    // 🔴 התאמה לפי טלפון + קרבה בזמן: באותה שיחה שתי הקלטות (שם
    // וכתובת) בהפרש שניות, ולכן המועמד הקרוב ביותר הוא הנכון.
    //
    // ⚠️ חלון של 20 דקות בלבד: אותו מתקשר עשוי להזמין שוב מאוחר יותר,
    // ושיוך הקלטה של שיחה אחרת גרוע מהקלטה חסרה.
    // ⚠️ קובץ בלי טלפון בשם (תיקיית Record) מותאם לפי זמן בלבד,
    // ולכן בחלון צר הרבה יותר — דקתיים — כדי לא לשייך שיחה אחרת.
    const near = pool
      .filter(f => f.phone
        ? (f.phone === phone && Math.abs(f.ts - recSec) < 1200)
        : Math.abs(f.ts - recSec) < 120)
      .sort((a, b) => Math.abs(a.ts - recSec) - Math.abs(b.ts - recSec))

    // ⚠️ 'address' מוקלטת לפני 'name' באותה שיחה — המוקדם הוא הכתובת.
    const sorted = [...near].sort((a, b) => a.ts - b.ts)
    const pick = rec.kind === 'address' ? sorted[0] : (sorted[1] ?? sorted[0])
    if (!pick) { report.push(`${label} — לא נמצאה הקלטה תואמת (טלפון ${phone})`); continue }

    if (!save) {
      report.push(`${label} ← ${pick.name} (תצוגה בלבד)`)
      continue
    }

    const f = await downloadFileFromYemot(pick.path, pick.scope)
    if (!f.ok || !f.data) { report.push(`${label} — ההורדה נכשלה: ${f.error ?? '?'}`); continue }

    const key = `book-fair/rescued/${rec.id}.wav`
    const up = await db.storage.from('documents')
      .upload(key, f.data, { contentType: 'audio/wav', upsert: true })
    if (up.error) { report.push(`${label} — העלאה נכשלה: ${up.error.message}`); continue }

    await db.from('book_fair_recordings')
      .update({ storage_path: key, provider_path: pick.path })
      .eq('id', rec.id)
    report.push(`${label} ← ${pick.name} ✅ שוחזר (${f.data.byteLength} בתים)`)
    saved++
  }

  // ⚠️ מה נסרק ומה נמצא בכל תיקייה — בלי זה "0 קבצים" אינו מבדיל
  // בין תיקייה ריקה, תיקייה שאינה קיימת, ושם קובץ שלא פוענח.
  const dirCounts: Record<string, number> = {}
  for (const scope of scopes) {
    for (const dir of VOICE_DIRS) {
      dirCounts[`${scope} ${dir}`] =
        pool.filter(f => f.scope === scope && f.path.startsWith(dir)).length
    }
  }

  return NextResponse.json({
    voice_files_found: pool.length,
    scanned: dirCounts,
    // ⚠️ דגימה של שמות אמיתיים: אם הפענוח נכשל, היא מראה מיד למה.
    sample: pool.slice(0, 3).map(f => f.name),
    missing_recordings: (missing ?? []).length,
    saved,
    report,
    hint: save ? 'ההקלטות שנמצאו שוחזרו' : 'הוסיפו ?save=1 לכתובת כדי לשחזר בפועל',
  }, { headers: { 'Cache-Control': 'no-store' } })
}
