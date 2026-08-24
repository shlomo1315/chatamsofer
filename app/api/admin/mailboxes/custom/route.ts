import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import {
  loadCustomMailboxes, saveCustomMailboxes, mailboxKeyFor, isValidMailbox,
  type CustomMailbox,
} from '@/lib/customMailboxes'
import { DEPARTMENTS } from '@/lib/departments'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// תיבות מייל שנוספו מהממשק.
//
// 🔴 DEPARTMENTS קבוע בקוד: הוספת כתובת חייבה שינוי קוד ופריסה, ולכן
// אי אפשר היה להפעיל מענה אוטומטי לכתובת חדשה בלי מפתח.
//
// ⚠️ אין middleware — הנתיב מגן על עצמו.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const ctx = await requirePermission('reports', 'view')
  if (!ctx || ctx instanceof NextResponse) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  return NextResponse.json({ mailboxes: await loadCustomMailboxes(db) })
}

/** POST — הוספת תיבה. גוף: { label, email, color? } */
export async function POST(request: NextRequest) {
  const staff = await requirePermission('reports', 'edit')
  if (!staff || staff instanceof NextResponse) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = (await request.json().catch(() => null)) as Partial<CustomMailbox> | null
  const email = (body?.email ?? '').trim().toLowerCase()
  const label = (body?.label ?? '').trim()

  if (!isValidMailbox({ email, label })) {
    return NextResponse.json({ error: 'כתובת או שם התיבה אינם תקינים' }, { status: 400 })
  }

  // ⚠️ התנגשות עם מחלקה קבועה נחסמת: שתי רשומות לאותה כתובת היו
  // מייצרות שני מענים אוטומטיים לאותו מייל נכנס.
  if (Object.values(DEPARTMENTS).some(d => d.email.toLowerCase() === email)) {
    return NextResponse.json({ error: 'הכתובת כבר קיימת כמחלקה במערכת' }, { status: 409 })
  }

  const existing = await loadCustomMailboxes(db)
  if (existing.some(m => m.email === email)) {
    return NextResponse.json({ error: 'התיבה כבר קיימת' }, { status: 409 })
  }

  const next = [...existing, {
    key: mailboxKeyFor(email),
    label,
    email,
    color: (body?.color ?? '').trim() || '#64748b',
  }]
  const saved = await saveCustomMailboxes(db, next)

  await logActivity(db, {
    userId: staff.userId,
    action: 'custom_mailbox_added',
    entityType: 'mailbox',
    details: { email, label },
  })

  return NextResponse.json({ ok: true, mailboxes: saved })
}

/** DELETE — הסרת תיבה. גוף: { email } */
export async function DELETE(request: NextRequest) {
  const staff = await requirePermission('reports', 'edit')
  if (!staff || staff instanceof NextResponse) return forbidden()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = (await request.json().catch(() => null)) as { email?: string } | null
  const email = (body?.email ?? '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'חסרה כתובת' }, { status: 400 })

  const existing = await loadCustomMailboxes(db)
  const next = existing.filter(m => m.email !== email)
  if (next.length === existing.length) {
    return NextResponse.json({ error: 'התיבה לא נמצאה' }, { status: 404 })
  }

  // ⚠️ הגדרות המענה של התיבה נשארות ב-app_settings במכוון: הוספה חוזרת
  // של אותה כתובת תשחזר אותן, ומחיקה בטעות אינה מוחקת נוסח שנכתב.
  const saved = await saveCustomMailboxes(db, next)

  await logActivity(db, {
    userId: staff.userId,
    action: 'custom_mailbox_removed',
    entityType: 'mailbox',
    details: { email },
  })

  return NextResponse.json({ ok: true, mailboxes: saved })
}
