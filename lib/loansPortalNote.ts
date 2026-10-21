// נרמול הערת הפורטל להלוואה: חיתוך רווחים, תקרת אורך, וריק => null.
export const PORTAL_NOTE_MAX = 500

export function normalizePortalNote(input: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (input === null || input === undefined) return { ok: true, value: null }
  if (typeof input !== 'string') return { ok: false, error: 'ההערה חייבת להיות טקסט' }
  const v = input.trim()
  if (v.length > PORTAL_NOTE_MAX) return { ok: false, error: `ההערה ארוכה מדי (עד ${PORTAL_NOTE_MAX} תווים)` }
  return { ok: true, value: v || null }
}
