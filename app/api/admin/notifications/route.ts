import { NextResponse } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'

// התראות מערכת. כרגע: תשובות שהתקבלו בבירורי הלוואות.
// מובנה כרשימה גנרית, כך שהוספת סוג התראה חדש היא הוספת בלוק אחד.
export const dynamic = 'force-dynamic'

export interface Notification {
  id: string
  kind: 'loan_reply' | 'name_change'
  title: string
  detail: string
  href: string
  at: string
}

/** שם השדה המבוקש — נאמר במפורש בהתראה, כדי שיהיה ברור מה עומד להשתנות. */
const NAME_TARGET_LABEL: Record<string, string> = {
  self: 'שם הבעל',
  spouse: 'שם האישה',
  family: 'שם המשפחה',
}

export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const isAdmin = staff.role === 'admin'
  const canLoans = isAdmin || ['view', 'edit', 'add'].includes(String(staff.permissions?.loans ?? ''))

  const items: Notification[] = []

  // ── תשובות שטרם נקראו בבירורי הלוואות ──
  if (canLoans) {
    const { data } = await db
      .from('loan_messages')
      .select('id, loan_id, body, created_at, loan:loans(beneficiary:beneficiaries(family_name, full_name))')
      .eq('direction', 'applicant')
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(20)

    for (const m of (data ?? []) as unknown as {
      id: string; loan_id: string; body: string; created_at: string
      loan?: { beneficiary?: { family_name?: string; full_name?: string } }
    }[]) {
      const ben = m.loan?.beneficiary
      const name = [ben?.family_name, ben?.full_name].filter(Boolean).join(' ') || 'מבקש'
      items.push({
        id: m.id,
        kind: 'loan_reply',
        title: `הודעה חדשה בהלוואה — ${name}`,
        detail: m.body.slice(0, 90) + (m.body.length > 90 ? '…' : ''),
        href: `/admin/loans/${m.loan_id}`,
        at: m.created_at,
      })
    }
  }

  // ── בקשות לתיקון שם שממתינות לאישור ──
  //
  // 🔴 חסרו כאן לגמרי: הפעמון הציג רק תשובות בהלוואות, ולכן משפחה שהגישה
  // בקשת תיקון שם לא יצרה שום התראה — הבקשה נראתה רק למי שפתח במקרה את
  // החלונית או את מסך "ממתינים לטיפול".
  const canBens = isAdmin || ['view', 'edit', 'add'].includes(String(staff.permissions?.beneficiaries ?? ''))
  if (canBens) {
    const { data } = await db
      .from('name_change_requests')
      .select('id, beneficiary_id, target, old_name, new_name, requested_at, beneficiary:beneficiaries(family_name, full_name)')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(20)

    for (const r of (data ?? []) as unknown as {
      id: string; beneficiary_id: string; target: string
      old_name: string | null; new_name: string; requested_at: string
      beneficiary?: { family_name?: string; full_name?: string }
    }[]) {
      const ben = r.beneficiary
      const name = [ben?.family_name, ben?.full_name].filter(Boolean).join(' ') || 'משפחה'
      const field = NAME_TARGET_LABEL[r.target] ?? 'שם'
      items.push({
        id: r.id,
        kind: 'name_change',
        // ⚠️ שם השדה בכותרת: בלעדיו ההתראה אומרת רק "בקשת תיקון שם" ואי
        // אפשר לדעת אם מדובר בבעל, באישה או בשם המשפחה בלי לפתוח אותה.
        title: `בקשת תיקון ${field} — ${name}`,
        detail: `${r.old_name || '—'} ← ${r.new_name}`,
        href: `/admin/beneficiaries/${r.beneficiary_id}`,
        at: r.requested_at,
      })
    }
  }

  items.sort((a, b) => b.at.localeCompare(a.at))
  return NextResponse.json({ notifications: items, count: items.length })
}
