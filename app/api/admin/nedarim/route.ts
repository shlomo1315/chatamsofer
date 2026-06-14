import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { nedarimCall } from '@/lib/nedarim'

export const dynamic = 'force-dynamic'

// פעולות נדרים-קארד המותרות דרך ה-proxy (whitelist)
const ALLOWED = new Set([
  'GetClient_Table',      // רשימת משפחות
  'GetClientCard',        // פרטי משפחה לפי מזהה
  'SaveClientCard',       // הוספה / עריכה / מחיקה
  'SetClientMagneticCard',// כרטיס מגנטי
  'AddTlush',             // הוספת טעינה
  'PrikatTlush',          // פריקת טעינה
  'GetStoresList',        // רשימת חנויות
  'GetLimitedStoresList', // קבוצות חנויות
  'SaveLimitedStores',    // ניהול קבוצות
])

// proxy צד-שרת: מזריק קוד מוסד + סיסמת API ומעביר את הקריאה לנדרים קארד.
// פעולות עריכה (כתיבה) מוגבלות למנהל/גבייה.
const WRITE = new Set(['SaveClientCard', 'SetClientMagneticCard', 'AddTlush', 'PrikatTlush', 'SaveLimitedStores'])

export async function POST(request: NextRequest) {
  let body: { action?: string; params?: Record<string, string> }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const action = body.action ?? ''
  if (!ALLOWED.has(action)) return NextResponse.json({ error: 'פעולה לא מורשית' }, { status: 400 })

  const roles = WRITE.has(action) ? (['admin', 'collections'] as const) : undefined
  if (!(await requireStaff(roles ? [...roles] : undefined))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }

  try {
    const data = await nedarimCall(action, body.params ?? {})
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ Result: 'Error', Message: e instanceof Error ? e.message : 'שגיאה' }, { status: 502 })
  }
}
