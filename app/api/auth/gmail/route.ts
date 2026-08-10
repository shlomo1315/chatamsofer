import { NextResponse, type NextRequest } from 'next/server'
import { getAuthUrl } from '@/lib/gmail'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// חיבור חשבון Google. ?target=backup מחבר את חשבון *הגיבוי* (Drive) בלבד,
// ולא את חשבון הדואר.
//
// ⚠️ ה-target עובר ב-state ולא בכתובת החזרה: כתובת ההפניה רשומה אחת ב-Google
// Cloud (GMAIL_REDIRECT_URI) ואינה יכולה להשתנות לפי בקשה. state הוא המקום
// המיועד בפרוטוקול להעברת הקשר דרך ההפניה.
export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const target = request.nextUrl.searchParams.get('target') === 'backup' ? 'backup' : 'mail'
  return NextResponse.redirect(getAuthUrl(target))
}
