import { getData } from './getData'
import FairStore from './YeridStore'

// חנות יריד הספרים.
//
// ⚠️ הקטלוג נטען בשרת ולא בלקוח: הלקוח רואה ספרים מיד, בלי מסך טעינה
// ובלי סבב רשת נוסף. קהל היעד כולל מכשירים ישנים וחיבורים איטיים.
//
// ⚠️ השליפה עצמה יושבת ב-app/yerid/getData.ts, משותפת עם
// /api/yerid/catalog ועם /yerid101315 (תצוגה מקדימה נסתרת). עד היום
// היא הייתה משוכפלת בכמה מקומות — כולל כלל הפרטיות "כמות → דגל
// בלבד" — ושכפול כזה סוטה עם הזמן.

export const dynamic = 'force-dynamic'

export type { PublicBook, PublicCity, PublicTier } from './getData'

export default async function FairPage() {
  const { books, cities, tiers, open, openAt, pickup } = await getData()
  // ⚠️ רמז חיבור מוקדם לאחסון התמונות: בלעדיו הדפדפן פותח DNS+TLS
  // מול Supabase רק כשהוא מגיע לכריכה הראשונה, וזה מוסיף סבב שלם
  // לפני שנראית תמונה אחת.
  const storage = process.env.NEXT_PUBLIC_SUPABASE_URL
  return (
    <>
      {storage && (
        <>
          <link rel="preconnect" href={storage} crossOrigin="" />
          <link rel="dns-prefetch" href={storage} />
        </>
      )}
      <FairStore books={books} cities={cities} tiers={tiers} open={open} openAt={openAt} pickup={pickup} />
    </>
  )
}
