export type UserRole = 'admin' | 'secretary' | 'reviewer' | 'collections'

export type SectionKey = 'beneficiaries' | 'lineage' | 'maternity' | 'maternity_cards' | 'loans' | 'distributions' | 'reports' | 'widows' | 'financial_aid' | 'newsletter'
export type PermissionLevel = 'none' | 'view' | 'edit' | 'add'
export type UserPermissions = Partial<Record<SectionKey, PermissionLevel>>
export type EligibilityStatus = 'pending' | 'approved' | 'rejected' | 'review' | 'docs_pending'
export type Gender = 'male' | 'female'
export type LoanStatus = 'pending' | 'approved' | 'active' | 'completed' | 'rejected' | 'defaulted'
export type MaternityStatus = 'pending' | 'active' | 'completed' | 'cancelled'
export type CardLoadStatus = 'idle' | 'pending' | 'loaded' | 'failed' | 'unloaded'
export type CardStatus = 'pending' | 'approved' | 'rejected' | 'loaded' | 'awaiting_stock'
export type DistributionStatus = 'planning' | 'active' | 'completed' | 'cancelled'
export type DistributionRecipientStatus = 'pending' | 'received' | 'not_received'
export type NotificationType = 'info' | 'warning' | 'urgent' | 'reminder'
export type WidowRequestType = 'financial' | 'food' | 'general'
export type WidowRequestStatus = 'pending' | 'in_progress' | 'approved' | 'rejected'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: UserRole
  phone?: string
  is_active: boolean
  permissions?: UserPermissions
  mail_label_ids?: string[]
  mail_account?: string
  department?: string | null
  mail_only?: boolean
  allowed_mailboxes?: string[]
  created_at: string
}

export interface Family {
  id: string
  family_name: string
  notes?: string
  created_at: string
  updated_at: string
  beneficiaries?: Beneficiary[]
}

export interface Beneficiary {
  id: string
  id_number: string
  id_doc_type?: string
  family_name?: string
  full_name: string
  phone?: string
  phone2?: string
  // רשימת המספרים שאומתו (יכולים לקבל קוד כניסה בעתיד)
  verified_phones?: string[]
  email?: string
  address?: string
  city?: string
  birth_date?: string
  gender?: Gender
  family_id?: string
  marital_status?: string
  spouse_name?: string
  spouse_id_number?: string
  spouse_doc_type?: string
  spouse_birth_date?: string
  spouse_phone?: string
  lineage_node_id?: string
  lineage_manual?: string[]
  lineage_chain?: { generation: number; name: string; relation: 'son' | 'son_in_law' | null }[]
  children_count: number
  monthly_support?: number
  past_benefits?: {
    recovery_home?: boolean; food_card?: boolean; holiday_grant?: boolean; catering?: boolean
    loan?: boolean; loan_amount?: string; other?: boolean; other_details?: string; notes?: string
    update_topics?: string[]  // נושאים שהמבקש ביקש לקבל עליהם עדכונים שוטפים
  }
  children?: {
    name: string
    id_number: string | null
    gender: string | null
    birth_date: string | null
    doc_type?: string
    marital_status?: string
    // סטטוס לידה — מסומן רק עבור ילדים שנכנסו דרך תיק יולדת.
    // 'pending' = ממתין לאישור לידה · 'approved' = הלידה אושרה
    birth_status?: 'pending' | 'approved'
    maternity_aid_id?: string
  }[]
  eligibility_status: EligibilityStatus
  is_active: boolean
  notes?: string
  signature?: string | null
  rejection_reason?: string
  docs_notes?: string
  required_docs?: string
  nedarim_id?: string
  created_at: string
  updated_at: string
  family?: Family
}

export interface FamilyRelation {
  id: string
  person_id: string
  related_person_id: string
  relation_type: string
  document_verified: boolean
  verified_by?: string
  notes?: string
  created_at: string
  person?: Beneficiary
  related_person?: Beneficiary
}

export interface Document {
  id: string
  beneficiary_id: string
  doc_type: string
  file_url?: string
  file_name?: string
  verified: boolean
  verified_by?: string
  uploaded_at: string
}

export interface MaternityAid {
  id: string
  beneficiary_id: string
  birth_date: string
  baby_name?: string
  baby_id_type?: 'id' | 'passport'
  baby_id_number?: string
  baby_gender?: 'male' | 'female'
  // לידת תאומים — שני תינוקות בלידה אחת. babies מחזיק את כל התינוקות
  // (תינוק אחד בלידה רגילה, שניים בתאומים). baby_* = התינוק הראשון (תאימות לאחור).
  is_twins?: boolean
  babies?: { name?: string | null; gender?: 'male' | 'female' | null; id_type?: 'id' | 'passport'; id_number?: string | null }[]
  birth_certificate_url?: string
  // תאריך סיום הזכאות האפקטיבי (ברירת מחדל: לידה + 6 שבועות; ניתן להארכה ידנית)
  six_weeks_end?: string
  // הארכת זכאות ידנית — חורגת מ-6 השבועות במקרים חריגים
  eligibility_extended?: boolean
  eligibility_extended_at?: string
  eligibility_extension_reason?: string
  card_number?: string
  // מוגדר רק כששיוך הכרטיס בנדרים הושלם בפועל (דרך שיחת ימות) — משמש כאינדיקציה "שויך כרטיס"
  card_picked_up_at?: string
  card_balance: number
  card_loaded_at?: string
  card_expires_at?: string
  card_load_status?: CardLoadStatus
  card_load_amount?: number
  card_tlush_id?: string
  card_load_error?: string
  card_unloaded_at?: string
  weekly_amount: number
  total_weeks: number
  recovery_home?: string
  recovery_from?: string
  recovery_to?: string
  recovery_arrived?: boolean | null
  recovery_arrived_at?: string
  recovery_arrived_by?: string
  recovery_amount?: number
  recovery_amount_status?: string
  recovery_amount_at?: string
  recovery_nights?: number
  recovery_receipt_number?: string
  recovery_receipt_url?: string
  recovery_locked?: boolean
  recovery_edit_requested_at?: string
  // ימי הזכאות של היולדת בבית ההחלמה שאושרו (ברירת מחדל: רגילה=2 · תאומים=4; ניתן לעריכה ידנית)
  recovery_eligibility_days?: number
  status: MaternityStatus
  // 'live' = לידה רגילה (ברירת מחדל) · 'silent' = לידה שקטה
  birth_type?: 'live' | 'silent'
  card_status?: CardStatus
  card_center_id?: string
  approved_by?: string
  notes?: string
  created_at: string
  updated_at: string
  beneficiary?: Beneficiary
}

// מוקד חלוקת כרטיסי מזון. remaining/approved/loaded מחושבים בצד שרת.
export interface CardCenter {
  id: string
  name: string
  stock: number
  is_active: boolean
  notes?: string
  city?: string
  address?: string
  pickup_days?: string | null
  pickup_hours?: string | null
  created_at: string
  updated_at: string
  approved?: number   // אושרו וטרם נטענו
  loaded?: number     // נטענו (נוכו מהמלאי)
  remaining?: number  // נשאר פיזית = stock - loaded
  available?: number  // פנוי לאישור = stock - approved - loaded
  waiting?: number    // משפחות שממתינות לקבל כרטיס במוקד זה (אין מלאי)
}

export interface Loan {
  id: string
  beneficiary_id: string
  amount: number
  approved_amount?: number | null
  installments: number
  monthly_payment: number
  purpose?: string
  purpose_details?: string
  declaration?: string
  document_urls?: { url: string; name: string }[]
  status: LoanStatus
  approved_by?: string
  start_date?: string
  end_date?: string
  disbursed_at?: string | null
  disbursed_by?: string | null
  notes?: string
  created_at: string
  updated_at: string
  beneficiary?: Beneficiary
}

export interface LoanPayment {
  id: string
  loan_id: string
  amount: number
  paid_at: string
  payment_method?: string
  is_late: boolean
  recorded_by?: string
  notes?: string
}

export interface Distribution {
  id: string
  name: string
  holiday?: string
  description?: string
  criteria?: Record<string, unknown>
  total_budget?: number
  status: DistributionStatus
  distribution_date?: string
  created_by?: string
  created_at: string
  updated_at: string
  recipients?: DistributionRecipient[]
}

export interface DistributionRecipient {
  id: string
  distribution_id: string
  family_id?: string
  beneficiary_id?: string
  amount?: number
  item_description?: string
  received_at?: string
  status: DistributionRecipientStatus
  family?: Family
  beneficiary?: Beneficiary
}

export interface ActivityLog {
  id: string
  user_id?: string
  action: string
  entity_type?: string
  entity_id?: string
  details?: Record<string, unknown>
  created_at: string
  user?: Profile
}

export interface Notification {
  id: string
  user_id?: string
  title: string
  message?: string
  type: NotificationType
  is_read: boolean
  created_at: string
}

export interface DashboardStats {
  total_beneficiaries: number
  pending_approvals: number
  active_loans: number
  maternity_active: number
  distributions_planned: number
  total_loan_amount: number
}

export interface WidowRequest {
  id: string
  beneficiary_id: string
  request_type: WidowRequestType
  description?: string
  amount?: number
  status: WidowRequestStatus
  notes?: string
  reviewed_by?: string
  reviewed_at?: string
  created_at: string
  updated_at: string
  beneficiary?: Beneficiary
}

export const WIDOW_REQUEST_TYPE_LABELS: Record<WidowRequestType, string> = {
  financial: 'קרן סיוע כספי',
  food: 'סיוע במזון / שוברים',
  general: 'בקשת עזרה כללית',
}

export const WIDOW_REQUEST_STATUS_LABELS: Record<WidowRequestStatus, string> = {
  pending: 'ממתין לטיפול',
  in_progress: 'בטיפול',
  approved: 'אושר',
  rejected: 'נדחה',
}

export const WIDOW_REQUEST_STATUS_COLORS: Record<WidowRequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

// ─── תמיכות אלמנות (לוג תשלומים לתיק משפחה) ───
export type WidowSupportType = 'one_time' | 'monthly' | 'holiday' | 'medical' | 'food' | 'other'

export interface WidowSupportPayment {
  id: string
  beneficiary_id: string
  amount: number
  paid_at: string
  type: WidowSupportType
  note?: string
  created_at: string
}

export const WIDOW_SUPPORT_TYPE_LABELS: Record<WidowSupportType, string> = {
  one_time: 'חד-פעמי',
  monthly: 'קצבה חודשית',
  holiday: 'חג',
  medical: 'רפואי',
  food: 'מזון',
  other: 'אחר',
}

// ─── סיוע כספי ───
export type FinancialAidStatus = 'pending' | 'awaiting_decision' | 'approved' | 'rejected'

export interface FinancialAidRequest {
  id: string
  beneficiary_id: string
  reason?: string
  document_url?: string
  document_name?: string
  status: FinancialAidStatus
  amount?: number
  decision_email?: string
  gmail_thread_id?: string
  gmail_message_id?: string
  sent_to_decision_at?: string
  decision_reply?: string
  decision_replied_at?: string
  reviewed_by?: string
  notes?: string
  created_at: string
  updated_at: string
  beneficiary?: Beneficiary
}

export const FINANCIAL_AID_STATUS_LABELS: Record<FinancialAidStatus, string> = {
  pending: 'ממתין לטיפול',
  awaiting_decision: 'נשלח לגורם מאשר',
  approved: 'מאושר',
  rejected: 'נדחה',
}

export const FINANCIAL_AID_STATUS_COLORS: Record<FinancialAidStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  awaiting_decision: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'מנהל',
  secretary: 'מזכירות',
  reviewer: 'בודק',
  collections: 'גבייה',
}

export const ELIGIBILITY_LABELS: Record<EligibilityStatus, string> = {
  pending: 'ממתין לאישור ראשוני',
  approved: 'מאושר',
  rejected: 'נדחה',
  review: 'ממתין לאישור מסמכים',
  docs_pending: 'השלמת מסמכים',
}

export const LOAN_STATUS_LABELS: Record<LoanStatus, string> = {
  pending: 'ממתין',
  approved: 'מאושר',
  active: 'פעיל',
  completed: 'הושלם',
  rejected: 'נדחה',
  defaulted: 'בפיגור',
}

export const MATERNITY_STATUS_LABELS: Record<MaternityStatus, string> = {
  pending: 'ממתין',
  active: 'פעיל',
  completed: 'הושלם',
  cancelled: 'בוטל',
}

export const CARD_LOAD_STATUS_LABELS: Record<CardLoadStatus, string> = {
  idle: 'לא הוטען',
  pending: 'בתהליך…',
  loaded: 'הוטען',
  failed: 'נכשל',
  unloaded: 'נפרק',
}

export const DISTRIBUTION_STATUS_LABELS: Record<DistributionStatus, string> = {
  planning: 'בתכנון',
  active: 'פעיל',
  completed: 'הושלם',
  cancelled: 'בוטל',
}

export const GENDER_LABELS: Record<Gender, string> = {
  male: 'זכר',
  female: 'נקבה',
}

export const RELATION_TYPES = [
  'אב',
  'אם',
  'בן',
  'בת',
  'אח',
  'אחות',
  'דוד',
  'דודה',
  'בן דוד',
  'בת דוד',
  'סבא',
  'סבתא',
  'נכד',
  'נכדה',
  'גיסה',
  'גיס',
  'חם',
  'חמות',
  'חתן',
  'כלה',
]

export const MARITAL_STATUS_OPTIONS = [
  'רווק/ה',
  'נשוי/אה',
  'גרוש/ה',
  'אלמן/ה',
]

export const HOLIDAY_OPTIONS = [
  'ראש השנה',
  'סוכות',
  'חנוכה',
  'פורים',
  'פסח',
  'שבועות',
  'ט"ו בשבט',
  'חג המולד',
  'אחר',
]

export const CITY_OPTIONS = [
  'ירושלים',
  'תל אביב',
  'חיפה',
  'ראשון לציון',
  'פתח תקווה',
  'אשדוד',
  'נתניה',
  'בני ברק',
  'חולון',
  'באר שבע',
  'אחר',
]
