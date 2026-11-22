import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { findAnsweredOutsideChat, releaseAnsweredOutsideChat } from '@/lib/maternityInquiryRelease'

export const dynamic = 'force-dynamic'

// תיקים "ממתינים לתשובת היולדת" שהמשפחה כבר פעלה בהם — ראו lib/maternityInquiryRelease.
// ⚠️ השחרור רץ גם אוטומטית כל שעה (instrumentation.ts). הנתיב הזה לבדיקה ידנית.
// GET — תצוגה בלבד · POST — שחרור עכשיו.

export async function GET() {
  if (!(await requirePermission('maternity', 'edit'))) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const cases = await findAnsweredOutsideChat(db)
  return NextResponse.json({ count: cases.length, cases })
}

export async function POST() {
  if (!(await requirePermission('maternity', 'edit'))) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const { found, released } = await releaseAnsweredOutsideChat(db)
  return NextResponse.json({ count: found.length, released, cases: found })
}
