import MyOrderForm from './MyOrderForm'

// האזור האישי של יריד הספרים.
//
// 🔴 אין כאן התחברות: החנות פתוחה לכל אחד ואין בה חשבונות. הזיהוי הוא
// הטלפון שנרשם בהזמנה, וקישורי המעקב נשלחים למייל שבה — ראו ההערה
// ב-/api/yerid/my-orders להסבר למה לא מחזירים את ההזמנות ישירות.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'האזור האישי — יריד הספרים' }

export default function MyOrderPage() {
  return <MyOrderForm />
}
