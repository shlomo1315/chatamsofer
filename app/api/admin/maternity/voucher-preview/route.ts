import { type NextRequest, NextResponse } from 'next/server'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { buildMaternityVouchers } from '@/lib/maternityVoucher'
import { buildInstructionsSheet } from '@/lib/instructionsSheet'
import { setVoucherTextsCache, fetchVoucherTexts } from '@/lib/voucherTextsStore'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// תצוגה מקדימה חיה של שוברי היולדות ב-PDF — עם נתוני דמו — להטמעה ב-iframe
// בדף ההגדרות. type=card (כרטיס מזון) · recovery (בית החלמה) · instructions.
// מחזיר application/pdf ממש כפי שנשלח למוטב, כדי לראות את העיצוב והטקסט החי.
// ─────────────────────────────────────────────────────────────────────────────

// נתוני דמו קבועים (לא Date.now — עמיד, וזהה בכל טעינה)
const DEMO = {
  motherName: 'רבקה כהן',
  motherId: '312345678',
  address: 'רחוב הרב קוק 12',
  city: 'בני ברק',
  phone: '0501234567',
  spousePhone: '0527654321',
  birthDate: '2026-07-01',
  recoveryHome: 'טלזסטון',
  recoveryDays: 14,
  serial: 'DEMO-001',
  centers: [
    { name: 'מוקד מרכז', city: 'בני ברק', address: 'רבי עקיבא 90', pickup_days: 'א׳–ה׳', pickup_hours: '09:00–14:00' },
    { name: 'מוקד ירושלים', city: 'ירושלים', address: 'מלכי ישראל 30', pickup_days: 'א׳–ד׳', pickup_hours: '10:00–13:00' },
  ],
}

async function renderPdf(type: string): Promise<{ buf: Buffer; filename: string }> {
  let b64: string
  let filename: string
  if (type === 'instructions') {
      const sheet = await buildInstructionsSheet({
        familyName: 'כהן', babyName: 'יוסף', babyGender: 'male', recoveryDays: DEMO.recoveryDays,
      })
      b64 = sheet.contentB64
      filename = 'הנחיות.pdf'
    } else {
      // buildMaternityVouchers מחזיר [הבראה, כרטיס-מזון]
      const vouchers = await buildMaternityVouchers(DEMO, { includeCard: true })
      const wantCard = type === 'card'
      const pick = wantCard
        ? vouchers.find(v => v.filename.includes('כרטיס')) ?? vouchers[vouchers.length - 1]
        : vouchers.find(v => v.filename.includes('הבראה')) ?? vouchers[0]
    b64 = pick.contentB64
    filename = pick.filename
  }
  return { buf: Buffer.from(b64, 'base64'), filename }
}

function pdfResponse(buf: Buffer, filename: string): NextResponse {
  const headers = new Headers()
  headers.set('Content-Type', 'application/pdf')
  headers.set('Content-Length', String(buf.length))
  headers.set('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`)
  headers.set('Cache-Control', 'no-store')
  return new NextResponse(new Uint8Array(buf), { status: 200, headers })
}

// GET — תצוגה מקדימה עם הטקסטים השמורים כרגע.
export async function GET(request: NextRequest) {
  if (!(await requireStaff())) return unauthorized()
  const type = request.nextUrl.searchParams.get('type') ?? 'card'
  try {
    // ⚠️ מוודאים שהמטמון משקף את ה-DB (לא override זמני שנשאר מ-POST קודם)
    setVoucherTextsCache(await fetchVoucherTexts())
    const { buf, filename } = await renderPdf(type)
    return pdfResponse(buf, filename)
  } catch (e) {
    console.error('[voucher-preview GET]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה ביצירת התצוגה' }, { status: 500 })
  }
}

// POST — תצוגה חיה: מחיל טקסטים זמניים (טיוטת העריכה) לפני הרינדור, בלי לשמור
// ל-DB. מאפשר למנהל לראות את השינוי לפני שמירה.
export async function POST(request: NextRequest) {
  if (!(await requireStaff())) return unauthorized()
  let body: { type?: string; texts?: Record<string, string> }
  try { body = await request.json() } catch { body = {} }
  const type = body.type ?? 'card'
  try {
    // מחילים את טיוטת העריכה על המטמון (זמני — GET הבא ידרוס אותו מה-DB)
    setVoucherTextsCache(body.texts ?? {})
    const { buf, filename } = await renderPdf(type)
    return pdfResponse(buf, filename)
  } catch (e) {
    console.error('[voucher-preview POST]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'שגיאה ביצירת התצוגה' }, { status: 500 })
  }
}
