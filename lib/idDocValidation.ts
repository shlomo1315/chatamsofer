// ─────────────────────────────────────────────────────────────────────────────
// אימות ונרמול של מספר מזהה לפי סוגו — ת.ז. או דרכון.
//
// משמש את מסך עריכת הצאצא ואת השרת (api/admin/beneficiaries/update), כדי
// שמנהל ומזכירה יוכלו להחליף לכל אדם בין ת.ז. לדרכון בשני הכיוונים,
// והמספר ייבדק לפי הסוג החדש.
// ─────────────────────────────────────────────────────────────────────────────
import { validateIsraeliId } from '@/lib/validation'

export type DocType = 'id' | 'passport'

export const isDocType = (v: unknown): v is DocType => v === 'id' || v === 'passport'

/**
 * ת.ז. → ספרות בלבד. דרכון → כמו שהוקלד, בלי רווחים בקצוות.
 * ⚠️ כמו normalizeId ב-lib/portalBeneficiary: הכניסה לאזור האישי משווה דרכון
 * בדיוק, ולכן אסור לשנות כאן אותיות גדולות/קטנות.
 */
export function normalizeDocNumber(raw: string, t: DocType): string {
  return t === 'id' ? raw.replace(/\D/g, '') : raw.trim()
}

/** הודעת שגיאה, או null כשהמספר תקין לסוג. */
export function docNumberError(raw: string, t: DocType): string | null {
  if (t === 'id') return validateIsraeliId(raw) ? null : 'תעודת זהות ישראלית לא תקינה (כולל ספרת ביקורת)'
  return /^[A-Za-z0-9]{5,20}$/.test(normalizeDocNumber(raw, t)) ? null : 'מספר דרכון לא תקין (5 עד 20 אותיות באנגלית או ספרות)'
}

type Row = Record<string, unknown> | null | undefined

/**
 * אימות שדות המזהה במטען שמירה מול הרשומה הקיימת. נבדק רק זוג (מספר+סוג)
 * שהשתנה, כדי ששמירה של שדה אחר לא תיחסם בגלל ערך ישן. מנרמל את המספר במקום.
 */
export function checkDocFields(payload: Record<string, unknown>, current: Row): string | null {
  const pairs: [num: string, type: string, who: string][] = [
    ['id_number', 'id_doc_type', ''],
    ['spouse_id_number', 'spouse_doc_type', ' של האישה'],
  ]
  for (const [nk, tk, who] of pairs) {
    if (!(nk in payload) && !(tk in payload)) continue
    const t = tk in payload ? payload[tk] : (current?.[tk] ?? 'id')
    const num = nk in payload ? payload[nk] : current?.[nk]
    if (num == null || num === '') {
      if (tk in payload && t != null && !isDocType(t)) return `סוג מזהה${who} לא תקין`
      continue
    }
    if (!isDocType(t)) return `סוג מזהה${who} לא תקין`
    if (typeof num !== 'string') return `מספר מזהה${who} לא תקין`
    const unchanged = current && current[nk] === num && (current[tk] ?? 'id') === t
    if (unchanged) continue
    const err = docNumberError(num, t)
    if (err) return who ? `${err}${who}` : err
    if (nk in payload) payload[nk] = normalizeDocNumber(num, t)
  }
  return null
}
