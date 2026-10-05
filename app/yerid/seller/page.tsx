import SellerClient from './SellerClient'

// אזור המוכרים בדוכן היריד.
//
// 🔴 נפרד מאזור הניהול בכוונה: הדוכן מופעל ע"י מתנדבים מתחלפים שאין
// להם חשבון במערכת, והאזור הזה מאפשר לרשום מכירות ולמסור הזמנות
// לאיסוף עצמי — לא לשנות מחירים ולא למחוק ספרים. נתוני לקוח: רק שם
// + 4 ספרות טלפון בהתאמה מדויקת (ראו lib/bookFairStandPickup.ts).
//
// ⚠️ אין כאן SSR של נתונים: הקטלוג נטען בלקוח אחרי אימות הסשן, כדי
// שמלאי הדוכן לא יישלח ב-HTML למי שאינו מחובר.

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'דוכן היריד — מכירה',
  robots: { index: false, follow: false },
}

export default function SellerPage() {
  return <SellerClient />
}
