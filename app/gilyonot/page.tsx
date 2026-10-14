import type { Metadata } from 'next'
import Image from 'next/image'
import GilyonotForm from './GilyonotForm'

export const metadata: Metadata = {
  title: 'הרשמה לגיליון השבועי | גיליונות החתם סופר',
  description: 'הצטרפות לרשימת התפוצה של גיליונות החתם סופר: הגיליון השבועי על הפרשה נשלח אליכם למייל בכל שבוע, בחינם.',
}

// עמוד ציבורי — הרשמה לרשימת התפוצה של הגיליון השבועי. השמירה: /api/gilyonot.
export default function Page() {
  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8 text-center">
          <Image
            src="/logo-voucher.png" alt="איגוד הצאצאים של רבינו החתם סופר, שע״י היכל החתם סופר"
            width={900} height={796} priority className="mx-auto mb-5 h-auto w-36 mix-blend-multiply"
          />
          <p className="text-sm font-medium text-slate-600">גיליונות החתם סופר</p>
          <h1 className="mt-2 text-2xl font-bold leading-snug" style={{ color: '#1B3256' }}>
            להרשמה להצטרפות לקבלת הגיליון השבועי במייל
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            בכל שבוע יישלח אליכם הגיליון על הפרשה, ישירות לתיבת המייל.
          </p>
        </header>
        <GilyonotForm />
      </div>
    </main>
  )
}
