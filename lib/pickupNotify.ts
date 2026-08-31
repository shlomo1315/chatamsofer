// ─────────────────────────────────────────────────────────────────────────────
// מי מקבל הודעה שהכרטיס מוכן לאיסוף.
//
// 🔴 ההודעה אומרת "הכרטיס מוכן". משפחה שתקבל אותה בלי שנטען לה כרטיס
// תיסע למוקד ותחזור ריקם — ולכן הזכאות היא **נטען בפועל**, ולא
// "מאושר" או "בחר מוקד".
//
// ⚠️ אין שוברים. ההודעה הזו היא כל מה שהמשפחה מקבלת, ולכן היא נשלחת
// גם בטלפון (צינתוק) וגם במייל — מי שאין לו אחד מהם עדיין מקבל את השני.
//
// ⚠️ הפעולה חוזרת: מריצים אותה שוב אחרי כל טעינה נוספת. notified_at
// הוא מה שמונע צינתוק שני לאותה משפחה — ומי שמקבל צינתוק שלישי
// מתקשר למשרד לברר אם משהו השתבש.
// ─────────────────────────────────────────────────────────────────────────────

export interface NotifyCandidate {
  id: string
  load_status: string | null
  center_id: string | null
  phone: string | null
  email: string | null
  /** מתי כבר נשלחה הודעה. null = טרם. */
  notified_at: string | null
}

export interface NotifyTarget {
  id: string
  /** מנוקה מספרות בלבד. */
  phone?: string
  email?: string
}

export interface NotifyScope {
  /** מי יקבל צינתוק. */
  phone: NotifyTarget[]
  /** מי יקבל מייל. */
  email: NotifyTarget[]
  skipped: {
    notLoaded: number
    noCenter: number
    alreadyNotified: number
    badPhone: number
    /** אין טלפון ואין מייל — אי אפשר להודיע כלל. */
    noContact: number
  }
}

/**
 * מספר טלפון ישראלי תקין.
 *
 * ⚠️ 9 או 10 ספרות המתחילות ב-0. מספר קצר מזה הוא שארית הקלדה,
 * וצינתוק אליו נכשל ממילא — עדיף לדעת מראש כמה נופלים.
 */
function cleanPhone(raw: string | null | undefined): string | null {
  const d = String(raw ?? '').replace(/\D/g, '')
  if (!/^0\d{8,9}$/.test(d)) return null
  return d
}

export function scopeNotify(
  rows: NotifyCandidate[],
  opts: { onlyIds?: Set<string> } = {},
): NotifyScope {
  const skipped = { notLoaded: 0, noCenter: 0, alreadyNotified: 0, badPhone: 0, noContact: 0 }
  const phone: NotifyTarget[] = []
  const email: NotifyTarget[] = []

  for (const r of rows) {
    // ⚠️ הצמצום לבחירה קודם, אך אינו עוקף את הכללים שאחריו.
    if (opts.onlyIds && !opts.onlyIds.has(r.id)) continue

    // 🔴 נטען בפועל — ראו ההערה בראש הקובץ.
    if (r.load_status !== 'loaded') { skipped.notLoaded++; continue }

    // ⚠️ ההודעה נוקבת בשם המוקד; בלי מוקד אין מה לומר.
    if (!r.center_id) { skipped.noCenter++; continue }

    if (r.notified_at) { skipped.alreadyNotified++; continue }

    const ph = cleanPhone(r.phone)
    const em = String(r.email ?? '').trim()
    const hasEmail = em.includes('@')

    if (r.phone && !ph) skipped.badPhone++
    if (ph) phone.push({ id: r.id, phone: ph })
    if (hasEmail) email.push({ id: r.id, email: em })

    // ⚠️ נספר בנפרד: משפחה בלי שום דרך ליצור קשר לא תדע שהכרטיס
    // מחכה לה, וזה בדיוק מי שצריך טיפול ידני.
    if (!ph && !hasEmail) skipped.noContact++
  }

  return { phone, email, skipped }
}
