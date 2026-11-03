// מצב תחזוקה: כשהמשתנה MAINTENANCE_MODE=true, הכניסה, ההרשמה ושליחת קודי האימות של האזור האישי חסומים.
// מסכי הניהול ו-/api/health לא נחסמים. בלי המשתנה (למשל ב-AWS) הכול פתוח.

export const MAINTENANCE_MESSAGE =
  'המערכת עוברת שידרוג בשעות הקרובות. לא ניתן להיכנס או להירשם כרגע. נחזור בקרוב.'

export function maintenanceOn(env: Record<string, string | undefined> = process.env): boolean {
  return (env.MAINTENANCE_MODE ?? '').trim().toLowerCase() === 'true'
}

// נתיבי ה-API של כניסה, הרשמה ואימות (קוד במייל, בטלפון ובשיחה)
const BLOCKED_API_PREFIXES = [
  '/api/portal/auth/',
  '/api/portal/login',
  '/api/portal/public-register',
  '/api/portal/verify/',
  '/api/portal/verify-email',
  '/api/portal/lookup',
  '/api/register',
]

export function isMaintenanceBlockedApi(pathname: string): boolean {
  return BLOCKED_API_PREFIXES.some(p => (p.endsWith('/') ? pathname.startsWith(p) : pathname === p || pathname.startsWith(p + '/')))
}
