import { normalizeDateToISO } from '@/lib/validation'
import { toHebrewDate } from '@/lib/hebrewDate'

// תיקון תאריך לידה מהאזור האישי: של הנרשם (birth_date) או של בת/בן הזוג (spouse_birth_date).
// משותף לשרת (ולידציה) ולמסך (תצוגה), כדי ששני הצדדים יקבלו ויציגו את אותם ערכים.
export type BirthDateWho = 'self' | 'spouse'
export const BIRTH_DATE_COLUMN: Record<BirthDateWho, 'birth_date' | 'spouse_birth_date'> = {
  self: 'birth_date', spouse: 'spouse_birth_date',
}
const MAX_AGE_YEARS = 120

export function isBirthDateWho(v: unknown): v is BirthDateWho {
  return v === 'self' || v === 'spouse'
}

// מחזיר ISO תקין, או הודעת שגיאה בעברית. לא מקבל תאריך עתידי או מלפני 120 שנה.
export function validateBirthDate(raw: unknown, today: Date = new Date()): { ok: true; iso: string } | { ok: false; error: string } {
  const iso = typeof raw === 'string' ? normalizeDateToISO(raw) : null
  if (!iso) return { ok: false, error: 'תאריך הלידה אינו תקין' }
  const todayIso = today.toISOString().slice(0, 10)
  if (iso > todayIso) return { ok: false, error: 'תאריך הלידה לא יכול להיות בעתיד' }
  const minIso = `${today.getUTCFullYear() - MAX_AGE_YEARS}${todayIso.slice(4)}`
  if (iso < minIso) return { ok: false, error: 'תאריך הלידה רחוק מדי. נא לבדוק את השנה' }
  return { ok: true, iso }
}

// תצוגה: "14.03.1985 · כ״א אדר תשמ״ה". ערך ריק או פגום מוחזר כ-null (המסך מציג "לא הוזן").
export function formatBirthDate(raw?: string | null): { greg: string; hebrew: string } | null {
  const iso = normalizeDateToISO(raw ? String(raw).slice(0, 10) : null)
  if (!iso) return null
  const [y, m, d] = iso.split('-')
  return { greg: `${d}.${m}.${y}`, hebrew: toHebrewDate(`${iso}T12:00:00Z`) }
}
