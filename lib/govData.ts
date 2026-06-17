import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ── מקורות הנתונים של data.gov.il (משרד הפנים) ──────────────────────────────
const CITIES_RESOURCE = '5c78e9fa-c2e2-4771-93ff-7f400a12f7ba'
const STREETS_RESOURCE = 'a7296d1a-f8c9-4b70-96c2-6ebb4352f8e3'
const GOV_URL = 'https://data.gov.il/api/3/action/datastore_search'

const STALE_MS = 24 * 60 * 60 * 1000 // נתון נחשב "ישן" אחרי יממה

export function getAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// שליפת כל הרשומות מ-data.gov.il עם דפדוף (offset) — לא נחתך ב-5000 כמו קודם.
// זו הסיבה שערים גדולות כמו ירושלים לא הציגו את כל הרחובות.
async function fetchAll(resourceId: string, fields: string[], filters?: object): Promise<Record<string, string>[]> {
  const out: Record<string, string>[] = []
  const pageSize = 10000
  let offset = 0
  for (let guard = 0; guard < 50; guard++) {
    const res = await fetch(GOV_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource_id: resourceId, limit: pageSize, offset, fields, ...(filters ? { filters } : {}) }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const records: Record<string, string>[] = data?.result?.records ?? []
    out.push(...records)
    const total: number = data?.result?.total ?? out.length
    offset += pageSize
    if (out.length >= total || records.length === 0) break
  }
  return out
}

// ── ערים ────────────────────────────────────────────────────────────────────
export async function fetchCitiesFromGov(): Promise<string[]> {
  const records = await fetchAll(CITIES_RESOURCE, ['שם_ישוב'])
  const names = records.map(r => (r['שם_ישוב'] ?? '').trim()).filter(Boolean)
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'he'))
}

export async function syncCities(admin: SupabaseClient): Promise<number> {
  const cities = await fetchCitiesFromGov()
  if (cities.length === 0) return 0
  const now = new Date().toISOString()
  const rows = cities.map(name => ({ name, synced_at: now }))
  // upsert בקבוצות כדי לא לחרוג ממגבלות גוף הבקשה
  for (let i = 0; i < rows.length; i += 1000) {
    await admin.from('gov_cities').upsert(rows.slice(i, i + 1000), { onConflict: 'name' })
  }
  return cities.length
}

// מחזיר את רשימת הערים מהמאגר המקומי; אם ריק — מסנכרן פעם אחת ומחזיר.
export async function getCities(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin.from('gov_cities').select('name').order('name')
  if (data && data.length > 0) return data.map(r => r.name)
  try {
    await syncCities(admin)
    const { data: fresh } = await admin.from('gov_cities').select('name').order('name')
    return (fresh ?? []).map(r => r.name)
  } catch {
    return []
  }
}

// ── רחובות ────────────────────────────────────────────────────────────────────
export async function fetchStreetsFromGov(city: string): Promise<string[]> {
  // ניסיון 1: התאמה מדויקת לפי שם היישוב (כולל דפדוף לכל הרחובות)
  let records = await fetchAll(STREETS_RESOURCE, ['שם_רחוב', 'שם_ישוב'], { 'שם_ישוב': city })

  // ניסיון 2: חיפוש טקסט אם אין התאמה מדויקת (שמות עם רווחים/כתיב שונה)
  if (records.length === 0) {
    const all = await fetchAll(STREETS_RESOURCE, ['שם_רחוב', 'שם_ישוב'])
    records = all.filter(r => (r['שם_ישוב'] ?? '').trim() === city)
  }

  const raw = records
    .map(r => (r['שם_רחוב'] ?? '').trim())
    // מסננים ערכים טכניים של data.gov.il (למשל "אין שם רחוב")
    .filter(s => s && s !== 'אין שם רחוב' && s !== 'ללא שם')
  return [...new Set(raw)].sort((a, b) => a.localeCompare(b, 'he'))
}

export async function syncStreetsForCity(admin: SupabaseClient, city: string): Promise<number> {
  const streets = await fetchStreetsFromGov(city)
  // מוחקים ישנים ומכניסים מחדש כדי לשקף מחיקות/שינויים
  await admin.from('gov_streets').delete().eq('city', city)
  if (streets.length === 0) return 0
  const now = new Date().toISOString()
  const rows = streets.map(street => ({ city, street, synced_at: now }))
  for (let i = 0; i < rows.length; i += 1000) {
    await admin.from('gov_streets').upsert(rows.slice(i, i + 1000), { onConflict: 'city,street' })
  }
  return streets.length
}

// רענון יומי מלא — נקרא מהמתזמן הפנימי (instrumentation) מדי לילה.
// מרענן את רשימת הערים, ואת הרחובות של ערים שכבר נטענו למאגר (אלו שבשימוש).
export async function runGovSync(): Promise<{ cities: number; streetsCities: number; error?: string }> {
  const admin = getAdminClient()
  if (!admin) return { cities: 0, streetsCities: 0, error: 'no admin client' }
  let cities = 0
  let streetsCities = 0
  try { cities = await syncCities(admin) } catch (e) { return { cities, streetsCities, error: e instanceof Error ? e.message : 'cities error' } }
  try {
    const { data } = await admin.from('gov_streets').select('city')
    const list = [...new Set((data ?? []).map(r => r.city))]
    for (const city of list) {
      try { await syncStreetsForCity(admin, city); streetsCities++ } catch { /* ממשיכים לעיר הבאה */ }
    }
  } catch (e) {
    return { cities, streetsCities, error: e instanceof Error ? e.message : 'streets error' }
  }
  return { cities, streetsCities }
}

// מחזיר רחובות לעיר מהמאגר המקומי; אם ריק/ישן — מסנכרן ומחזיר. מהיר ברוב הפעמים.
export async function getStreets(admin: SupabaseClient, city: string): Promise<string[]> {
  const { data } = await admin
    .from('gov_streets')
    .select('street, synced_at')
    .eq('city', city)
    .order('street')

  const fresh = data && data.length > 0 && Date.now() - new Date(data[0].synced_at).getTime() < STALE_MS
  if (fresh) return data!.map(r => r.street)

  try {
    await syncStreetsForCity(admin, city)
    const { data: re } = await admin.from('gov_streets').select('street').eq('city', city).order('street')
    return (re ?? []).map(r => r.street)
  } catch {
    // נפילה ל-API — מחזירים מה שיש (גם אם ישן), עדיף מכלום
    return (data ?? []).map(r => r.street)
  }
}
