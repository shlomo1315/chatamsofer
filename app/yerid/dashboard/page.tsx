import DashboardClient from './DashboardClient'

// לוח המנהל של היריד — קישור נפרד בסיסמה.
//
// ⚠️ אין כאן SSR של נתונים: הכול נטען בלקוח אחרי אימות הסשן, כדי שאף
// מספר לא יישלח ב-HTML למי שלא נכנס.

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'לוח המנהל — יריד הספרים',
  robots: { index: false, follow: false },
}

export default function DashboardPage() {
  return <DashboardClient />
}
