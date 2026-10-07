import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/apiAuth'
import { getData } from '../yerid/getData'
import { bookFairPreviewToken } from '@/lib/bookFairPreview'
import FairStore from '../yerid/YeridStore'

// תצוגה מקדימה נסתרת של חנות יריד הספרים — זהה לגמרי ל-/yerid, אבל
// מציגה את החנות המלאה גם כש-book_fair_open=false.
//
// 🔴 לא מקושר משום עמוד באתר ולא ב-sitemap (אין sitemap דינמי בפרויקט).
//
// 🔴 מקבל גם אסימון הזמנה חתום (lib/bookFairPreview): בלעדיו אפשר היה
// לראות את הקטלוג אך כל ניסיון תשלום נחסם ב-403 "היריד סגור להזמנות",
// כלומר בדיוק מסלול הרכישה — מה שהכי חשוב לבדוק לפני פתיחה — לא היה
// ניתן לבדיקה. האסימון אינו פותח את היריד לציבור: הוא עובר רק בנתיב הזה.

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

export default async function FairPreviewPage() {
  // 🔴 צוות בלבד (ביקורת אבטחה 07.10): "נסתר" אינו הגנה. הנתיב היה פתוח
  // לכל העולם, וכל מבקר קיבל אסימון שמאפשר להזמין גם כשהיריד סגור לעונה.
  // ⚠️ notFound ולא הפניה לכניסה — לא חושפים שהנתיב קיים.
  if (!(await requireStaff())) notFound()

  const { books, cities, tiers, openAt, pickup } = await getData(true)
  return (
    <FairStore
      books={books} cities={cities} tiers={tiers}
      open={true} openAt={openAt} pickup={pickup}
      previewToken={bookFairPreviewToken()}
    />
  )
}
