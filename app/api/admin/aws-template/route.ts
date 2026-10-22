import { NextResponse } from 'next/server'
import { requireAdmin, forbidden } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// הורדת תבנית ההקמה של AWS (aws/infrastructure.yml) מ-main. מנהל בלבד.
const TEMPLATE_URL =
  'https://raw.githubusercontent.com/shlomo1315/chatamsofer/main/aws/infrastructure.yml'

export async function GET() {
  if (!(await requireAdmin())) return forbidden()
  const res = await fetch(TEMPLATE_URL, { cache: 'no-store' })
  if (!res.ok) return NextResponse.json({ error: 'שליפת התבנית נכשלה' }, { status: 502 })
  return new NextResponse(await res.text(), {
    headers: {
      'Content-Type': 'text/yaml; charset=utf-8',
      'Content-Disposition': 'attachment; filename="infrastructure.yml"',
    },
  })
}
