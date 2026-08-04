import { type NextRequest, NextResponse } from 'next/server'
import { handlePublicRegister } from '../../portal/public-register/route'
import { jsonCors, preflight, withCors } from '@/lib/cors'

// ─────────────────────────────────────────────────────────────────────────────
// טופס נדרים — שמירת הרישום.
//
// זה ה-endpoint שהיה חסר: בנינו לנדרים פלוס את כל קריאות ה*קריאה* (ת"ז, סדר
// הדורות, ערים, רחובות, אימות) אבל לא את זה שמקבל את הטופס המלא. כל ניסיון
// שלהם החזיר 404.
//
// אין כאן שכפול של לוגיקת הרישום — הבקשה מועברת ל-portal/public-register,
// שהוא מקור האמת (ולידציה, אימות טלפון, יוחסין, מייל אישור). ההבדלים היחידים:
// עטיפת CORS (כי public-register נועד לאותו מקור ואינו מאפשר קריאה מ-matara.pro),
// וסימון ערוץ ההרשמה כ-'nedarim'.
//
// ⚠️ הערוץ נקבע לפי הראוט שנקרא ולא לפי כותרת origin: כותרת נשלטת בידי הלקוח,
// ואילו העובדה שהבקשה הגיעה לכאן היא ודאית.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

export async function OPTIONS(request: NextRequest) {
  return preflight(request.headers.get('origin'))
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin')

  let res: NextResponse
  try {
    res = await handlePublicRegister(request, 'nedarim')
  } catch (e) {
    console.error('[nedarim-form/register] שגיאה:', e)
    return jsonCors({ error: 'שגיאה בשמירת הנתונים. אנא נסו שוב.' }, { status: 500 }, origin)
  }

  // הגוף והסטטוס נשמרים כמות שהם — כולל 409 על כפילות ו-400 על ולידציה,
  // כדי שנדרים פלוס יוכלו להציג את השגיאה המדויקת למשתמש.
  return withCors(res, origin)
}
