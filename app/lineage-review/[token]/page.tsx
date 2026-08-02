import LineageReviewClient from './LineageReviewClient'

export const dynamic = 'force-dynamic'

// עמוד ציבורי — בן משפחה עובר על ענף עץ הדורות ומאשר / דוחה / מתקן, דרך לינק אישי.
// כל האימות והגבלת ה-scope נעשים ב-API (GET מחזיר רק את תת-העץ המורשה).
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <LineageReviewClient token={token} />
}
