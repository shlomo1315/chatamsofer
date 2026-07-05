import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff } from '@/lib/apiAuth'
import { getNedarimCreds, getLimitedStoresList, findClientByZeout, getClientCardFull } from '@/lib/nedarim'

export const dynamic = 'force-dynamic'

// אבחון קריאה-בלבד: מציג את קבוצות "הגבלת חנויות" בנדרים (שם + מזהה מדויקים),
// ואם נמסר ?zeout= — גם את מבנה הטעינות (Tlushim) של אותה משפחה, כדי לזהות איך
// נדרים מקשרת טעינה לקבוצת הגבלה. לא מבצע שום כתיבה/פעולה חיה.
export async function GET(request: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }
  const creds = await getNedarimCreds()
  if (!creds) return NextResponse.json({ error: 'נדרים קארד אינו מוגדר' }, { status: 400 })

  const out: Record<string, unknown> = {}
  try {
    const { groups, raw } = await getLimitedStoresList(creds)
    out.limitedStores = { groups, raw }
  } catch (e) {
    out.limitedStoresError = e instanceof Error ? e.message : String(e)
  }

  const zeout = request.nextUrl.searchParams.get('zeout')?.trim()
  if (zeout) {
    try {
      const clientId = await findClientByZeout(creds, zeout)
      if (!clientId) {
        out.client = { error: 'לא נמצאה משפחה עם ת"ז זו בנדרים' }
      } else {
        const full = await getClientCardFull(creds, clientId)
        out.client = {
          clientId,
          // מציגים את המבנה הגולמי המלא כדי לזהות שדות של קבוצת הגבלה/הגבלת חנויות בטעינות
          raw: full,
        }
      }
    } catch (e) {
      out.client = { error: e instanceof Error ? e.message : String(e) }
    }
  }

  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
