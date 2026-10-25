import { NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { cleanExceptionHome, checkReceipt, receiptDisplayName } from '@/lib/recoveryException'

// בית החלמה חריג (מנהל ומזכירות): היולדת הולכת למקום שאינו ברשימה, משלמת
// ומביאה קבלה. שם המקום נשמר ב-recovery_home ומסומן recovery_exception, והקבלה
// עולה לדלי הפרטי documents תחת maternity-exception/<aidId>/ (בלי מזהה המוטב
// בנתיב, ולכן הפורטל לא יכול לגשת אליה). הקובץ לא חובה: אפשר לסמן עכשיו
// ולצרף את הקבלה כשהיא מגיעה. אין שליחת שובר, כי התשלום הוא לפי קבלה.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const staff = await requirePermission('maternity', 'edit')
  if (!staff) return forbidden('אין הרשאה לאשר בית החלמה חריג')
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })

  const aidId = typeof form.get('aidId') === 'string' ? String(form.get('aidId')) : ''
  if (!/^[0-9a-f-]{36}$/i.test(aidId)) return NextResponse.json({ error: 'חסר מזהה תיק' }, { status: 400 })
  const home = cleanExceptionHome(form.get('home'))
  if (!home) return NextResponse.json({ error: 'יש להזין שם בית החלמה / מלון (עד 120 תווים)' }, { status: 400 })
  const noteRaw = form.get('note')
  const note = typeof noteRaw === 'string' ? noteRaw.trim().slice(0, 1000) : ''

  const file = form.get('file')
  const hasFile = file instanceof File && file.size > 0
  let ext = ''
  if (hasFile) {
    const check = checkReceipt(file.type, file.size)
    if ('error' in check) return NextResponse.json({ error: check.error }, { status: 400 })
    ext = check.ext
  }

  const { data: aid } = await db
    .from('maternity_aids')
    .select('id, recovery_home, recovery_exception_receipt_path')
    .eq('id', aidId)
    .maybeSingle()
  if (!aid) return NextResponse.json({ error: 'התיק לא נמצא' }, { status: 404 })

  const update: Record<string, unknown> = {
    recovery_home: home,
    recovery_exception: true,
    recovery_exception_note: note || null,
    recovery_exception_by: staff.userId,
    recovery_exception_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  let newPath: string | null = null
  if (hasFile) {
    newPath = `maternity-exception/${aidId}/${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await db.storage.from('documents')
      .upload(newPath, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
    if (upErr) {
      console.error('[recovery-exception] העלאה נכשלה:', upErr.message)
      return NextResponse.json({ error: 'העלאת הקבלה נכשלה' }, { status: 500 })
    }
    update.recovery_exception_receipt_path = newPath
    update.recovery_exception_receipt_name = receiptDisplayName(file.name, ext)
  }

  const { error } = await db.from('maternity_aids').update(update).eq('id', aidId)
  if (error) {
    if (newPath) await db.storage.from('documents').remove([newPath]).then(undefined, () => {})
    console.error('[recovery-exception] שמירה נכשלה:', error.message)
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }

  // קבלה שהוחלפה — מוחקים את הקודמת מהאחסון
  const oldPath = aid.recovery_exception_receipt_path as string | null
  if (newPath && oldPath && oldPath !== newPath) {
    await db.storage.from('documents').remove([oldPath]).then(undefined, () => {})
  }

  await logActivity(db, {
    userId: staff.userId, action: 'maternity_recovery_exception', entityType: 'maternity_aid', entityId: aidId,
    details: { from: aid.recovery_home ?? null, to: home, receipt: hasFile },
  })
  return NextResponse.json({ ok: true })
}
