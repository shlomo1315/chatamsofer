import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'

// ─────────────────────────────────────────────────────────────────────────────
// אימות חתימת Svix — התקן ש-Resend (וגם Stripe/GitHub וכו') משתמשים בו.
//
// למה חתימה ולא "סוד סטטי בכותרת":
//   • סוד סטטי שדולף — שמיש לנצח.
//   • חתימה — תקפה 5 דקות בלבד, ומשתנה בכל בקשה. גם אם תוקף מקליט בקשה
//     אמיתית, הוא לא יכול לשדר אותה שוב מאוחר יותר (replay).
//
// כתובת ה-webhook עצמה אינה סוד — האבטחה כולה נשענת על החתימה.
// ─────────────────────────────────────────────────────────────────────────────

const TOLERANCE_SEC = 300 // 5 דקות — חלון ההגנה מפני replay

/**
 * מאמת חתימת Svix.
 *
 * @param rawBody גוף הבקשה כטקסט גולמי — חייב להיות בדיוק כפי שהתקבל,
 *                לפני JSON.parse. כל שינוי (אפילו רווח) ישבור את החתימה.
 */
export function verifySvixSignature(
  request: NextRequest,
  rawBody: string,
  secret: string,
): boolean {
  const id = request.headers.get('svix-id')
  const timestamp = request.headers.get('svix-timestamp')
  const signature = request.headers.get('svix-signature')

  if (!id || !timestamp || !signature) return false

  // הגנה מפני replay — בקשה ישנה נדחית
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > TOLERANCE_SEC) return false

  // הסוד מגיע בפורמט "whsec_<base64>"
  let key: Buffer
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  } catch {
    return false
  }
  if (!key.length) return false

  const expected = createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64')

  // הכותרת עשויה להכיל כמה חתימות מופרדות ברווח ("v1,aaa v1,bbb") —
  // מספיק שאחת מהן תואמת (מאפשר סבב מפתחות ללא downtime)
  for (const part of signature.split(' ')) {
    const sig = part.split(',')[1]
    if (!sig) continue
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    // timingSafeEqual — עמיד להתקפות timing (השוואה רגילה מדליפה מידע)
    if (a.length === b.length && timingSafeEqual(a, b)) return true
  }

  return false
}

/** האם הבקשה נושאת כותרות Svix בכלל (כדי להחליט איזו שיטת אימות להפעיל). */
export function hasSvixHeaders(request: NextRequest): boolean {
  return Boolean(request.headers.get('svix-signature'))
}

/** השוואת סודות בזמן קבוע — למסלול הישן (סוד סטטי בכותרת). */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}
