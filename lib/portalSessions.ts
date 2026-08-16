import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHmac, randomBytes, createHash, timingSafeEqual } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// סשנים לפורטלים המשותפים — מזהה ייחודי לכל כניסה.
//
// 🔴 הבעיה שזה מחליף: הטוקן הישן היה `<יום>.<hmac>` מיום + טביעת-סיסמה
// בלבד. שני הערכים זהים לכל המשתמשים, ולכן **כל מי שנכנס באותו יום קיבל
// בדיוק אותה מחרוזת**. העתקת עוגייה = גישה מלאה בלי סיסמה, ואי אפשר היה
// לנתק אדם אחד בלי להחליף סיסמה לכולם.
//
// עכשיו: `<sessionId>.<hmac>` — המזהה אקראי (32 בייטים) ונשמר במסד כ-hash.
//
// ⚠️ החתימה נשארת: טוקן מזויף נדחה לפני שאילתה כלשהי, כך שהמסד אינו
// נחשף לניחושים. השאילתה רצה רק על טוקן שכבר הוכיח שנחתם אצלנו.
//
// ⚠️ טביעת-הסיסמה נשארת בחתימה: החלפת סיסמה עדיין פוסלת את כל הסשנים
// בבת אחת — זו הייתה תכונה נכונה, והיא לא אבדה.
// ─────────────────────────────────────────────────────────────────────────────

export type PortalKind = 'loans' | 'distributions'

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** hash של מזהה הסשן — רק הוא נשמר. ראו ההערה במיגרציה. */
const hashOf = (sessionId: string) => createHash('sha256').update(sessionId).digest('hex')

export interface IssuedSession {
  token: string
  sessionId: string
}

/**
 * פותח סשן חדש ומחזיר את הטוקן לעוגייה.
 *
 * ⚠️ נכשל-פתוח בכוונה: אם רישום הסשן נכשל (למשל המיגרציה טרם רצה),
 * מוחזר טוקן חתום בלי שורה במסד — והאימות ייפול לאחור למסלול הישן.
 * חסימת כניסה בגלל תקלת רישום הייתה משביתה את הפורטל לכולם.
 */
export async function issueSession(
  portal: PortalKind,
  fingerprint: string,
  secret: string,
  daysValid: number,
  meta?: { userAgent?: string | null; ip?: string | null },
): Promise<IssuedSession> {
  const sessionId = randomBytes(32).toString('hex')
  const sig = createHmac('sha256', secret).update(`${portal}:${sessionId}:${fingerprint}`).digest('hex')
  const token = `${sessionId}.${sig}`

  try {
    const expires = new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000).toISOString()
    await adminClient().from('portal_sessions').insert({
      portal,
      token_hash: hashOf(sessionId),
      expires_at: expires,
      user_agent: meta?.userAgent?.slice(0, 400) ?? null,
      ip: meta?.ip?.slice(0, 60) ?? null,
    })
  } catch (e) {
    console.error(`[portal-sessions] רישום סשן ${portal} נכשל:`, e instanceof Error ? e.message : e)
  }

  return { token, sessionId }
}

/**
 * מאמת טוקן סשן. מחזיר false גם לסשן שנותק או פג.
 *
 * ⚠️ סדר הבדיקות: חתימה תחילה (זול, ולא נוגע במסד), ורק אז השאילתה.
 * ⚠️ נכשל-**סגור** בשגיאת מסד: טוקן שאיננו יכולים לאמת אינו תקף. זה
 * ההפך מ-issueSession, ובכוונה — שם הסיכון הוא נעילה החוצה, כאן הסיכון
 * הוא כניסה לא מורשית.
 */
export async function verifySession(
  portal: PortalKind,
  token: string,
  fingerprint: string,
  secret: string,
): Promise<boolean> {
  const dot = token.indexOf('.')
  if (dot < 0) return false
  const sessionId = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!sessionId || !sig) return false

  const expected = createHmac('sha256', secret).update(`${portal}:${sessionId}:${fingerprint}`).digest('hex')
  if (sig.length !== expected.length) return false
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false

  try {
    const { data, error } = await adminClient()
      .from('portal_sessions')
      .select('id, expires_at, revoked_at')
      .eq('portal', portal)
      .eq('token_hash', hashOf(sessionId))
      .maybeSingle()

    // ⚠️ טבלה חסרה (המיגרציה טרם רצה) — לא חוסמים. החתימה כבר אומתה,
    // כלומר הטוקן נוצר אצלנו; דחייתו הייתה מנתקת את כל המשתמשים ברגע
    // הפריסה, לפני שהמיגרציה הורצה.
    if (error) {
      console.error(`[portal-sessions] אימות ${portal} נכשל:`, error.message)
      return error.code === '42P01'
    }
    if (!data) return false
    if (data.revoked_at) return false
    if (new Date(data.expires_at).getTime() < Date.now()) return false

    // ⚠️ last_seen מתעדכן ללא await: הוא נועד למסך הניהול בלבד, ואין סיבה
    // שכל בקשה לפורטל תמתין לכתיבה הזו.
    //
    // 🔴 עטוף ב-try משלו: כישלון בעדכון *תיעוד* לעולם אינו רשאי לפסול סשן
    // תקין. בלי זה חריגה כאן הייתה נופלת ל-catch החיצוני ומחזירה false —
    // כלומר ניתוק משתמש מאומת בגלל שורת סטטיסטיקה.
    try {
      void adminClient().from('portal_sessions')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', data.id)
        .then(undefined, () => { /* תיעוד בלבד */ })
    } catch { /* תיעוד בלבד */ }

    return true
  } catch (e) {
    console.error(`[portal-sessions] אימות ${portal} קרס:`, e instanceof Error ? e.message : e)
    return false
  }
}

/** ניתוק הסשן הנוכחי (יציאה מרצון). */
export async function revokeSessionByToken(portal: PortalKind, token: string): Promise<void> {
  const dot = token.indexOf('.')
  if (dot < 0) return
  const sessionId = token.slice(0, dot)
  if (!sessionId) return
  try {
    await adminClient().from('portal_sessions')
      .update({ revoked_at: new Date().toISOString(), revoked_by: 'self' })
      .eq('portal', portal)
      .eq('token_hash', hashOf(sessionId))
  } catch { /* יציאה לא נכשלת בגלל תיעוד */ }
}

export interface PortalSessionRow {
  id: string
  createdAt: string
  lastSeenAt: string
  expiresAt: string
  userAgent: string | null
  ip: string | null
}

/** הסשנים הפעילים — למסך הניהול. */
export async function listActiveSessions(portal: PortalKind): Promise<PortalSessionRow[]> {
  try {
    const { data } = await adminClient()
      .from('portal_sessions')
      .select('id, created_at, last_seen_at, expires_at, user_agent, ip')
      .eq('portal', portal)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('last_seen_at', { ascending: false })
      .limit(100)
    return (data ?? []).map(r => ({
      id: String(r.id),
      createdAt: String(r.created_at),
      lastSeenAt: String(r.last_seen_at),
      expiresAt: String(r.expires_at),
      userAgent: r.user_agent as string | null,
      ip: r.ip as string | null,
    }))
  } catch { return [] }
}

/** ניתוק סשן יחיד מהניהול — בלי לגעת באחרים. */
export async function revokeSession(id: string, by: string): Promise<boolean> {
  try {
    const { error } = await adminClient().from('portal_sessions')
      .update({ revoked_at: new Date().toISOString(), revoked_by: by.slice(0, 120) })
      .eq('id', id)
    return !error
  } catch { return false }
}

/** ניתוק כל הסשנים בפורטל — "נתק את כולם". */
export async function revokeAllSessions(portal: PortalKind, by: string): Promise<number> {
  try {
    const { data, error } = await adminClient().from('portal_sessions')
      .update({ revoked_at: new Date().toISOString(), revoked_by: by.slice(0, 120) })
      .eq('portal', portal)
      .is('revoked_at', null)
      .select('id')
    return error ? 0 : (data?.length ?? 0)
  } catch { return 0 }
}
