import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { EMAIL_TEXTS_KEY, type EmailTexts } from '@/lib/emailCatalog'
import { buildEmailCatalogPdf } from '@/lib/emailCatalogPdf'

export const dynamic = 'force-dynamic'

// מסמך PDF מרוכז של כל נוסחי המיילים — עם הנוסח האפקטיבי (הערוך בהגדרות).
export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  // הטקסטים הערוכים מ-app_settings (אם קיימים) — אחרת ברירות המחדל שבקוד.
  let texts: EmailTexts = {}
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key) {
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data } = await admin.from('app_settings').select('value').eq('key', EMAIL_TEXTS_KEY).maybeSingle()
    if (data?.value) { try { texts = JSON.parse(String(data.value)) } catch { /* נעשה שימוש בברירות המחדל */ } }
  }

  const pdf = await buildEmailCatalogPdf(texts)
  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`נוסחי-מיילים-${today}.pdf`)}`,
    },
  })
}
