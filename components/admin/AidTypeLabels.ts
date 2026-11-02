// תוויות משותפות לסוג הבקשה ולשיוך המבקש במחלקת סיוע.
export const AID_TYPE_LABELS: Record<string, string> = {
  medical: 'סיוע רפואי',
  widow: 'אלמנה',
  orphans: 'יתומים',
}

export const AID_TYPE_PILL: Record<string, string> = {
  medical: 'bg-red-50 text-red-700',
  widow: 'bg-sand text-navy-dark',
  orphans: 'bg-blue-50 text-blue-700',
}

export type AidAffiliation = 'registered' | 'unregistered_descendant' | 'external'

export const AID_AFFILIATION_LABELS: Record<AidAffiliation, string> = {
  registered: 'צאצא · רשום',
  unregistered_descendant: 'צאצא · לא רשום',
  external: 'לא רשום באיגוד',
}

// שיוך לפי הנתונים: יש משפחה מקושרת = רשום; אחרת לפי is_descendant.
export function aidAffiliation(r: { beneficiary_id?: string | null; is_descendant?: boolean | null }): AidAffiliation {
  if (r.beneficiary_id) return 'registered'
  return r.is_descendant === false ? 'external' : 'unregistered_descendant'
}
