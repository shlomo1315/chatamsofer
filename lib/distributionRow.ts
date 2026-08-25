// ─────────────────────────────────────────────────────────────────────────────
// המרת שורת נרשם מצורת ה-join של PostgREST לשורה שטוחה.
//
// 🔴 מקור אמת יחיד: אותה המרה משמשת את הטעינה הראשונה (בשרת) ואת
// הרשימה המלאה שנטענת ברקע. שני מימושים היו יוצרים שורות שונות,
// והמסך היה משתנה ברגע שהרקע מסיים.
// ─────────────────────────────────────────────────────────────────────────────
import { differenceInYears } from 'date-fns'
import { approvalLabelOf } from '@/lib/approvalLabel'
import type { RegisterSource } from '@/lib/distributionSources'
import type { ApprovalStatus } from '@/lib/holidayCards'
import type { RegistrationRow } from '@/app/admin/distributions/[id]/HolidayRegistrations'

/** שדות המשפחה שהשורה נגזרת מהם. */
export interface BenRow {
  id: string
  full_name?: string | null
  family_name?: string | null
  spouse_name?: string | null
  id_number?: string | null
  phone?: string | null
  phone2?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  community_affiliation?: string | null
  children_count?: number | null
  birth_date?: string | null
  spouse_birth_date?: string | null
}

export function toRegistrationRow(r: Record<string, unknown>): RegistrationRow {
  const b = (r as unknown as { beneficiary?: BenRow | null }).beneficiary ?? null
  // גיל — לפי תאריך הלידה של הבעל, ובהיעדרו של האישה
  const dob = b?.birth_date || b?.spouse_birth_date
  let age: number | null = null
  if (dob) {
    try { age = differenceInYears(new Date(), new Date(dob)) } catch { age = null }
  }
  const row = r as unknown as {
    id: string; source?: string | null; registered_at?: string | null; phone?: string | null
    notified_at?: string | null; notify_error?: string | null; amount?: number | null; beneficiary_id?: string | null
    approval_status?: string | null; approved_at?: string | null
    card_number?: string | null; card_linked_at?: string | null; card_link_error?: string | null
    center_id?: string | null; center_source?: string | null; load_status?: string | null
    center?: { id: string; city: string; name: string } | null
  }
  return {
    id: String(row.id),
    source: ((row.source ?? 'admin') as RegisterSource),
    registered_at: row.registered_at ?? null,
    phone: row.phone ?? null,
    notified_at: row.notified_at ?? null,
    notify_error: row.notify_error ?? null,
    amount: row.amount ?? null,
    beneficiary_id: row.beneficiary_id ?? null,
    approval_status: ((row.approval_status ?? 'pending') as ApprovalStatus),
    approved_at: row.approved_at ?? null,
    card_number: row.card_number ?? null,
    card_linked_at: row.card_linked_at ?? null,
    card_link_error: row.card_link_error ?? null,
    center_id: row.center_id ?? null,
    // ⚠️ עיר ששמה זהה לשם המוקד לא תוצג פעמיים — כך הוזנו רוב הערים.
    center_name: row.center
      ? (row.center.city === row.center.name ? row.center.city : `${row.center.city} · ${row.center.name}`)
      : null,
    center_source: row.center_source ?? null,
    load_status: row.load_status ?? null,
    name: [b?.family_name, b?.full_name || b?.spouse_name].filter(Boolean).join(' ') || (b?.full_name ?? 'ללא שם'),
    // ⚠️ שם המשפחה והשם הפרטי נשמרים גם בנפרד, לא רק במחרוזת המאוחדת:
    // פיצול בצד הלקוח לפי רווח היה שובר שמות משפחה מורכבים ("בן דוד",
    // "אבו חצירא") ומזיז חצי מהשם לעמודה הלא נכונה.
    family_name: b?.family_name ?? null,
    first_name: b?.full_name || b?.spouse_name || null,
    id_number: b?.id_number ?? null,
    // ⚠️ מנורמל בשרת ולא בטבלה: HolidayRecipientsTable משותפת עם דף
    // השיתוף, ושורה שטוחה שומרת אותה חופשייה מצורת ה-join של PostgREST.
    approval_label: approvalLabelOf(b),
    spouse_name: b?.spouse_name ?? null,
    ben_phone: b?.phone || b?.phone2 || null,
    email: b?.email ?? null,
    address: b?.address ?? null,
    city: b?.city ?? null,
    community: b?.community_affiliation ?? null,
    children_count: b?.children_count ?? null,
    age,
  }
}
