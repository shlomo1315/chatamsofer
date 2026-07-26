import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/apiAuth'

// ─────────────────────────────────────────────────────────────────────────────
// שער פתיחה/סגירה לכל מחלקה (אגף). נשלט מדף ההגדרות → "הגדרות בקשות".
// כשמחלקה סגורה — הטופס הציבורי, קישורי הטיוטות והמיילים האוטומטיים מתנהגים
// בהתאם (לא מקבלים בקשות חדשות). מאפשר "עליית אוויר" הדרגתית: בשלב ראשון רק
// יולדות פתוח, השאר סגור.
//
// נשמר ב-app_settings תחת מפתח 'department_gates' כ-JSON:
//   { maternity: 'open', gemach: 'closed', financial_aid: 'closed', widows: 'closed' }
// ─────────────────────────────────────────────────────────────────────────────

const GATES_KEY = 'department_gates'

// המחלקות שניתן לפתוח/לסגור. המפתחות תואמים לזרימות הבקשה בפורטל.
export const GATED_DEPARTMENTS = ['maternity', 'gemach', 'financial_aid', 'widows'] as const
export type GatedDepartment = (typeof GATED_DEPARTMENTS)[number]

export const DEPARTMENT_LABELS: Record<GatedDepartment, string> = {
  maternity: 'עזר יולדות',
  gemach: 'גמ"ח הלוואות',
  financial_aid: 'סיוע רפואי',
  widows: 'אלמנות ויתומים',
}

export type DepartmentGates = Record<GatedDepartment, boolean>

// ברירת המחדל של "עליית האוויר": רק יולדות פתוח, כל השאר סגור.
export const DEFAULT_GATES: DepartmentGates = {
  maternity: true,
  gemach: false,
  financial_aid: false,
  widows: false,
}

// קריאת מצב כל המחלקות. נופל לברירת המחדל אם אין הגדרה שמורה.
export async function getDepartmentGates(admin?: SupabaseClient): Promise<DepartmentGates> {
  const client = admin ?? getServiceClient()
  if (!client) return { ...DEFAULT_GATES }
  const { data } = await client.from('app_settings').select('value').eq('key', GATES_KEY).maybeSingle()
  const gates: DepartmentGates = { ...DEFAULT_GATES }
  if (data?.value) {
    try {
      const parsed = JSON.parse(data.value) as Record<string, unknown>
      for (const d of GATED_DEPARTMENTS) {
        // תמיכה בשני הפורמטים: boolean או 'open'/'closed'
        const v = parsed[d]
        if (v === true || v === 'open') gates[d] = true
        else if (v === false || v === 'closed') gates[d] = false
      }
    } catch { /* value אינו JSON — ברירת מחדל */ }
  }
  return gates
}

// האם מחלקה מסוימת פתוחה כרגע.
export async function isDepartmentOpen(dept: GatedDepartment, admin?: SupabaseClient): Promise<boolean> {
  const gates = await getDepartmentGates(admin)
  return gates[dept]
}

// שמירת מצב כל המחלקות (upsert).
export async function saveDepartmentGates(admin: SupabaseClient, gates: DepartmentGates): Promise<boolean> {
  // נשמר כ-'open'/'closed' לקריאוּת בבסיס הנתונים
  const value = JSON.stringify(
    Object.fromEntries(GATED_DEPARTMENTS.map(d => [d, gates[d] ? 'open' : 'closed'])),
  )
  const { error } = await admin.from('app_settings').upsert(
    { key: GATES_KEY, value, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  return !error
}

// הודעת "מחלקה סגורה" אחידה — לשימוש ב-API של הבקשות ובטופס.
export function departmentClosedMessage(dept: GatedDepartment): string {
  return `הגשת בקשות ל${DEPARTMENT_LABELS[dept]} אינה זמינה כעת במערכת. לפרטים ניתן לפנות למזכירות.`
}
