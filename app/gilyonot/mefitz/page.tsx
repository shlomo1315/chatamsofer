import type { Metadata } from 'next'
import Image from 'next/image'
import MefitzClient from './MefitzClient'

export const metadata: Metadata = {
  title: 'ממשק המפיצים | גיליונות החתם סופר',
  description: 'אזור אישי למפיצי גיליונות החתם סופר: כמות הגיליונות, דיווח קבלה ותקלות, בקשות שינוי ועדכון כתובת.',
  robots: { index: false, follow: false },
}

// ממשק המפיץ — כניסה בקוד חד-פעמי (/api/gilyonot/mefitz/login), נתונים ופעולות (/api/gilyonot/mefitz).
export default function Page() {
  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-8 text-center">
          <Image
            src="/logo-heichal-bw.png" alt="היכל החתם סופר"
            width={900} height={903} priority className="mx-auto mb-5 h-auto w-20 mix-blend-multiply"
          />
          <p className="text-sm font-medium text-slate-600">גיליונות החתם סופר</p>
          <h1 className="mt-2 text-2xl font-bold leading-snug" style={{ color: '#1B3256' }}>ממשק המפיצים</h1>
        </header>
        <MefitzClient />
      </div>
    </main>
  )
}
