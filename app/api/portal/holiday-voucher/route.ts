import { NextResponse, type NextRequest } from 'next/server'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { getServiceClient } from '@/lib/apiAuth'
import { getOpenDistribution, getLiveDistribution } from '@/lib/holidayDistributions'
import { buildHolidayVoucher, HOLIDAY_VOUCHER_DEFAULTS } from '@/lib/holidayVoucher'
import { loadHolidayVoucherTexts } from '@/lib/holidayVoucherTexts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ─────────────────────────────────────────────────────────────────────────────
// הורדת השובר בידי המשפחה.
//
// 🔴 רק אחרי שהונפק כרטיס. שובר בלי מספר כרטיס אינו שווה דבר במוקד,
// והורדתו הייתה שולחת את המשפחה עם נייר חסר.
//
// ⚠️ המשפחה מזוהה מהסשן בלבד — לא מפרמטר. אחרת כל אחד היה יכול
// להוריד את השובר של אחר לפי מזהה.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const sessionId = getPortalBeneficiaryId(request)
  if (!sessionId) {
    return NextResponse.json({ error: 'נדרש אימות' }, { status: 401 })
  }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const active = (await getOpenDistribution()) ?? (await getLiveDistribution())
  if (!active) return NextResponse.json({ error: 'אין חלוקה פעילה' }, { status: 404 })

  const { data } = await db.from('distribution_recipients')
    .select('id, card_number, amount, center:holiday_centers(city, name, address, hours, phone), beneficiary:beneficiaries(family_name, full_name, phone, phone2)')
    .eq('distribution_id', active.id)
    .eq('beneficiary_id', sessionId)
    .maybeSingle()

  const row = data as {
    card_number?: string | null; amount?: number | null
    center?: Record<string, string> | Record<string, string>[] | null
    beneficiary?: Record<string, string> | Record<string, string>[] | null
  } | null

  if (!row) return NextResponse.json({ error: 'אינכם רשומים לחלוקה זו' }, { status: 404 })

  // 🔴 בלי כרטיס אין שובר — הוא לא שווה דבר במוקד.
  if (!row.card_number) {
    return NextResponse.json({ error: 'השובר טרם הונפק' }, { status: 404 })
  }

  // ⚠️ join של Supabase מחזיר מערך או אובייקט — שניהם נתמכים.
  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
  const center = one(row.center)
  const ben = one(row.beneficiary)

  const texts = await loadHolidayVoucherTexts(db).catch(() => HOLIDAY_VOUCHER_DEFAULTS)

  const pdf = await buildHolidayVoucher({
    familyName: [ben?.family_name, ben?.full_name].filter(Boolean).join(' ') || 'משפחה',
    centerLabel: center
      ? (center.city === center.name ? center.city : `${center.city} · ${center.name}`)
      : 'טרם נבחר מוקד',
    centerAddress: center?.address ?? '',
    centerHours: center?.hours ?? '',
    centerPhone: center?.phone ?? '',
    distributionName: active.name,
    amount: row.amount != null ? Number(row.amount) : (active.amount_per_family ?? null),
    phones: [ben?.phone, ben?.phone2].filter(Boolean) as string[],
    texts,
  })

  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      // ⚠️ inline ולא attachment: נפתח בכרטיסייה ומאפשר הדפסה מיידית,
      // במקום להוריד קובץ שהמשפחה צריכה למצוא.
      'Content-Disposition': 'inline; filename="holiday-voucher.pdf"',
      'Cache-Control': 'no-store',
    },
  })
}
