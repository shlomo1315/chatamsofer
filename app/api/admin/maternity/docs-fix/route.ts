import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { addBeneficiaryNote, resolveAuthorName } from '@/lib/beneficiaryNotes'
import { docsPendingEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { getDocTypes } from '@/lib/serverDocTypes'
import { docTypeLabel } from '@/lib/docTypes'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// "השלמת מסמכים" מתוך כרטסת הלידה.
//
// הרקע: כשמתגלה תקלה במסמכים של תיק לידה (ת"ז לא קריאה, ספח חסר, אישור לידה
// פגום), האפשרויות שהיו למזכירות היו רק "אשר" או "דחה". דחייה סוגרת את הבקשה
// ומייצרת ליולדת חוויה של סירוב, במקום לבקש ממנה פשוט לצרף שוב.
//
// כאן מופעל *אותו* מעגל התיקונים שקיים בכרטסת הצאצא: המשפחה עוברת ל-docs_pending
// עם רשימת המסמכים הנדרשים, נשלח מייל עם קישור לפורטל, וכשהיולדת מעלה את כל
// הנדרש המערכת מסמנת אוטומטית docs_returned (ראו maybeMarkDocsReturned).
// בקשת הלידה עצמה *אינה* משנה סטטוס — היא נשארת ממתינה עד שהמסמכים ייבדקו.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  await ensureEmailTexts()
  const staff = await requirePermission('maternity', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { aidId?: string; docs?: string[]; notes?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const aidId = String(body.aidId ?? '')
  const docs = (body.docs ?? []).map(d => String(d).trim()).filter(Boolean)
  const notes = (body.notes ?? '').trim()
  if (!aidId) return NextResponse.json({ error: 'חסר מזהה תיק לידה' }, { status: 400 })
  if (!docs.length) return NextResponse.json({ error: 'יש לסמן לפחות מסמך אחד' }, { status: 400 })

  const { data: aid, error: aidErr } = await db
    .from('maternity_aids')
    .select('id, beneficiary_id, baby_name, birth_date')
    .eq('id', aidId)
    .maybeSingle()
  if (aidErr || !aid) return NextResponse.json({ error: 'תיק הלידה לא נמצא' }, { status: 404 })

  const motherId = String(aid.beneficiary_id)
  const { data: mother } = await db
    .from('beneficiaries')
    .select('id, email, full_name, family_name, marital_status')
    .eq('id', motherId)
    .maybeSingle()
  if (!mother) return NextResponse.json({ error: 'לא נמצאה משפחה לתיק זה' }, { status: 404 })

  // ── מעבר למעגל התיקונים ──
  // ⚠️ אותם שדות בדיוק כמו ב-StatusControl של הצאצא. איפוס חותמות הסבב הקודם
  // הכרחי: בלעדיו הבאנר בפורטל משווה מול סבב ישן ומציג תיקונים שכבר בוצעו.
  //
  // ⚠️ מפוצל לשתי כתיבות בכוונה. חותמות הדחייה (rejected_by/rejected_at) הן
  // עמודות שנוספו במיגרציה מאוחרת; בסביבה שהמיגרציה טרם רצה בה כל העדכון נכשל
  // ("עדכון סטטוס המשפחה נכשל") — כלומר אי אפשר היה בכלל לבקש השלמת מסמכים,
  // רק בגלל ניקוי נלווה. הליבה נכתבת תמיד, וניקוי החותמות הוא best-effort.
  const { error: upErr } = await db.from('beneficiaries').update({
    eligibility_status: 'docs_pending',
    required_docs: docs.join(','),
    docs_sent_at: new Date().toISOString(),
    docs_returned_at: null,
    lineage_fixed_at: null,
    lineage_chain_before_fix: null,
    updated_at: new Date().toISOString(),
  }).eq('id', motherId)
  if (upErr) {
    console.error('[maternity/docs-fix] update beneficiary failed:', upErr.message)
    return NextResponse.json({ error: `עדכון סטטוס המשפחה נכשל: ${upErr.message}` }, { status: 500 })
  }
  await db.from('beneficiaries')
    .update({ rejected_by: null, rejected_at: null })
    .eq('id', motherId)
    .then(undefined, () => {})

  const staffName = await resolveAuthorName(db, staff.userId)
  const types = await getDocTypes()
  const labels = docs.map(k => docTypeLabel(k, types))

  // ── תיעוד: היסטוריית הבקשות + תיבת התיעוד של המשפחה ──
  // הבקשה נרשמת גם ב-docs_fix_requests (הבאנר "מה ביקשנו") וגם בתיעוד, כדי
  // שבעוד חודשיים אפשר יהיה לראות מה בדיוק ביקשנו ומי ביקש.
  await db.from('docs_fix_requests').insert({
    beneficiary_id: motherId,
    required_docs: docs.join(','),
    docs_notes: notes || null,
    lineage_fix_required: false,
    requested_by: staff.userId,
    requested_by_name: staffName,
  }).then(undefined, () => {})

  const babyLabel = aid.baby_name?.trim() || (aid.birth_date ? new Date(String(aid.birth_date)).toLocaleDateString('he-IL') : '')
  const lines = [`📄 נדרשת השלמת מסמכים — מתוך בקשת הלידה${babyLabel ? ` (${babyLabel})` : ''}`]
  lines.push(`מסמכים שנדרשו: ${labels.join(' · ')}`)
  if (notes) lines.push(`הערה שנשלחה ליולדת: ${notes}`)

  void addBeneficiaryNote(db, {
    beneficiaryId: motherId,
    body: lines.join('\n'),
    authorId: staff.userId,
    authorName: staffName,
  }).catch(() => {})

  // ── המייל ליולדת ──
  // כשל בשליחה אינו מבטל את המעבר למעגל התיקונים: הסטטוס והתיעוד כבר נשמרו,
  // והמזכירות צריכה לדעת שהמייל לא יצא — ולכן מוחזר mailed:false ולא שגיאה.
  let mailed = false
  let mailError: string | null = null
  if (mother.email) {
    const name = [mother.family_name, mother.full_name].filter(Boolean).join(' ') || String(mother.full_name ?? '')
    const payload = docsPendingEmail(name, undefined, mother.marital_status, labels, notes || undefined, null)
    const result = await deliverMail(mother.email, payload.subject, payload.html, undefined, mailFor('igud'))
    mailed = result.ok
    if (!result.ok) mailError = result.error ?? 'שליחת המייל נכשלה'
  } else {
    mailError = 'למשפחה אין כתובת מייל במערכת'
  }

  return NextResponse.json({ ok: true, mailed, mailError, docs: labels })
}
