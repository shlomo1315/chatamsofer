import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { defaultRecoveryDays } from '@/lib/maternity'
import { validateIsraeliId } from '@/lib/validation'

export const dynamic = 'force-dynamic'

const BUCKET = 'documents'
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', gif: 'image/gif', pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

// ─────────────────────────────────────────────────────────────────────────────
// פתיחת תיק יולדת חדש — server-side, עם service-role.
// ⚠️ קודם העמוד (app/admin/maternity/new/page.tsx) עשה את כל הפעולות מהדפדפן
// עם ה-JWT של הצוות, ולכן נכשל ב-"new row violates row-level security policy":
// העלאת אישור הלידה ל-Storage כפופה למדיניות RLS, וכל שינוי בהקשחת ה-RLS עלול
// לשבור אותה. כאן העלאת הקובץ + ה-inserts עוברים דרך service-role שעוקף RLS —
// בדיוק כמו זרימת ההעלאה של הפורטל הציבורי (app/api/portal/upload-docs).
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  if (!(await requirePermission('maternity', 'edit'))) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let form: FormData
  try { form = await request.formData() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  // ── קריאת השדות (נשלחים כ-JSON תחת המפתח 'payload', + קובץ 'file') ──
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(String(form.get('payload') ?? '{}'))
  } catch {
    return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 })
  }

  const motherId = String(payload.motherId ?? '')
  if (!motherId) return NextResponse.json({ error: 'חסר מזהה יולדת' }, { status: 400 })

  // אימות שהיולדת קיימת — ומשיכת children הנוכחיים (לעדכון כרטסת המשפחה)
  const { data: mother, error: mErr } = await admin
    .from('beneficiaries')
    .select('id, children, children_count')
    .eq('id', motherId)
    .maybeSingle()
  if (mErr || !mother) return NextResponse.json({ error: 'היולדת לא נמצאה' }, { status: 404 })

  // ── העלאת אישור הלידה (חובה) דרך service-role ──
  const file = form.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'יש לצרף אישור לידה' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'הקובץ גדול מ-10MB' }, { status: 400 })
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const contentType = ALLOWED_TYPES[ext]
  if (!contentType) {
    return NextResponse.json({ error: 'סוג הקובץ אינו נתמך. ניתן להעלות תמונות, PDF או Word.' }, { status: 400 })
  }
  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  const path = `maternity/${motherId}/${Date.now()}_${safeName}`
  const arrayBuffer = await file.arrayBuffer()
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, arrayBuffer, {
    contentType, upsert: true,
  })
  if (upErr) return NextResponse.json({ error: `שגיאה בהעלאת אישור הלידה: ${upErr.message}` }, { status: 500 })
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path)
  const certUrl = pub.publicUrl

  // ── חישוב חלון 6 שבועות (זהה לעמוד המקורי) ──
  const babyBirthDate = String(payload.babyBirthDate ?? '')
  const sixEnd = new Date(new Date(babyBirthDate).getTime() + 42 * 86400000).toISOString().split('T')[0]

  const isTwins = payload.isTwins === true
  const recoveryDaysOverride = payload.recoveryDaysOverride
  const cardLoadAmount = payload.cardLoadAmount

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawBabies = ((payload.babies as any[]) ?? []).slice(0, isTwins ? 2 : 1)

  // ── אימות ת"ז + מניעת כפילות (היה חסר לגמרי במסלול המנהל!) ──
  // בלי זה נשמרו לידות עם ת"ז לא תקינה (000000000) ולידות כפולות על אותו תינוק.
  // מנרמלים כל תינוק, מאמתים, ובודקים כפילות — בדיוק כמו במסלול הציבורי.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const babies: any[] = []
  for (const b of rawBabies) {
    const idRaw = b?.id_number ? String(b.id_number).trim() : ''
    const isPass = b?.id_type === 'passport'
    if (!idRaw) return NextResponse.json({ error: 'יש להזין תעודת זהות או דרכון של הנולד/ת' }, { status: 400 })
    if (!isPass && !validateIsraeliId(idRaw)) {
      return NextResponse.json({ error: `תעודת הזהות של הנולד/ת (${idRaw}) אינה תקינה` }, { status: 400 })
    }
    const idNorm = isPass ? idRaw : idRaw.replace(/\D/g, '').padStart(9, '0')
    babies.push({ ...b, id_number: idNorm, id_type: isPass ? 'passport' : 'id' })
  }
  // תאומים — שתי ת"ז שונות
  if (isTwins && babies.length === 2 && babies[0].id_number === babies[1].id_number) {
    return NextResponse.json({ error: 'שני התאומים חייבים להיות עם תעודות זהות שונות' }, { status: 400 })
  }
  // מניעת בקשה כפולה על אותו תינוק (לפי ת"ז, בכל סטטוס פרט ל-cancelled)
  for (const b of babies) {
    const idNorm = b.id_number as string
    const idVariants = Array.from(new Set([idNorm, idNorm.replace(/^0+/, '')].filter(Boolean)))
    const { data: existing } = await admin
      .from('maternity_aids')
      .select('id, status')
      .in('baby_id_number', idVariants)
      .not('status', 'eq', 'cancelled')
      .limit(1)
    if (existing?.length) {
      return NextResponse.json({
        error: `כבר קיימת בקשת לידה על תעודת זהות ${idNorm}. לא ניתן לפתוח תיק כפול על אותו תינוק.`,
      }, { status: 409 })
    }
  }
  // ה-baby הראשי לשדות ה-top-level (baby_id_number וכו')
  const primaryBaby = babies[0]

  // ── insert לתיק היולדת (זהה לשדות המקוריים) ──
  const { data: inserted, error: insErr } = await admin
    .from('maternity_aids')
    .insert({
      beneficiary_id: motherId,
      birth_date: babyBirthDate,
      baby_name: (payload.babyName as string) || null,
      baby_id_type: primaryBaby.id_type,
      baby_id_number: primaryBaby.id_number,
      baby_gender: (payload.babyGender as string) || null,
      is_twins: isTwins,
      babies,
      recovery_eligibility_days: recoveryDaysOverride !== '' && recoveryDaysOverride != null
        ? Number(recoveryDaysOverride) : defaultRecoveryDays(isTwins),
      birth_certificate_url: certUrl,
      recovery_home: (payload.recoveryHome as string) || null,
      notes: (payload.notes as string) || null,
      six_weeks_end: sixEnd,
      card_balance: 0,
      weekly_amount: cardLoadAmount !== '' && cardLoadAmount != null ? Number(cardLoadAmount) : 0,
      total_weeks: cardLoadAmount !== '' && cardLoadAmount != null ? 1 : 6,
      status: 'pending',
    })
    .select()
    .single()
  if (insErr || !inserted) {
    // ניקוי הקובץ שהועלה כדי לא להשאיר יתום
    await admin.storage.from(BUCKET).remove([path]).catch(() => {})
    return NextResponse.json({ error: insErr?.message || 'שגיאה בפתיחת התיק' }, { status: 500 })
  }

  // ── הוספת התינוק/ות לכרטסת המשפחה (זהה למקור) ──
  const existingChildren = Array.isArray(mother.children) ? mother.children : []
  const newChildren = babies.map(b => ({
    name: (b.name ?? '') as string,
    id_number: b.id_number || null,
    doc_type: b.id_type,
    gender: b.gender || null,
    birth_date: babyBirthDate || null,
    marital_status: 'single',
    maternity_aid_id: inserted.id,
    birth_status: 'pending' as const,
  }))
  const updatedChildren = [...existingChildren, ...newChildren]
  await admin.from('beneficiaries')
    .update({ children: updatedChildren, children_count: updatedChildren.length })
    .eq('id', motherId)

  return NextResponse.json({ ok: true, id: inserted.id })
}
