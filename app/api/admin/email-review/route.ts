import { NextResponse } from 'next/server'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { renderAllEmailSamples } from '@/lib/emailSamples'
import { buildEmailReviewPage } from '@/lib/emailReviewPage'

// דף בקרת נוסחי המיילים — כל מייל מרונדר במלואו (בדיוק כפי שנשלח), כל אחד בעמוד נפרד.
// נפתח בטאב חדש; Ctrl+P → "שמור כ-PDF" מפיק PDF מדויק לבקרת איכות.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  try {
    const emails = renderAllEmailSamples()
    const html = buildEmailReviewPage(emails)
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  } catch (e) {
    console.error('[email-review] build failed:', e)
    return NextResponse.json({ error: `שגיאה בהפקת דף הבקרה: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }
}
