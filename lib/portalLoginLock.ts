import { createClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// נעילת ניסיונות סיסמה בפורטלים המשותפים (/shared והלוואות), לפי כתובת IP.
// שגוי ראשון: נותרו 2. שני: נותר 1. שלישי: חסימה ל-3 שעות.
// אחרי 3 השעות, ניסיון שגוי אחד מאותו IP חוסם ל-24 שעות. סיסמה נכונה מאפסת.
// המצב במסד (portal_login_locks) כדי לשרוד פריסה ומספר מופעי שרת.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_FAILS = 3
export const SHORT_BLOCK_MS = 3 * 60 * 60 * 1000
export const LONG_BLOCK_MS = 24 * 60 * 60 * 1000

export type LockState = { fails: number; level: number; blockedUntil: number | null }
export const EMPTY_LOCK: LockState = { fails: 0, level: 0, blockedUntil: null }

export function isBlocked(s: LockState, now: number): boolean {
  return s.blockedUntil !== null && s.blockedUntil > now
}

/** מצב חדש אחרי ניסיון שגוי (לא נקרא בזמן חסימה פעילה). */
export function afterFailure(s: LockState, now: number): LockState {
  if (s.level >= 1) return { fails: 0, level: 2, blockedUntil: now + LONG_BLOCK_MS }
  const fails = s.fails + 1
  if (fails >= MAX_FAILS) return { fails: 0, level: 1, blockedUntil: now + SHORT_BLOCK_MS }
  return { fails, level: 0, blockedUntil: null }
}

export function formatWait(ms: number): string {
  const mins = Math.max(1, Math.ceil(ms / 60000))
  if (mins >= 120) return `${Math.ceil(mins / 60)} שעות`
  if (mins >= 60) return 'שעה'
  return `${mins} דקות`
}

export function blockedMessage(s: LockState, now: number): string {
  return `יותר מדי ניסיונות שגויים. הכניסה חסומה, נסה שוב בעוד ${formatWait((s.blockedUntil ?? now) - now)}.`
}

export function failureMessage(s: LockState, now: number): string {
  if (isBlocked(s, now)) {
    return `סיסמה שגויה. הכניסה נחסמה ל-${s.level >= 2 ? '24 שעות' : '3 שעות'}.`
  }
  const left = MAX_FAILS - s.fails
  return left === 1 ? 'סיסמה שגויה, נותר לך עוד ניסיון אחד' : `סיסמה שגויה, נותרו לך עוד ${left} ניסיונות`
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase not configured')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function load(scope: string, ip: string): Promise<LockState> {
  const { data } = await adminClient()
    .from('portal_login_locks').select('fails, level, blocked_until').eq('scope', scope).eq('ip', ip).maybeSingle()
  if (!data) return EMPTY_LOCK
  return { fails: data.fails, level: data.level, blockedUntil: data.blocked_until ? Date.parse(data.blocked_until) : null }
}

async function save(scope: string, ip: string, s: LockState) {
  await adminClient().from('portal_login_locks').upsert({
    scope, ip, fails: s.fails, level: s.level,
    blocked_until: s.blockedUntil ? new Date(s.blockedUntil).toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'scope,ip' })
}

/**
 * בודק סיסמה מול הנעילה. מחזיר null אם הסיסמה נכונה, אחרת הודעת שגיאה וסטטוס.
 * בזמן חסימה גם סיסמה נכונה נדחית.
 */
export async function guardedPasswordCheck(
  scope: string, ip: string, check: () => Promise<boolean>,
): Promise<{ error: string; status: number } | null> {
  const now = Date.now()
  const state = await load(scope, ip)
  if (isBlocked(state, now)) return { error: blockedMessage(state, now), status: 429 }
  if (await check()) {
    if (state.fails || state.level) await save(scope, ip, EMPTY_LOCK)
    return null
  }
  const next = afterFailure(state, now)
  await save(scope, ip, next)
  return { error: failureMessage(next, now), status: isBlocked(next, now) ? 429 : 401 }
}
