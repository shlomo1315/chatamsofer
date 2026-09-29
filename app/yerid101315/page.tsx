import { getData } from '../yerid/getData'
import FairStore from '../yerid/YeridStore'

// תצוגה מקדימה נסתרת של חנות יריד הספרים — זהה לגמרי ל-/yerid, אבל
// מציגה את החנות המלאה גם כש-book_fair_open=false.
//
// 🔴 לא מקושר משום עמוד באתר ולא ב-sitemap (אין sitemap דינמי בפרויקט).
// אינו כותב open=true במסד: /api/yerid/checkout ממשיך לדחות הזמנות
// אמיתיות כל עוד היריד סגור בפועל — זו תצוגה בלבד, לא פתיחה. מיועד
// אך ורק לצוות כדי לבדוק שהחנות נראית תקין לפני הפתיחה הרשמית.

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function FairPreviewPage() {
  const { books, cities, tiers, openAt } = await getData(true)
  return <FairStore books={books} cities={cities} tiers={tiers} open={true} openAt={openAt} />
}
