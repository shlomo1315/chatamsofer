import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { buildRabbiFormPdf, validateRabbiForm, DEFAULT_LAYOUT, type FormLayout, type RabbiFormData } from '@/lib/rabbiFormPdf'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// הפקת טופס חתימת רב.
//
// GET  ?loan=<id>   — טופס לבקשה קיימת, עם הנתונים שלה.
// GET  ?preview=1   — תצוגה מקדימה עם נתוני דוגמה (מסך ההגדרות).
// POST              — הפקה מנתונים שנשלחו (הפורטל, לפני שהבקשה נוצרה).
//
// ⚠️ שלושת המסלולים מייצרים את *אותו* מסמך: כיול שנעשה בתצוגה המקדימה
// חייב להשפיע על מה שהמבקש מוריד, אחרת המסך משקר.
// ─────────────────────────────────────────────────────────────────────────────

const LAYOUT_KEY = 'rabbi_form_layout'

/** פריסת השדות השמורה, או ברירת המחדל. */
async function loadLayout(db: NonNullable<ReturnType<typeof getServiceClient>>): Promise<FormLayout> {
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', LAYOUT_KEY).maybeSingle()
    if (!data?.value) return DEFAULT_LAYOUT
    // ⚠️ מיזוג עם ברירת המחדל ולא החלפה: פריסה שמורה מגרסה ישנה עלולה
    // לחסר שדות שנוספו מאז, והחלפה מלאה הייתה מפילה את ההפקה.
    return { ...DEFAULT_LAYOUT, ...(JSON.parse(String(data.value)) as Partial<FormLayout>) }
  } catch { return DEFAULT_LAYOUT }
}

const pdfResponse = (bytes: Uint8Array, filename: string) =>
  new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      // ⚠️ inline ולא attachment: המסך מציג את הטופס ב-iframe לכיול,
      // והורדה כפויה הייתה שוברת את התצוגה המקדימה.
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'Cache-Control': 'no-store',
    },
  })

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const layout = await loadLayout(db)
  const sp = request.nextUrl.searchParams

  // ── תצוגה מקדימה (מסך ההגדרות) ──
  if (sp.get('preview') === '1') {
    // ⚠️ נתוני דוגמה ארוכים בכוונה: שם קצר מסתיר גלישה, ורק שם מלא
    // מראה אם השדה חורג מהמסגרת.
    const demo: RabbiFormData = {
      applicantName: 'משפחת ישראלי — ישראל ישראלי',
      idNumber: '123456789',
      amount: 25000,
      installments: 48,
      lineage: [
        'ישראל ישראלי', 'ר׳ משה ישראלי', 'ר׳ יעקב ישראלי', 'ר׳ אברהם ישראלי',
        'ר׳ יצחק ישראלי', 'ר׳ שמעון ישראלי', 'רבינו החתם סופר זיע״א',
      ],
    }
    return pdfResponse(await buildRabbiFormPdf(demo, layout), 'תצוגה-מקדימה.pdf')
  }

  // ── טופס לבקשה קיימת ──
  const loanId = sp.get('loan') ?? ''
  if (!loanId) return NextResponse.json({ error: 'חסר מזהה בקשה' }, { status: 400 })

  const { data } = await db.from('loans')
    .select('id, amount, approved_amount, installments, beneficiary:beneficiaries(full_name, family_name, spouse_name, id_number, lineage_chain)')
    .eq('id', loanId).maybeSingle()
  if (!data) return NextResponse.json({ error: 'הבקשה לא נמצאה' }, { status: 404 })

  const row = data as unknown as {
    amount?: number; installments?: number
    beneficiary?: {
      full_name?: string; family_name?: string; spouse_name?: string
      id_number?: string; lineage_chain?: { name?: string }[] | null
    } | null
  }
  const b = row.beneficiary

  const form: RabbiFormData = {
    applicantName: [b?.family_name, b?.full_name || b?.spouse_name].filter(Boolean).join(' ') || '',
    idNumber: b?.id_number ?? '',
    amount: Number(row.amount ?? 0),
    installments: Number(row.installments ?? 0),
    // ⚠️ הסדר מהמבקש כלפי מעלה — כך הוא מופיע בטופס וכך הרב קורא אותו.
    lineage: Array.isArray(b?.lineage_chain)
      ? b.lineage_chain.map(c => String(c?.name ?? '')).filter(Boolean).reverse()
      : [],
  }

  const check = validateRabbiForm(form)
  if (!check.ok) {
    return NextResponse.json({ error: 'לא ניתן להפיק את הטופס', missing: check.missing }, { status: 400 })
  }

  const safeName = form.applicantName.replace(/[\\/:*?"<>|]/g, '')
  return pdfResponse(await buildRabbiFormPdf(form, layout), `טופס חתימת רב — ${safeName}.pdf`)
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = await request.json().catch(() => ({})) as Partial<RabbiFormData>
  const check = validateRabbiForm(body)
  // 🔴 חוסם הפקה חלקית: טופס עם שדה ריק מגיע לרב, הוא חותם, והמסמך
  // אינו תואם את הבקשה — ואז אין דרך לתקן בלי להחתים שוב.
  if (!check.ok) {
    return NextResponse.json({ error: 'הטופס אינו מלא', missing: check.missing }, { status: 400 })
  }

  const layout = await loadLayout(db)
  const bytes = await buildRabbiFormPdf(body as RabbiFormData, layout)
  const safeName = String(body.applicantName ?? '').replace(/[\\/:*?"<>|]/g, '')
  return pdfResponse(bytes, `טופס חתימת רב — ${safeName}.pdf`)
}
