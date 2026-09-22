import { redirect } from 'next/navigation'

// כתובת קצרה לניהול יריד הספרים.
//
// ⚠️ הפניה בלבד, ובכוונה: המסכים עצמם יושבים תחת /admin/book-fair,
// שם מנגנון ההרשאות הקיים כבר מגן עליהם (guardPage + proxy). כתובת
// ניהול שיושבת מחוץ ל-/admin הייתה דורשת מערכת כניסה שנייה — ושתי
// מערכות כניסה הן שתי הזדמנויות לפער הרשאות.
//
// מי שאין לו הרשאת 'יריד ספרים' יגיע למסך ויוחזר ללוח הבקרה.

export default function YeridAdminRedirect() {
  redirect('/admin/book-fair')
}
