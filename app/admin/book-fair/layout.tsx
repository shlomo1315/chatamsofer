import BookFairNav from './BookFairNav'

// מסגרת מחלקת יריד הספרים.
//
// ⚠️ ה-layout ולא הוספה ידנית בכל מסך: כך כל מסך שייווסף בעתיד מקבל
// את הניווט בלי שאיש יצטרך לזכור, ואי אפשר ליצור בטעות מסך שממנו
// אין דרך חזרה.

export default function BookFairLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <BookFairNav />
      {children}
    </div>
  )
}
