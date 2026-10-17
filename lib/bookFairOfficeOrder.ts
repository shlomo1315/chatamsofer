import { normalizePhone } from '@/lib/phone'

// אימות הזמנת משרד (משלוח בלי תשלום).
// ⚠️ מספיק טלפון או מייל — לקוח שמסר רק מייל לא נדחה (בקשת המשתמש 17.10).

export type OfficeOrderInput = {
  name?: string; phone?: string; email?: string; city_id?: string; address?: string; notes?: string
}

export type OfficeOrderFields = {
  name: string; phone: string | null; email: string | null; cityId: string; address: string; notes: string | null
}

export function parseOfficeOrder(body: OfficeOrderInput): { ok: true; value: OfficeOrderFields } | { ok: false; error: string } {
  const name = String(body.name ?? '').trim()
  const phone = normalizePhone(body.phone) || null
  const email = String(body.email ?? '').trim() || null
  const address = String(body.address ?? '').trim()
  const cityId = String(body.city_id ?? '').trim()
  const notes = String(body.notes ?? '').trim() || null

  if (!name) return { ok: false, error: 'חסר שם' }
  if (!phone && !email) return { ok: false, error: 'חסר טלפון או מייל' }
  if (!cityId) return { ok: false, error: 'חסרה עיר' }
  if (!address) return { ok: false, error: 'חסרה כתובת' }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'כתובת המייל אינה תקינה' }
  }
  return { ok: true, value: { name, phone, email, cityId, address, notes } }
}
