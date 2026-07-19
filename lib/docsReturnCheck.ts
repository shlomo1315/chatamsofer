import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// מעגל תיקונים — בדיקת השלמה.
// צאצא בסטטוס "השלמת מסמכים" (docs_pending) עובר ל"הוחזר תיקון — לבדיקה"
// (docs_returned) רק כשהשלים את *כל* מה שהמזכירות ביקשה: כל המסמכים שסומנו
// ב-required_docs קיימים ב-documents, ואם סומן שעץ הדורות דרוש תיקון — גם
// התיקון הוגש (lineage_fixed_at). ההחלטה מרוכזת כאן כדי ששלושת המסלולים
// (העלאת מסמכים / תיקון דורות / "הכול כבר קיים") יתנהגו זהה.
// ─────────────────────────────────────────────────────────────────────────────

export interface DocsReturnState {
  eligibility_status: string | null
  required_docs: string | null
  lineage_fix_required: boolean | null
  lineage_fixed_at: string | null
}

export function requiredDocKeys(requiredDocs: string | null | undefined): string[] {
  return (requiredDocs ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

/** האם הצאצא השלים את כל הנדרש? (טהורה — לבדיקות) */
export function isFixComplete(state: DocsReturnState, uploadedDocTypes: string[]): boolean {
  if (state.eligibility_status !== 'docs_pending') return false
  const uploaded = new Set(uploadedDocTypes)
  const docsDone = requiredDocKeys(state.required_docs).every(k => uploaded.has(k))
  const lineageDone = !state.lineage_fix_required || !!state.lineage_fixed_at
  return docsDone && lineageDone
}

/**
 * בודק מול ה-DB אם הצאצא השלים הכול, ואם כן מעביר ל-docs_returned.
 * מחזיר true אם הסטטוס הוחלף.
 */
export async function maybeMarkDocsReturned(admin: SupabaseClient, beneficiaryId: string): Promise<boolean> {
  const { data: ben } = await admin
    .from('beneficiaries')
    .select('id, eligibility_status, required_docs, lineage_fix_required, lineage_fixed_at')
    .eq('id', beneficiaryId)
    .maybeSingle()
  if (!ben || ben.eligibility_status !== 'docs_pending') return false

  const { data: docs } = await admin
    .from('documents')
    .select('doc_type')
    .eq('beneficiary_id', beneficiaryId)
  const uploaded = (docs ?? []).map(d => String(d.doc_type))

  if (!isFixComplete(ben as DocsReturnState, uploaded)) return false

  const { error } = await admin
    .from('beneficiaries')
    .update({
      eligibility_status: 'docs_returned',
      docs_returned_at: new Date().toISOString(),
      required_docs: '',
      updated_at: new Date().toISOString(),
    })
    .eq('id', beneficiaryId)
  return !error
}
