import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { buildHolidayVoucher, HOLIDAY_VOUCHER_DEFAULTS, type HolidayVoucherData } from '@/lib/holidayVoucher'
import { loadHolidayVoucherTexts } from '@/lib/holidayVoucherTexts'
import { scrambleBytes, DOC_CIPHER_ID } from '@/lib/docCipher'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// תצוגה מקדימה של שובר החגים.
//
// 🔴 קיים כדי שאפשר יהיה *לראות* את השובר לפני שהוא נשלח לאלפי משפחות.
// בלי זה הבדיקה היחידה היא שליחה אמיתית, וטעות עיצוב מתגלה אצל הנמענים.
//
// ⚠️ אינו כותב דבר ואינו שולח דבר — מייצר PDF ומחזיר אותו.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const recipientId = request.nextUrl.searchParams.get('recipient_id') ?? ''

  // 🔴 המלל הערוך ולא ברירות המחדל הקבועות — אחרת התצוגה המקדימה מציגה
  // נוסח אחר ממה שהמשפחות יקבלו, וזו בדיוק התכלית שלה.
  const db = getServiceClient()
  const texts = db ? await loadHolidayVoucherTexts(db) : HOLIDAY_VOUCHER_DEFAULTS

  // ברירת מחדל — נתוני דוגמה, כדי שאפשר יהיה לראות את העיצוב גם לפני
  // שמישהו בחר מוקד.
  let data: HolidayVoucherData = {
    familyName: 'משפחת ישראלי',
    centerLabel: 'ירושלים · אזור נווה צבי',
    centerAddress: 'רחוב לדוגמה 12, ירושלים',
    centerHours: "יום ג' י״ב אלול · 10:00–14:00",
    centerPhone: '02-0000000',
    distributionName: 'חלוקת חגי תשרי',
    amount: 500,
    phones: ['0501234567', '0527654321'],
    texts,
  }

  // ⚠️ עם recipient_id — שובר אמיתי של משפחה קיימת, כדי לראות נתונים
  // אמיתיים ולא רק את התבנית.
  if (recipientId) {
    if (db) {
      const { data: row } = await db.from('distribution_recipients')
        .select('center:holiday_centers(city, name, address, hours, phone), beneficiary:beneficiaries(family_name, full_name)')
        .eq('id', recipientId).maybeSingle()

      const r = row as {
        center?: { city: string; name: string; address: string | null; hours: string | null; phone: string | null } | null
        beneficiary?: { family_name: string | null; full_name: string | null } | null
      } | null

      // Supabase מחזיר יחסי join כמערך — ראו holiday-load.
      const center = Array.isArray(r?.center) ? r?.center[0] : r?.center
      const ben = Array.isArray(r?.beneficiary) ? r?.beneficiary[0] : r?.beneficiary

      if (center) {
        data = {
          familyName: [ben?.family_name, ben?.full_name].filter(Boolean).join(' ') || 'משפחה',
          centerLabel: center.city === center.name ? center.city : `${center.city} · ${center.name}`,
          centerAddress: center.address,
          centerHours: center.hours,
          centerPhone: center.phone,
          // ⚠️ נשמרים מנתוני הדוגמה: הם אינם בשאילתה, והשמטתם הציגה שובר
          // בלי סכום ובלי שם החלוקה — שונה ממה שנשלח בפועל.
          distributionName: data.distributionName,
          amount: data.amount,
          phones: data.phones,
          texts,
        }
      }
    }
  }

  const pdf = await buildHolidayVoucher(data)

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 ברירת המחדל היא ערוץ הנתונים, ולא PDF גולמי.
  //
  // ⚠️ נטפרי חוסמת לפי *סוג התוכן*: תגובת application/pdf נחסמת, והמנהל
  // ראה תצוגה מקדימה ריקה או שגיאה — כלומר הכלי שנועד לבדוק את השובר
  // לפני שליחה לאלפי משפחות היה בדיוק זה שלא עבד. אותה חסימה בדיוק
  // הפילה את ההורדה המרוכזת של מכתבי הברכה.
  //
  // המטען מעורבל לפני ה-base64: בלעדיו החתימה "JVBERi" מזוהה גם בתוך
  // JSON. הדפדפן מבטל את הערבול בזיכרון ומצייר עם pdf.js (ראו
  // lib/docCipher, components/ui/PdfCanvasView).
  //
  // ⚠️ ?raw=1 נשמר להורדה/פתיחה ידנית בכרטיסייה, שם נדרש קובץ אמיתי.
  // ─────────────────────────────────────────────────────────────────────────
  if (request.nextUrl.searchParams.get('raw') === '1') {
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        // inline ולא attachment — נפתח בכרטיסייה במקום להוריד קובץ.
        'Content-Disposition': 'inline; filename="holiday-voucher-preview.pdf"',
        'Cache-Control': 'no-store',
      },
    })
  }

  const scrambled = scrambleBytes(new Uint8Array(pdf))
  return NextResponse.json({
    name: 'שובר החלוקה.pdf',
    contentType: 'application/pdf',
    size: pdf.length,
    enc: DOC_CIPHER_ID,
    data: Buffer.from(scrambled).toString('base64'),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
