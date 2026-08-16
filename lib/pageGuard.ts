import { redirect } from 'next/navigation'
import type { SectionKey } from '@/types'
import { requireStaff } from '@/lib/apiAuth'
import { roleAllows, type PermAction } from '@/lib/permissions'

// ─────────────────────────────────────────────────────────────────────────────
// שמירת מסך ניהול (Server Component).
//
// ⚠️ למה זה נחוץ: הסתרת פריט מסרגל הניווט אינה הגנה. דפי הניהול הם Server
// Components ששולפים ישירות מהמסד — מי שמקליד את הכתובת ידנית קיבל את
// הנתונים במלואם, גם כשהפריט לא הוצג לו בתפריט. proxy.ts מאמת שהמשתמש הוא
// איש צוות פעיל, אך אינו יודע דבר על מטריצת ההרשאות לפי מחלקה.
//
// ⚠️ ההכרעה זהה ל-requirePermission של ה-API (אותה roleAllows בדיוק). מסך
// שנפתח בעוד ה-API שמאחוריו דוחה — או להפך — הוא באג משני הכיוונים.
//
// מפנה ללוח הבקרה ולא ל-403: המשתמש מחובר וזהותו תקינה, הוא פשוט אינו
// מורשה למחלקה הזו. מסך שגיאה אדום היה נראה כתקלה במערכת.
// ─────────────────────────────────────────────────────────────────────────────
export async function guardPage(section: SectionKey, action: PermAction = 'view') {
  const staff = await requireStaff()
  if (!staff) redirect('/login')
  if (staff.role === 'admin') return staff
  if (!roleAllows(staff.role, staff.permissions, section, action)) redirect('/admin/dashboard')
  return staff
}

// מסך השמור למנהל בלבד (הגדרות, אישורים חריגים).
export async function guardAdminPage() {
  const staff = await requireStaff()
  if (!staff) redirect('/login')
  if (staff.role !== 'admin') redirect('/admin/dashboard')
  return staff
}
