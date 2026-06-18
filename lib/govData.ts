import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// ── מקורות הנתונים של data.gov.il (משרד הפנים) ──────────────────────────────
const CITIES_RESOURCE = '5c78e9fa-c2e2-4771-93ff-7f400a12f7ba'
const STREETS_RESOURCE = 'a7296d1a-f8c9-4b70-96c2-6ebb4352f8e3'
const GOV_URL = 'https://data.gov.il/api/3/action/datastore_search'
const GOV_SQL_URL = 'https://data.gov.il/api/3/action/datastore_search_sql'

const STALE_MS = 24 * 60 * 60 * 1000 // נתון נחשב "ישן" אחרי יממה

// data.gov.il יושב מאחורי Cloudflare ועלול להחזיר 403 לבקשות ללא User-Agent דפדפני.
// בלי הכותרת הזו הסנכרון הלילי נכשל בשקט והרשימה "נתקעת" עם ערים חסרות — לכן שולחים UA אמיתי.
const GOV_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json',
  'Accept-Language': 'he,en;q=0.8',
}

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
      headers: GOV_HEADERS,
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

// השלמת שמות יישובים ממאגר הרחובות (DISTINCT) — תופס יישובים שאולי חסרים
// במרשם היישובים הראשי, ומבטיח כיסוי מלא של כל יישוב שיש לו רחובות.
async function fetchCityNamesFromStreets(): Promise<string[]> {
  const sql = `SELECT DISTINCT "שם_ישוב" AS c FROM "${STREETS_RESOURCE}"`
  const res = await fetch(`${GOV_SQL_URL}?sql=${encodeURIComponent(sql)}`, { headers: GOV_HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const records: Record<string, string>[] = data?.result?.records ?? []
  return records.map(r => (r.c ?? r['שם_ישוב'] ?? '').trim()).filter(Boolean)
}

export async function fetchCitiesFromGov(): Promise<string[]> {
  const set = new Set<string>()
  // מקור ראשי: מרשם היישובים של משרד הפנים
  try {
    const records = await fetchAll(CITIES_RESOURCE, ['שם_ישוב'])
    for (const r of records) {
      const n = (r['שם_ישוב'] ?? '').trim()
      // מסננים את רשומת הדמה "לא רשום" (קוד יישוב 0) שאינה יישוב אמיתי
      if (n && n !== 'לא רשום') set.add(n)
    }
  } catch (e) {
    if (set.size === 0) throw e // אם המקור הראשי נכשל לגמרי — מפיצים את השגיאה
  }
  // השלמה (best-effort) ממאגר הרחובות — מבטיח שכל יישוב (כגון עמנואל) ייכנס לרשימה
  try {
    for (const n of await fetchCityNamesFromStreets()) if (n && n !== 'לא רשום') set.add(n)
  } catch { /* השלמה אופציונלית — לא חוסמת את סנכרון הערים */ }
  return [...set].sort((a, b) => a.localeCompare(b, 'he'))
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

// שובר-סטמפדה: מבטיח שרענון-רקע של הערים ירוץ לכל היותר פעם ביממה לכל תהליך.
let lastCitySyncAttempt = 0
let citySyncInFlight = false

// מחזיר את רשימת הערים מהמאגר המקומי. אם ריק — מסנכרן פעם אחת (חוסם) ומחזיר.
// אם הנתונים ישנים (>יממה) — מרענן ברקע ממשרד הפנים בלי לעכב את הבקשה, כך
// שהרשימה נשארת מלאה ומעודכנת גם אם המתזמן הלילי לא רץ.
export async function getCities(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin.from('gov_cities').select('name, synced_at').order('name')
  const rows = data ?? []

  if (rows.length === 0) {
    try {
      await syncCities(admin)
      const { data: fresh } = await admin.from('gov_cities').select('name').order('name')
      return (fresh ?? []).map(r => r.name)
    } catch {
      return []
    }
  }

  const newest = rows.reduce((mx, r) => Math.max(mx, new Date(r.synced_at as string).getTime() || 0), 0)
  const stale = Date.now() - newest > STALE_MS
  if (stale && !citySyncInFlight && Date.now() - lastCitySyncAttempt > STALE_MS) {
    lastCitySyncAttempt = Date.now()
    citySyncInFlight = true
    // רענון לא-חוסם (Railway — שרת מתמשך): הבקשה הנוכחית מקבלת את הרשימה הקיימת מיד
    void syncCities(admin).catch(() => {}).finally(() => { citySyncInFlight = false })
  }
  return rows.map(r => r.name as string)
}

// מטא-נתונים לרשימת הערים — לתצוגת מצב בממשק הניהול (כמה ערים ומתי עודכנו לאחרונה).
export async function getCitiesMeta(admin: SupabaseClient): Promise<{ count: number; lastSyncedAt: string | null }> {
  const { count } = await admin.from('gov_cities').select('name', { count: 'exact', head: true })
  const { data } = await admin
    .from('gov_cities')
    .select('synced_at')
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return { count: count ?? 0, lastSyncedAt: (data?.synced_at as string) ?? null }
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
