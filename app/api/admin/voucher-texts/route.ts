import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { fetchVoucherTexts, saveVoucherTexts } from '@/lib/voucherTextsStore'
import { VOUCHER_TEXT_DEFAULTS } from '@/lib/voucherTextsCatalog'

export const dynamic = 'force-dynamic'

// טקסטי השוברים העריכים. GET מחזיר את הערכים השמורים + ברירות המחדל.
// POST שומר. ⚠️ plain-text (הולך ל-PDF) — לא מסירים תגי HTML.
export async function GET() {
  if (!(await requireStaff())) return unauthorized()
  const texts = await fetchVoucherTexts()
  return NextResponse.json({ texts, defaults: VOUCHER_TEXT_DEFAULTS })
}

export async function POST(request: NextRequest) {
  if (!(await requireStaff())) return unauthorized()
  let body: { texts?: Record<string, unknown> }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  // מסננים למפתחות מוכרים בלבד; ערך ריק/זהה-לברירת-מחדל נמחק (חוזר לברירת מחדל).
  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(body.texts ?? {})) {
    if (!(k in VOUCHER_TEXT_DEFAULTS)) continue
    const s = String(v ?? '').trim()
    if (s && s !== VOUCHER_TEXT_DEFAULTS[k]) clean[k] = s
  }
  if (!(await saveVoucherTexts(clean))) {
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, texts: clean })
}
