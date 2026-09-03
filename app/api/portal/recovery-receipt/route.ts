import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { portalCookieName } from '../login/route'
import { verifyRecoveryPortalToken } from '@/lib/recoveryPortalAuth'
import { extractUrl } from '@/lib/extractUrl'
import { RECOVERY_COOKIE_RE } from '@/lib/recoveryCookieShape'
import { scanReceiptNumber } from '@/lib/receiptOcr'

export const dynamic = 'force-dynamic'

const BUCKET = 'documents'
const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', heic: 'image/heic', gif: 'image/gif', pdf: 'application/pdf',
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// ─────────────────────────────────────────────────────────────────────────────
// משיכת קובץ מקישור חיצוני שהודבק בפורטל.
//
// 🔒 הגנת SSRF: השרת שלנו מבצע כאן בקשה ליעד שהמשתמש בחר, ולכן מותרים רק
// http/https, וכתובות פנימיות (localhost, טווחים פרטיים, metadata של הענן)
// נחסמות. בנוסף — הפניות אינן נעקבות אוטומטית, יש תקרת גודל ומגבלת זמן.
// ─────────────────────────────────────────────────────────────────────────────
const PRIVATE_HOST = /^(localhost$|127\.|10\.|192\.168\.|169\.254\.|0\.|\[?::1\]?$|172\.(1[6-9]|2\d|3[01])\.)/i

type FetchedFile = { bytes: ArrayBuffer; ext: string; contentType: string }

// ⚠️ תקרת קפיצות אחת לכל המסלול — הפניות (redirect) *וגם* מעבר מעמוד נחיתה
// לקובץ. בלעדיה שרשרת הפניות מעגלית תתקע את הבקשה עד ה-timeout.
const MAX_HOPS = 5

function validateTarget(link: string): { url: URL } | { error: string } {
  let u: URL
  try { u = new URL(link) } catch { return { error: 'הקישור אינו תקין' } }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { error: 'הקישור חייב להתחיל ב-http או https' }
  }
  if (PRIVATE_HOST.test(u.hostname)) return { error: 'הקישור אינו נתמך' }
  return { url: u }
}

// ─────────────────────────────────────────────────────────────────────────────
// זיהוי סוג הקובץ לפי חתימת הבייטים (magic bytes).
//
// ⚠️ הכרחי, ולא רק "נחמד שיהיה": שרתי קבלות מחזירים לעיתים קרובות
// application/octet-stream, והקישור עצמו הוא קוד קצר בלי סיומת
// (secure.ezgo.co.il/I?1xV.eG6T). במצב הזה גם הכותרת וגם הסיומת חסרות
// תועלת, והזיהוי היחיד שנשאר הוא תוכן הקובץ עצמו.
// ─────────────────────────────────────────────────────────────────────────────
function sniffType(buf: ArrayBuffer): { ext: string; contentType: string } | null {
  const b = new Uint8Array(buf.slice(0, 16))
  const at = (i: number) => b[i] ?? -1
  const ascii = (start: number, len: number) =>
    Array.from(b.slice(start, start + len)).map(c => String.fromCharCode(c)).join('')

  if (ascii(0, 4) === '%PDF') return { ext: 'pdf', contentType: 'application/pdf' }
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return { ext: 'jpg', contentType: 'image/jpeg' }
  if (at(0) === 0x89 && ascii(1, 3) === 'PNG') return { ext: 'png', contentType: 'image/png' }
  if (ascii(0, 3) === 'GIF') return { ext: 'gif', contentType: 'image/gif' }
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return { ext: 'webp', contentType: 'image/webp' }
  // HEIC/HEIF — 'ftyp' בהיסט 4, ואחריו מזהה המשפחה
  if (ascii(4, 4) === 'ftyp' && /^(heic|heix|hevc|mif1|msf1)/.test(ascii(8, 4))) {
    return { ext: 'heic', contentType: 'image/heic' }
  }
  return null
}

const looksLikeHtml = (buf: ArrayBuffer) =>
  /^\s*(<!doctype html|<html|<head|<meta|<script)/i.test(
    new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, 512)),
  )

// ─────────────────────────────────────────────────────────────────────────────
// איתור הקובץ בתוך עמוד נחיתה.
//
// ⚠️ קישורי הקבלות שנשלחים לבתי ההחלמה הם קודים מקוצרים שמובילים לעמוד צפייה,
// לא לקובץ עצמו. בלי השלב הזה הנציג מקבל "סוג הקובץ אינו נתמך" על קישור
// שלגמרי עובד בדפדפן שלו — וזה נראה כמו תקלה שרירותית.
// ─────────────────────────────────────────────────────────────────────────────
function findFileInHtml(html: string, base: URL): string | null {
  const abs = (v: string): string | null => {
    try { return new URL(v.replace(/&amp;/g, '&').trim(), base).toString() } catch { return null }
  }
  const isFile = (v: string) => /\.(pdf|jpe?g|png|webp|gif|heic)(\?|#|$)/i.test(v)

  // 1) קישור/מקור שנראה כמו קובץ — העדיפות הראשונה
  for (const m of html.matchAll(/(?:href|src|data|content)\s*=\s*["']([^"']+)["']/gi)) {
    if (isFile(m[1])) { const a = abs(m[1]); if (a) return a }
  }
  // 2) כתובת מלאה שנראית כמו קובץ, גם מחוץ לתגית (למשל בתוך JS)
  const raw = html.match(/https?:\/\/[^\s"'<>]+\.(?:pdf|jpe?g|png|webp|gif|heic)(?:\?[^\s"'<>]*)?/i)
  if (raw) return raw[0]
  // 3) הפניה אוטומטית / מסגרת — העמוד עצמו רק עוטף את הקובץ
  const meta = html.match(/<meta[^>]+http-equiv\s*=\s*["']?refresh["']?[^>]*content\s*=\s*["'][^"']*url=([^"';]+)/i)
  if (meta) return abs(meta[1])
  const frame = html.match(/<(?:iframe|embed)[^>]+src\s*=\s*["']([^"']+)["']/i)
    ?? html.match(/<object[^>]+data\s*=\s*["']([^"']+)["']/i)
  if (frame) return abs(frame[1])
  return null
}

async function fetchLinkedFile(link: string): Promise<FetchedFile | { error: string }> {
  // הנציג מדביק את כל ההודעה — שולפים ממנה את הקישור לפני כל דבר אחר
  let current = extractUrl(link)
  const seen = new Set<string>()

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const target = validateTarget(current)
    if ('error' in target) return target
    const u = target.url
    const key = u.toString()
    if (seen.has(key)) return { error: 'הקישור מפנה במעגל — ודאו שהוא קישור ישיר לקובץ' }
    seen.add(key)

    let res: Response
    try {
      res = await fetch(key, {
        // ⚠️ manual ולא follow: כל הפניה נבדקת מחדש מול PRIVATE_HOST. עם follow
        // כתובת ציבורית יכולה להפנות לכתובת פנימית והבדיקה נעקפת לגמרי (SSRF).
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
        headers: { 'User-Agent': 'chasamsofer-portal/1.0', Accept: '*/*' },
      })
    } catch {
      return { error: 'לא ניתן להוריד את הקובץ מהקישור — ודאו שהוא ציבורי ונגיש' }
    }

    // הפניה — ממשיכים ליעד החדש דרך אותה בדיקה בדיוק
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) return { error: 'הקישור מפנה ליעד לא ידוע' }
      try { current = new URL(loc, u).toString() } catch { return { error: 'הקישור אינו תקין' } }
      continue
    }
    if (!res.ok) return { error: `הקישור החזיר שגיאה (${res.status}) — ודאו שהוא ציבורי` }

    // תקרת גודל לפני הקריאה, כשהשרת מצהיר עליה — לא למשוך 500MB לזיכרון
    const declaredLen = Number(res.headers.get('content-length') ?? '')
    if (Number.isFinite(declaredLen) && declaredLen > MAX_SIZE) {
      return { error: 'הקובץ גדול מדי (מקסימום 10MB)' }
    }

    const bytes = await res.arrayBuffer()
    if (bytes.byteLength === 0) return { error: 'הקובץ בקישור ריק' }
    if (bytes.byteLength > MAX_SIZE) return { error: 'הקובץ גדול מדי (מקסימום 10MB)' }

    // 1) חתימת הבייטים — הזיהוי האמין ביותר, ועובד גם ב-octet-stream
    const sniffed = sniffType(bytes)
    if (sniffed) return { bytes, ...sniffed }

    const declared = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()

    // 2) עמוד נחיתה — מחפשים בתוכו את הקובץ וממשיכים אליו
    if (declared.includes('html') || looksLikeHtml(bytes)) {
      const html = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 512 * 1024))
      const next = findFileInHtml(html, u)
      if (!next) {
        return { error: 'הקישור מוביל לעמוד אינטרנט ולא לקובץ. פתחו את הקישור, הורידו את הקובץ, וצרפו אותו כאן בהעלאה.' }
      }
      current = next
      continue
    }

    // 3) לפי הכותרת, ולבסוף לפי הסיומת שבכתובת
    const byCt = Object.entries(ALLOWED).find(([, ct]) => ct === declared)
    if (byCt) return { bytes, ext: byCt[0], contentType: byCt[1] }
    const ext = (u.pathname.split('.').pop() ?? '').toLowerCase()
    if (ALLOWED[ext]) return { bytes, ext, contentType: ALLOWED[ext] }

    return { error: 'סוג הקובץ בקישור אינו נתמך — נדרשת תמונה או PDF' }
  }
  return { error: 'הקישור מפנה יותר מדי פעמים — ודאו שהוא קישור ישיר לקובץ' }
}

// העלאת קובץ הקבלה של בית ההחלמה (קובץ או קישור). מאומת דרך עוגיית הפורטל + בעלות על הרשומה.
export async function POST(request: NextRequest) {
  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 דחייה מוקדמת למי שאין לו סשן כלל — לפני משיכת הקובץ מהרשת.
  //
  // formData() מושך את הקבלה כולה. בלי הבדיקה הזו נציג שהסשן שלו פג העלה
  // קובץ שלם, המתין, ורק אז קיבל 401 (אותו דפוס שנצפה בלוג ב-upload-docs:
  // בקשה של 45 שניות שנגמרה בדחייה).
  //
  // ⚠️ האימות המלא *חייב* להישאר אחרי הקריאה: שם העוגייה נגזר מ-home,
  // ו-home מגיע בגוף הטופס. לכן כאן נבדק רק שקיימת עוגיית פורטל כלשהי —
  // תנאי הכרחי שאינו תלוי בגוף. מי שעובר אותו עדיין נבדק לגופו למטה,
  // כך שאין כאן שום הקלה באבטחה.
  // ─────────────────────────────────────────────────────────────────────────
  const preCookies = await cookies()
  if (!preCookies.getAll().some(c => RECOVERY_COOKIE_RE.test(c.name))) {
    return NextResponse.json({ error: 'פג תוקף החיבור. יש להתחבר מחדש ולנסות שוב.' }, { status: 401 })
  }

  const form = await request.formData()
  const home = String(form.get('home') ?? '')
  const aidId = String(form.get('aidId') ?? '')
  const file = form.get('file')
  // ⚠️ נציג בית ההחלמה יכול לצרף קובץ *או* להדביק קישור ישיר אליו. הקישור
  // אינו נשמר כמות שהוא: הוא נמשך כאן בשרת ומאוחסן אצלנו, כדי שהקבלה תהיה
  // בכרטסת הלידה ולא תלויה בשרת חיצוני שעלול להימחק או להיחסם.
  const link = String(form.get('link') ?? '').trim()
  // תשלום משלים: הקבלה מתווספת לרשומה נעולה בלי לדרוס את הקבלה המקורית.
  const isTopup = String(form.get('topup') ?? '') === '1'
  if (!home || !aidId || (!(file instanceof File) && !link)) {
    return NextResponse.json({ error: 'חסרים פרטים' }, { status: 400 })
  }

  const cookieStore = await cookies()
  if (!verifyRecoveryPortalToken(cookieStore.get(portalCookieName(home))?.value, home)) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  let bytes: ArrayBuffer
  let ext: string
  let contentType: string

  if (file instanceof File) {
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'הקובץ גדול מדי (מקסימום 10MB)' }, { status: 400 })
    ext = (file.name.split('.').pop() ?? '').toLowerCase()
    const ct = ALLOWED[ext]
    if (!ct) return NextResponse.json({ error: 'סוג קובץ לא נתמך' }, { status: 400 })
    contentType = ct
    bytes = await file.arrayBuffer()
  } else {
    const fetched = await fetchLinkedFile(link)
    if ('error' in fetched) return NextResponse.json({ error: fetched.error }, { status: 400 })
    bytes = fetched.bytes; ext = fetched.ext; contentType = fetched.contentType
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // אימות בעלות: הרשומה שייכת לבית החלמה זה ואינה נעולה
  const { data: aid } = await admin.from('maternity_aids')
    .select('id, recovery_home, beneficiary_id, recovery_locked').eq('id', aidId).maybeSingle()
  if (!aid || aid.recovery_home !== home) {
    return NextResponse.json({ error: 'הרשומה לא נמצאה בבית החלמה זה' }, { status: 404 })
  }
  // ⚠️ רשומה נעולה חסומה להעלאה *רגילה* בלבד. במצב תשלום משלים (topup) הקבלה
  // אינה דורסת את הקיימת — היא נשמרת כשורה נוספת ב-recovery_receipts דרך
  // /api/portal/recovery-topup, ולכן ההעלאה עצמה מותרת גם כשהרשומה נעולה.
  if (aid.recovery_locked && !isTopup) {
    return NextResponse.json({ error: 'הרשומה נעולה' }, { status: 403 })
  }

  const path = `${aid.beneficiary_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path)
  const url = urlData.publicUrl

  // בתשלום משלים לא נוגעים ב-recovery_receipt_url: הקבלה המקורית נשארת
  // במקומה, והחדשה נרשמת בטבלת הקבלות בשלב הבא (recovery-topup).
  if (!isTopup) {
    const { error } = await admin.from('maternity_aids')
      .update({ recovery_receipt_url: url, updated_at: new Date().toISOString() }).eq('id', aidId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── זיהוי מספר הקבלה מתוך הקובץ ──
  //
  // 🔴 **אחרי** שהקבלה כבר נשמרה, ולעולם לא לפניה: הזיהוי הוא נוחות,
  // וכשל בו אינו רשאי למנוע העלאה שהצליחה.
  //
  // ⚠️ המספר מוחזר להצגה ואינו נשמר כאן. מספר שגוי שנשמר בשקט גרוע ממספר
  // חסר — איש לא יידע שצריך לבדוק אותו. בית ההחלמה רואה, מתקן אם צריך,
  // ורק אז הוא נשמר עם שאר הפרטים.
  const scan = await scanReceiptNumber(bytes, contentType)

  return NextResponse.json({
    ok: true, url,
    receiptNumber: scan.number,
    receiptConfidence: scan.confidence,
  })
}
