import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient } from '@/lib/apiAuth'

// מחיקת משוב שהתקבל.
// אחרי המחיקה הקישור חוזר להיות פעיל — היולדת תוכל למלא מחדש.
export const dynamic = 'force-dynamic'

export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission('maternity', 'edit')
  if (ctx instanceof NextResponse) return ctx

  const { id } = await params
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { error } = await db.from('survey_responses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  console.log(`[feedback] משוב ${id} נמחק ע"י ${ctx?.email}`)
  return NextResponse.json({ ok: true })
}
