import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { roleAllows } from '@/lib/permissions'
import type { UserPermissions } from '@/types'
import { recheckAfterLineageEdit } from '@/lib/lineageEditRecheck'
import { autoSendLineageFixLink } from '@/lib/lineageInquiry'

export const dynamic = 'force-dynamic'

// שדות שמותר לעדכן מעריכת התיק. כל מה שלא ברשימה נזרק.
export const EDITABLE_FIELDS = [
  'family_name', 'id_number', 'id_doc_type', 'full_name', 'phone', 'phone2', 'email', 'address', 'city',
  'birth_date', 'gender', 'marital_status', 'spouse_name', 'spouse_id_number', 'spouse_doc_type',
  'spouse_birth_date', 'spouse_phone', 'children', 'children_count', 'notes', 'lineage_node_id',
  'lineage_manual', 'eligibility_status', 'is_special', 'community_affiliation',
] as const

export function pickEditable(raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const k of EDITABLE_FIELDS) {
    if (k in (raw as Record<string, unknown>)) out[k] = (raw as Record<string, unknown>)[k]
  }
  return out
}

// 🔒 עריכת תיק צאצא — לפי הרשאת עריכה בצאצאים (מנהל, או מזכירה שסומנה לה עריכה),
// גם אם הלקוח הסתיר את הכפתור.
// פעולות: save (שמירת שינויים + מחיקת תיקי לידה שנבחרו) ו-approve-birth.
// ⚠️ אישור לידה ומחיקת תיק לידה נוגעים בטבלת היולדות, ולכן דורשים גם עריכה ביולדות.
export async function POST(request: NextRequest) {
  const staff = await requirePermission('beneficiaries', 'edit')
  if (!staff) return forbidden('אין הרשאת עריכה בצאצאים')
  const canEditMaternity = staff.role === 'admin'
    || roleAllows(staff.role, staff.permissions as UserPermissions, 'maternity', 'edit')
  const body = await request.json().catch(() => ({}))
  const toDelete: string[] = Array.isArray(body.maternityToDelete) ? body.maternityToDelete.filter((x: unknown) => typeof x === 'string') : []
  if ((body.action === 'approve-birth' || toDelete.length) && !canEditMaternity) {
    return forbidden('אישור לידה ומחיקת תיק לידה דורשים הרשאת עריכה ביולדות')
  }
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  if (body.action === 'approve-birth') {
    const aidId = typeof body.aidId === 'string' ? body.aidId : ''
    if (!aidId) return NextResponse.json({ error: 'חסר מזהה לידה' }, { status: 400 })
    const { error } = await admin.from('maternity_aids').update({ status: 'active' }).eq('id', aidId).eq('beneficiary_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const payload = pickEditable(body.payload)
  if (Object.keys(payload).length === 0) return NextResponse.json({ error: 'אין מה לשמור' }, { status: 400 })

  // כפילות ת.ז. מול כרטסת אחרת
  if (typeof payload.id_number === 'string' && payload.id_number) {
    const { data: dup } = await admin.from('beneficiaries').select('id').eq('id_number', payload.id_number).neq('id', id).limit(1).maybeSingle()
    if (dup) return NextResponse.json({ error: 'תעודת זהות זו כבר קיימת במערכת — לא ניתן לרשום אותה שוב' }, { status: 409 })
  }

  // שינוי שושלת: השרשרת, הסטטוס והסיבה מחושבים מחדש — ראו lib/lineageEditRecheck.
  let lineageExtra: Record<string, unknown> = {}
  try { lineageExtra = await recheckAfterLineageEdit(admin, id, payload) }
  catch (e) { console.error('[beneficiaries/update] בדיקת השושלת מחדש נכשלה:', e instanceof Error ? e.message : e) }

  const { error } = await admin.from('beneficiaries').update({ ...payload, ...lineageExtra, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // שינוי שושלת שהשאיר בבדיקה מעמיקה בגלל אי-התאמה לקובץ → קישור לתיקון (ראו lib/lineageInquiry).
  if ('lineage_node_id' in payload || 'lineage_manual' in payload || 'eligibility_status' in payload) {
    await autoSendLineageFixLink(admin, id, staff.userId)
  }

  // תיקי לידה נמחקים רק אחרי שמירת הכרטסת, וכשל כאן לא מבטל אותה
  let maternityError: string | null = null
  if (toDelete.length) {
    const { error: aidErr } = await admin.from('maternity_aids').delete().in('id', toDelete).eq('beneficiary_id', id)
    if (aidErr) maternityError = aidErr.message
  }
  return NextResponse.json({ ok: true, maternityError })
}
