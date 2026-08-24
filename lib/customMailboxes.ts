import type { SupabaseClient } from '@supabase/supabase-js'
import type { Department } from './departments'

// ─────────────────────────────────────────────────────────────────────────────
// תיבות מייל שנוספו מהממשק, בנוסף למחלקות הקבועות בקוד.
//
// 🔴 DEPARTMENTS הוא קבוע בקוד: הוספת כתובת חדשה חייבה שינוי קוד ופריסה.
// המשמעות המעשית — אי אפשר היה להפעיל מענה אוטומטי לכתובת חדשה בלי
// מפתח. התיבות כאן נשמרות ב-app_settings ומצטרפות לרשימה בזמן ריצה.
//
// ⚠️ app_settings.value היא עמודת text — חובה JSON.stringify. שמירת
// אובייקט גולמי נכשלת *בשקט* ומאחסנת "[object Object]".
// ─────────────────────────────────────────────────────────────────────────────

export const CUSTOM_MAILBOXES_KEY = 'custom_mailboxes'

/** תיבה שנוספה מהממשק. מפתחה תמיד בקידומת custom_ כדי שלא יתנגש בקבועות. */
export interface CustomMailbox {
  key: string
  label: string
  email: string
  color: string
}

export const CUSTOM_PREFIX = 'custom_'

/** ברירת מחדל לצבע תווית — כשלא נבחר. */
const DEFAULT_COLOR = '#64748b'

/**
 * ⚠️ ולידציה מינימלית אך הכרחית: כתובת פגומה נכנסת לרשימת הניתוב ואז
 * כל מייל שמגיע אליה לא מזוהה — בלי שום שגיאה גלויה.
 */
export function isValidMailbox(m: Partial<CustomMailbox>): boolean {
  const email = (m.email ?? '').trim()
  const label = (m.label ?? '').trim()
  if (!email || !label) return false
  // כתובת פשוטה: יש @ ונקודה בדומיין, בלי רווחים
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false
  return true
}

/** מייצר מפתח יציב מהכתובת. ⚠️ יציב — שינוי מפתח מנתק את ההגדרות שנשמרו. */
export function mailboxKeyFor(email: string): string {
  const local = email.trim().toLowerCase().split('@')[0] ?? ''
  const safe = local.replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  return `${CUSTOM_PREFIX}${safe || 'box'}`
}

/** נרמול רשומה אחת שנטענה מהמסד. */
function normalize(raw: unknown): CustomMailbox | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Partial<CustomMailbox>
  const email = (m.email ?? '').trim()
  const label = (m.label ?? '').trim()
  if (!isValidMailbox({ email, label })) return null
  return {
    key: (m.key ?? '').trim() || mailboxKeyFor(email),
    label,
    email: email.toLowerCase(),
    color: (m.color ?? '').trim() || DEFAULT_COLOR,
  }
}

/** טוען את התיבות המותאמות. לעולם אינו זורק — תיבה פגומה מדולגת. */
export async function loadCustomMailboxes(db: SupabaseClient): Promise<CustomMailbox[]> {
  try {
    const { data } = await db
      .from('app_settings')
      .select('value')
      .eq('key', CUSTOM_MAILBOXES_KEY)
      .maybeSingle()

    const raw = (data as { value?: string } | null)?.value
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const out: CustomMailbox[] = []
    const seen = new Set<string>()
    for (const item of parsed) {
      const m = normalize(item)
      // ⚠️ כתובת כפולה מדולגת: שתי תיבות לאותה כתובת היו מייצרות שני
      // מענים אוטומטיים לאותו מייל נכנס.
      if (!m || seen.has(m.email)) continue
      seen.add(m.email)
      out.push(m)
    }
    return out
  } catch {
    return []
  }
}

/** שומר את הרשימה. מחזיר את הרשימה המנורמלת שנשמרה בפועל. */
export async function saveCustomMailboxes(
  db: SupabaseClient,
  list: Partial<CustomMailbox>[],
): Promise<CustomMailbox[]> {
  const clean: CustomMailbox[] = []
  const seen = new Set<string>()
  for (const item of list) {
    const m = normalize(item)
    if (!m || seen.has(m.email)) continue
    seen.add(m.email)
    clean.push(m)
  }

  await db.from('app_settings').upsert(
    {
      key: CUSTOM_MAILBOXES_KEY,
      value: JSON.stringify(clean),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
  return clean
}

/** ממיר תיבה מותאמת לצורת Department, לשילוב ברשימה אחת. */
export function asDepartment(m: CustomMailbox): Department {
  return {
    // ⚠️ ה-key חורג מ-DepartmentKey בכוונה: הטיפוס סגור על המחלקות
    // הקבועות, והתיבות המותאמות חיות לצדו בזמן ריצה בלבד.
    key: m.key as Department['key'],
    label: m.label,
    email: m.email,
    color: m.color,
    // תיבת דואר בלבד — אינה מחלקה ארגונית שניתן לשייך אליה איש צוות.
    mailboxOnly: true,
  }
}
