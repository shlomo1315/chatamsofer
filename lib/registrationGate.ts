import type { SupabaseClient } from '@supabase/supabase-js'

// נוסח ברירת המחדל כשההרשמה סגורה ולא הוזנה סיבה מותאמת.
export const DEFAULT_CLOSED_MESSAGE = 'ההרשמה למערכת סגורה כעת. לפרטים ניתן לפנות למזכירות.'

// שער ההרשמה הציבורית — נשלט דרך app_settings:
//   public_registration_open:    'true'/'false'  (ברירת מחדל: סגור)
//   registration_bypass_code:     קוד סודי שמאפשר הרשמה גם כשסגור (לטסטים)
//   registration_closed_message:  סיבת הסגירה שתוצג לגולשים במקום הנוסח הקבוע
//   email_verification_required:  האם חובה לאמת מייל ברישום (ברירת מחדל: כן)
export async function getRegistrationGate(admin: SupabaseClient): Promise<{
  open: boolean; bypassCode: string; closedMessage: string; emailVerificationRequired: boolean
}> {
  const { data } = await admin.from('app_settings').select('key, value')
    .in('key', [
      'public_registration_open', 'registration_bypass_code',
      'registration_closed_message', 'email_verification_required',
    ])
  const map = new Map((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]))
  const raw = map.get('public_registration_open')
  const open = raw === 'true' || raw === true
  const bypassCode = String(map.get('registration_bypass_code') ?? '')
  const closedMessage = String(map.get('registration_closed_message') ?? '').trim()
  // ⚠️ ברירת המחדל היא *חובה*. היעדר הרשומה (וגם כשל בקריאה) חייב להשאיר את
  // האימות דלוק — כיבוי בטעות בגלל ערך חסר הוא בדיוק סוג התקלה השקטה שקשה
  // לגלות: הרישום ימשיך לעבוד, ואיש לא ישים לב שהמיילים חדלו להיות מאומתים.
  const evr = map.get('email_verification_required')
  const emailVerificationRequired = !(evr === 'false' || evr === false)
  return { open, bypassCode, closedMessage, emailVerificationRequired }
}

// האם מותר להירשם — פתוח לכולם, או סגור אך הוצג קוד עוקף תקין.
export function registrationAllowed(gate: { open: boolean; bypassCode: string }, providedCode: string | null | undefined): boolean {
  if (gate.open) return true
  return !!gate.bypassCode && String(providedCode ?? '') === gate.bypassCode
}
