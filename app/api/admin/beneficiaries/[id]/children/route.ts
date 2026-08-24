import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { childrenPayload, type EditableChild } from '@/lib/childrenEditor'

export const dynamic = 'force-dynamic'

// שמירת רשימת הילדים מתוך הכרטסת (טאב "ילדים").
//
// ⚠️ אין middleware במערכת — כל נתיב API מגן על עצמו. עריכת ילדים היא
// הרשאת עריכה בסעיף הצאצאים, לא מנהל בלבד (מזכירה עורכת כרטסת).
//
// ⚠️ children ו-children_count נשמרים תמיד יחד דרך childrenPayload —
// שמירה של אחד בלי השני הציגה "5 ילדים" מעל טבלה של 3.
export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = await requirePermission('beneficiaries', 'edit')
  if (!staff) return forbidden('אין הרשאה לערוך פרטי ילדים')

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'חסר מזהה משפחה' }, { status: 400 })

  const body = await request.json().catch(() => null) as
    | { children?: EditableChild[]; maternityAidIdsToDelete?: string[] }
    | null
  if (!body || !Array.isArray(body.children)) {
    return NextResponse.json({ error: 'נתונים חסרים' }, { status: 400 })
  }
  if (body.children.length > 30) {
    return NextResponse.json({ error: 'לא ניתן לרשום יותר מ-30 ילדים' }, { status: 400 })
  }

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // המצב הקודם — לתיעוד ולזיהוי מה נמחק בפועל
  const { data: before, error: readErr } = await admin
    .from('beneficiaries')
    .select('children, children_count')
    .eq('id', id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!before) return NextResponse.json({ error: 'המשפחה לא נמצאה' }, { status: 404 })

  const prevCount = Array.isArray((before as { children?: unknown[] }).children)
    ? (before as { children: unknown[] }).children.length
    : 0

  const payload = childrenPayload(body.children)

  const { error } = await admin.from('beneficiaries').update(payload).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // מחיקת תיקי הלידה שהמשתמש בחר למחוק יחד עם הילדים.
  // ⚠️ אחרי עדכון הכרטסת ולא לפני: deleteMaternityAid הקיים מסיר את הילד
  // מהכרטסת בעצמו, וסדר הפוך היה מחזיר את הרשימה הישנה.
  const aidIds = Array.isArray(body.maternityAidIdsToDelete) ? body.maternityAidIdsToDelete.filter(Boolean) : []
  const deletedAids: string[] = []
  for (const aidId of aidIds) {
    // רק תיקים של אותה משפחה — הגנה מפני מזהה זר שנשלח מהלקוח
    const { error: delErr } = await admin
      .from('maternity_aids')
      .delete()
      .eq('id', aidId)
      .eq('beneficiary_id', id)
    if (delErr) console.error('[children] מחיקת תיק לידה נכשלה:', delErr.message)
    else deletedAids.push(aidId)
  }

  await logActivity(admin, {
    userId: staff.userId,
    action: 'children.update',
    entityType: 'beneficiary',
    entityId: id,
    details: {
      before: prevCount,
      after: payload.children_count,
      maternity_aids_deleted: deletedAids,
    },
  })

  return NextResponse.json({
    ok: true,
    children_count: payload.children_count,
    maternityAidsDeleted: deletedAids,
  })
}
