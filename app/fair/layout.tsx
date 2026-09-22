import type { Metadata } from 'next'

// מסגרת החנות הציבורית.
//
// ⚠️ מחוץ ל-/admin לחלוטין, ולכן אינה עוברת דרך ה-proxy ואינה נושאת
// את עלות אימות הסשן. זו הכוונה — הלקוח קונה בלי הרשמה.

export const metadata: Metadata = {
  title: 'יריד הספרים — היכל החתם סופר',
  description: 'הזמנת ספרים מיריד הספרים',
}

export default function FairLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {children}
    </div>
  )
}
