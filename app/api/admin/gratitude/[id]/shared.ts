import type { getServiceClient } from '@/lib/apiAuth'
import { recoveryDaysOf } from '@/lib/maternity'
import { DEPARTMENTS } from '@/lib/departments'
import { shell } from '@/lib/emailTemplates'

// עוזרים משותפים ל-endpoints של מכתב ברכה (צפייה / שליחה במייל).
// מרוכז כאן כדי שטעינת המכתב ובניית קלט השובר יהיו במקום אחד.

export type BenFull = {
  family_name?: string | null; full_name?: string | null; spouse_name?: string | null
  city?: string | null; address?: string | null
  id_number?: string | null; spouse_id_number?: string | null; email?: string | null
}

export type AidInfo = {
  birth_date?: string | null
  recovery_home?: string | null
  recovery_eligibility_days?: number | null
  is_twins?: boolean | null
  beneficiary?: BenFull | null
}

export interface GratitudeLetterRow {
  id: string
  body: string | null
  signature: string | null
  is_anonymous: boolean
  status: 'received' | 'approved' | 'rejected'
  created_at?: string | null
  sent_to_donor_at?: string | null
  sent_to_donor_email?: string | null
  aid: AidInfo | null
}

type Db = NonNullable<ReturnType<typeof getServiceClient>>

const SELECT =
  'id, body, signature, is_anonymous, status, created_at, sent_to_donor_at, sent_to_donor_email, ' +
  'aid:maternity_aids(birth_date, recovery_home, recovery_eligibility_days, is_twins, ' +
  'beneficiary:beneficiaries(family_name, full_name, spouse_name, city, address, id_number, spouse_id_number, email))'

export async function loadGratitudeLetter(db: Db, id: string): Promise<GratitudeLetterRow | null> {
  const { data } = await db.from('gratitude_letters').select(SELECT).eq('id', id).maybeSingle()
  return data as unknown as GratitudeLetterRow | null
}

/** פרטי הלידה מרשומת המכתב (Supabase מחזיר יחסים כמערך או אובייקט). */
export function aidOf(row: GratitudeLetterRow | null): AidInfo | null {
  const aid = row?.aid
  return (Array.isArray(aid) ? aid[0] : aid) as AidInfo | null
}

/** פרטי המשפחה מרשומת המכתב (Supabase מחזיר יחסים כמערך או אובייקט). */
export function benOf(row: GratitudeLetterRow | null): BenFull | null {
  const ben = aidOf(row)?.beneficiary
  return (Array.isArray(ben) ? ben[0] : ben) as BenFull | null
}

/** שם התצוגה של היולדת — "משפחה + שם" (או '' אם אין). */
export function motherDisplayName(row: GratitudeLetterRow | null): string {
  const b = benOf(row)
  if (!b) return ''
  return [b.family_name, b.spouse_name || b.full_name].filter(Boolean).join(' ') || ''
}

/** בונה את קלט השובר מרשומת מכתב הברכה — משותף לצפייה ולשליחה במייל. */
export function voucherInputFromRow(row: GratitudeLetterRow) {
  const ben = benOf(row)
  const aid = aidOf(row)
  const days = aid ? recoveryDaysOf({
    recovery_eligibility_days: aid.recovery_eligibility_days, is_twins: aid.is_twins,
  }) : undefined
  return {
    mode: 'filled' as const,
    body: row.body ?? '',
    familyName: ben?.family_name ?? undefined,
    husbandName: ben?.full_name ?? undefined,
    wifeName: ben?.spouse_name ?? undefined,
    city: ben?.city ?? undefined,
    street: ben?.address ?? undefined,
    husbandId: ben?.id_number ?? undefined,
    wifeId: ben?.spouse_id_number ?? undefined,
    recoveryDays: days,
    recoveryHome: aid?.recovery_home ?? undefined,
    letterDate: row.created_at ?? undefined,
  }
}

/** כתובת המייל של היולדת (ברירת מחדל לחלונית השליחה). */
export function motherEmail(row: GratitudeLetterRow | null): string {
  return (benOf(row)?.email ?? '').trim().toLowerCase()
}

/** גוף המייל המעוצב הנשלח לנדיב עם השובר כצרופה (זהה בשליחה בודדת ומרוכזת). */
export function donorEmailHtml(row: GratitudeLetterRow | null): string {
  const motherName = motherDisplayName(row)
  const body = `
    <p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.9;">לכבוד הנדיב היקר,</p>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.9;">
      בשמחה רבה אנו מעבירים אליך מכתב ברכה והכרת הטוב שהתקבל
      ${motherName ? `ממשפחת <strong>${motherName}</strong>` : 'מאחת המשפחות'},
      בעקבות הסיוע שקיבלה מאגף עזר ליולדות.
    </p>
    <p style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.9;">
      מכתב הברכה המלא והמעוצב מצורף למייל זה כקובץ PDF להדפסה ולשמירה.
    </p>
    <p style="margin:24px 0 0;color:#64748b;font-size:14px;line-height:1.8;">
      תודתנו העמוקה על תרומתך ותמיכתך המתמשכת,<br/>
      <strong style="color:#334155;">אגף עזר ליולדות — היכל החתם סופר</strong>
    </p>`
  return shell({
    preheader: 'מכתב ברכה והכרת הטוב מאחת המשפחות',
    accent: DEPARTMENTS.maternity.color,
    title: 'מכתב ברכה',
    subtitle: 'אגף עזר ליולדות — היכל החתם סופר',
    body,
  })
}

export const DONOR_EMAIL_SUBJECT = 'מכתב ברכה והכרת הטוב'
