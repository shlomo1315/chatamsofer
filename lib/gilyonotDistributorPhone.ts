// ─────────────────────────────────────────────────────────────
// שלוחת המפיצים: שמות המשתנים והטיפוסים המשותפים. הזרימה עצמה בטכנוליין,
// ב-lib/telephony/distributors.
// ─────────────────────────────────────────────────────────────

export const DM_PICK = 'dm_pick'
export const DM_MENU = 'dm_menu'
export const DM_QTY = 'dm_qty'
export const DM_LEAVE = 'dm_leave'
export const DM_GUESTS = 'dm_guests'
export const DM_REC = 'dm_rec'
export const MAX_PICK = 9
export const MAX_GUESTS = 50

export interface PhoneDistributor { id: string; full_name: string; quantity: number; city: string | null; synagogue: string | null }

export interface PhoneContext {
  distributors: PhoneDistributor[]
  /** יש מספר מזוהה (לא חסוי) */
  hasPhone: boolean
  agentPhone: string | null
  agentOpen: boolean
}

export type RecordingPurpose = 'issue' | 'address' | 'note'

export type DistributorPhoneAction =
  | { kind: 'quantity'; distributorId: string; action: 'received' | 'increase' | 'decrease'; quantity: number }
  | { kind: 'leave'; distributorId: string }
  | { kind: 'recording'; distributorId: string; purpose: RecordingPurpose; path: string; transcript: string | null }
  | { kind: 'hilula'; distributorId: string | null; guests: number }
  | null
