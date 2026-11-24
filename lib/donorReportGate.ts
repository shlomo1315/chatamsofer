import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DONOR_COOKIE, verifyDonorSession } from '@/lib/donorReportAuth'
import { resolveDonorLink, type DonorLink } from '@/lib/donorReport'

export type DonorGate =
  | { ok: true; link: DonorLink; lockedHome: string | null }
  | { ok: false; status: number; body: Record<string, unknown> }

/**
 * שער הגישה לכל נקודות הקצה של קישור הנדיב: טוקן תקף שלא בוטל, סיסמה שהוגדרה
 * ו-cookie תקף של אותו קישור. 🔴 lockedHome מוחזר מהקישור, ולא מהבקשה.
 */
export async function authorizeDonorRequest(request: NextRequest, db: SupabaseClient, token: string | null): Promise<DonorGate> {
  const link = await resolveDonorLink(db, token)
  if (!link) return { ok: false, status: 404, body: { error: 'הקישור אינו תקין או שבוטל' } }
  if (!link.password_hash) {
    return { ok: false, status: 403, body: { error: 'הקישור טרם הופעל. פנו למשרד לקבלת סיסמה.', inactive: true } }
  }
  if (!verifyDonorSession(request.cookies.get(DONOR_COOKIE)?.value, link.id, link.password_hash)) {
    return { ok: false, status: 401, body: { error: 'נדרשת סיסמה', needsPassword: true } }
  }
  return { ok: true, link, lockedHome: (link.recovery_home ?? '').trim() || null }
}
