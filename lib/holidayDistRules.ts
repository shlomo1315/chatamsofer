import { getServiceClient } from '@/lib/apiAuth'
import type { RegisterSource } from '@/lib/distributionSources'

// ─────────────────────────────────────────────────────────────────────────────
// כללי רישום לכל חלוקה בנפרד (חנוכה תשפ״ז ואילך).
//
// 🔴 "רישום בטלפון בלבד": כשהמתג דלוק, כל ערוץ אחר (אזור אישי, רישום
// ציבורי, מייל, טופס נדרים, קישור הזמנה) מסרב לרשום — והאכיפה יושבת
// ב-registerToOpenDistribution, הנקודה שכל הערוצים עוברים בה. אכיפה בכל
// ערוץ בנפרד הייתה מבטיחה שאחד יישכח.
//
// ⚠️ הוספה ידנית של מנהל (source=admin) מותרת תמיד — היא הכרעה של הצוות,
// לא רישום עצמי של משפחה.
//
// ⚠️ נשמר ב-app_settings (עמודת text ⇒ JSON.stringify חובה) ולא בעמודות
// חדשות בטבלה: כך אין מיגרציה שצריך להריץ ידנית לפני שהרישום נפתח.
// ─────────────────────────────────────────────────────────────────────────────

export const DIST_RULES_KEY = 'holiday_distribution_rules'

export interface DistRules {
  /** רישום אך ורק בשלוחה הטלפונית. */
  phoneOnly: boolean
  /** משפחה בסטטוס "בדיקה מעמיקה" (deep_review) אינה יכולה להירשם. */
  blockDeepReview: boolean
  /** רישום בטלפון שעבר את כל השאלות מאושר מיד (ונשלח מייל זכאות). */
  autoApprove: boolean
  /** הימים והשעות של המוקדים פורסמו — מעכשיו הם מוקראים בקו. */
  hoursPublished: boolean
  /** מספר הקו שמוצג למשפחות באתר ("חייגו ..."). */
  phoneNumber: string
}

export const DEFAULT_RULES: DistRules = {
  phoneOnly: false,
  blockDeepReview: false,
  autoApprove: false,
  hoursPublished: true,
  phoneNumber: '',
}

/** מנרמל ערך שנשמר (או קלט מהמסך) לכללים שלמים ותקינים. */
export function normalizeRules(raw: unknown): DistRules {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof DistRules, unknown>>
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  return {
    phoneOnly: bool(r.phoneOnly, DEFAULT_RULES.phoneOnly),
    blockDeepReview: bool(r.blockDeepReview, DEFAULT_RULES.blockDeepReview),
    autoApprove: bool(r.autoApprove, DEFAULT_RULES.autoApprove),
    hoursPublished: bool(r.hoursPublished, DEFAULT_RULES.hoursPublished),
    phoneNumber: typeof r.phoneNumber === 'string' ? r.phoneNumber.replace(/[^\d-]/g, '').slice(0, 15) : '',
  }
}

/** האם הערוץ רשאי לרשום לחלוקה לפי הכללים. */
export function channelAllowed(rules: DistRules, source: RegisterSource): boolean {
  if (!rules.phoneOnly) return true
  return source === 'phone' || source === 'admin'
}

/** "בבדיקה מעמיקה" — חסום כשהמנהל סימן זאת בחלוקה. */
export function blockedByDeepReview(rules: DistRules, eligibilityStatus: string | null | undefined): boolean {
  return rules.blockDeepReview && eligibilityStatus === 'deep_review'
}

/** ההודעה שמוצגת בכל ערוץ שאינו הטלפון. */
export function phoneOnlyMessage(distName: string, phoneNumber: string): string {
  const line = phoneNumber ? ` בטלפון ${phoneNumber}` : ' בקו הטלפוני של היכל החתם סופר'
  return `הרישום לחלוקת ${distName} מתבצע אך ורק בשלוחה הטלפונית${line}. `
    + 'אין אפשרות להירשם באתר, במייל או בטופס נדרים פלוס.'
}

type Store = Record<string, DistRules>

async function readStore(): Promise<Store> {
  const db = getServiceClient()
  if (!db) return {}
  const { data } = await db.from('app_settings').select('value').eq('key', DIST_RULES_KEY).maybeSingle()
  const raw = (data as { value?: string | null } | null)?.value
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Store = {}
    for (const [id, v] of Object.entries(parsed ?? {})) out[id] = normalizeRules(v)
    return out
  } catch { return {} }
}

let _cache: { at: number; store: Store } | null = null
const CACHE_MS = 30_000

/** הכללים של חלוקה. ⚠️ מטמון קצר: נקרא בכל שיחה טלפונית. */
export async function getDistRules(distributionId: string | null | undefined): Promise<DistRules> {
  if (!distributionId) return { ...DEFAULT_RULES }
  if (!_cache || Date.now() - _cache.at > CACHE_MS) _cache = { at: Date.now(), store: await readStore() }
  return _cache.store[distributionId] ?? { ...DEFAULT_RULES }
}

/** שמירת כללים לחלוקה (מיזוג מעל הקיים). מחזיר את הכללים השמורים, או null בכשל. */
export async function saveDistRules(distributionId: string, patch: Partial<DistRules>): Promise<DistRules | null> {
  const db = getServiceClient()
  if (!db || !distributionId) return null
  const store = await readStore()
  const next = normalizeRules({ ...(store[distributionId] ?? DEFAULT_RULES), ...patch })
  store[distributionId] = next
  // 🔴 app_settings.value היא text — אובייקט גולמי נשמר כ-"[object Object]" בשקט.
  const { error } = await db.from('app_settings').upsert(
    { key: DIST_RULES_KEY, value: JSON.stringify(store) },
    { onConflict: 'key' },
  )
  if (error) { console.error('[holidayDistRules] save failed:', error.message); return null }
  _cache = null
  return next
}
