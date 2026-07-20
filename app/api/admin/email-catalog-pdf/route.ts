import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { EMAIL_TEXTS_KEY, type EmailTexts } from '@/lib/emailCatalog'
import { buildEmailCatalogHtml } from '@/lib/emailCatalogHtml'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

// מסמך HTML מרוכז של כל נוסחי המיילים — מעוצב כמו המייל, נפתח בטאב חדש.
// עם הנוסח האפקטיבי (הערוך בהגדרות, ובהיעדרו ברירת המחדל שבקוד).
export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  try {
    // הטקסטים הערוכים מ-app_settings (אם קיימים) — אחרת ברירות המחדל שבקוד.
    let texts: EmailTexts = {}
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (url && key) {
      const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
      const { data } = await admin.from('app_settings').select('value').eq('key', EMAIL_TEXTS_KEY).maybeSingle()
      if (data?.value) { try { texts = JSON.parse(String(data.value)) } catch { /* נעשה שימוש בברירות המחדל */ } }
    }

    const html = buildEmailCatalogHtml(texts)
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (e) {
    console.error('[email-catalog-html] build failed:', e)
    return NextResponse.json({ error: `שגיאה בהפקת המסמך: ${e instanceof Error ? e.message : String(e)}` }, { status: 500 })
  }
}
