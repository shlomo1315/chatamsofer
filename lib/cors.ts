// עזר CORS לנקודות הקצה של טופס נדרים פלוס (app/api/nedarim-form/*).
// הטופס רץ בדפדפן המשתמש מ-matara.pro וקורא ישירות לשרת שלנו — לכן נדרשות
// כותרות CORS מפורשות (ה-middleware ב-proxy.ts אינו מכסה כלל את /api).
//
// חשוב: CORS אינו מנגנון אבטחה — הוא רק מורה לדפדפן אילו origins מותרים ל-JS.
// ההגנה האמיתית היא שהנקודות אינן חושפות נתונים + rate-limiting + אימות טלפון.
import { NextResponse } from 'next/server'

// origins מותרים. ניתן להרחיב במידת הצורך (למשל סביבת staging של נדרים).
export const ALLOWED_ORIGINS = ['https://matara.pro'] as const

// בוחר את ה-origin שיוחזר בכותרת: אם הבקשה הגיעה מ-origin מותר — מחזירים אותו
// (מדויק, תומך ב-credentials עתידי); אחרת נופלים ל-origin הראשי כברירת מחדל.
function resolveOrigin(requestOrigin?: string | null): string {
  if (requestOrigin && (ALLOWED_ORIGINS as readonly string[]).includes(requestOrigin)) {
    return requestOrigin
  }
  return ALLOWED_ORIGINS[0]
}

export function corsHeaders(requestOrigin?: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': resolveOrigin(requestOrigin),
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

// מוסיף כותרות CORS ל-NextResponse קיים ומחזיר אותו.
export function withCors(response: NextResponse, requestOrigin?: string | null): NextResponse {
  const headers = corsHeaders(requestOrigin)
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
  return response
}

// תגובת preflight (OPTIONS): 204 ריק עם כותרות ה-CORS.
export function preflight(requestOrigin?: string | null): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }), requestOrigin)
}

// קיצור: NextResponse.json עטוף ב-CORS.
export function jsonCors(
  body: unknown,
  init?: ResponseInit,
  requestOrigin?: string | null,
): NextResponse {
  return withCors(NextResponse.json(body, init), requestOrigin)
}
