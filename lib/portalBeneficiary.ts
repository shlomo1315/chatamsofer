import type { SupabaseClient } from '@supabase/supabase-js'

// שדות המוטב שנשלחים לאזור האישי לאחר אימות (זהה לפלט הכניסה הקודם).
export const BENEFICIARY_SELECT =
  'id, full_name, family_name, eligibility_status, is_active, phone, phone2, spouse_phone, verified_phones, email, city, address, id_number, id_doc_type, spouse_name, spouse_id_number, marital_status, children_count, required_docs, children, lineage_node_id, lineage_manual, lineage_chain, created_at'

// מסמכי הזהות שכבר הועלו — להצגה בכניסה חוזרת במקום בקשת העלאה מחדש.
export async function loadDashboardDocs(
  admin: SupabaseClient,
  beneficiaryId: string,
): Promise<Record<string, { url: string; name: string }>> {
  const { data: docs } = await admin
    .from('documents')
    .select('doc_type, file_url, file_name, uploaded_at')
    .eq('beneficiary_id', beneficiaryId)
    .in('doc_type', ['id_husband', 'id_wife'])
    .order('uploaded_at', { ascending: false })
  const documents: Record<string, { url: string; name: string }> = {}
  for (const d of docs ?? []) {
    if (!documents[d.doc_type] && d.file_url) {
      documents[d.doc_type] = { url: d.file_url, name: d.file_name ?? 'מסמך' }
    }
  }
  return documents
}

// מנרמל ת"ז/דרכון מתוך גוף הבקשה.
export function normalizeId(idType: unknown, id: unknown): string {
  return idType === 'passport' ? String(id ?? '').trim() : String(id ?? '').replace(/\D/g, '')
}

// מאתר מוטב לפי המזהה שהוזן: קודם לפי ת"ז הרשומה (הבעל/הרשום), ואם לא נמצא —
// לפי ת"ז בן/בת הזוג (spouse_id_number) עבור משפחה בסטטוס "נשואים" בלבד.
// כך גם הקלדת ת"ז האישה מזהה ומאפשרת כניסה לאותה כרטסת משפחה.
export async function resolveBeneficiaryByEnteredId<T = Record<string, unknown>>(
  admin: SupabaseClient,
  idNumber: string,
  select: string,
): Promise<T | null> {
  const byId = await admin.from('beneficiaries').select(select).eq('id_number', idNumber).maybeSingle()
  if (byId.data) return byId.data as T
  const bySpouse = await admin
    .from('beneficiaries')
    .select(select)
    .eq('spouse_id_number', idNumber)
    .ilike('marital_status', 'נשו%')
    .maybeSingle()
  return (bySpouse.data as T | null) ?? null
}
