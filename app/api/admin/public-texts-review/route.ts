import { NextResponse } from 'next/server'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { buildPublicTextsReviewPage } from '@/lib/publicTextsReview'

// דף בקרת נוסחים — כל הטקסטים בממשק הציבורי מאורגנים לפי מסך/שלב.
// נפתח בטאב חדש; Ctrl+P → "שמור כ-PDF" לבקרת איכות.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()
  const html = buildPublicTextsReviewPage()
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
