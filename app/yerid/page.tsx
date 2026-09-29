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
  const { books, cities, tiers, open, openAt } = await getData()
  return <FairStore books={books} cities={cities} tiers={tiers} open={open} openAt={openAt} />
}
