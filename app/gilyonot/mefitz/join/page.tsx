import type { Metadata } from 'next'
import Image from 'next/image'
import JoinForm from './JoinForm'

export const metadata: Metadata = {
  title: 'הצטרפות למערך המפיצים | גיליונות החתם סופר',
  description: 'טופס הצטרפות למפיצי גיליונות החתם סופר: פרטים, עיר לחלוקה וכמות משוערת. הבקשה נבדקת ומאושרת במשרד.',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

// טופס ההצטרפות הציבורי — שליחה ל-/api/gilyonot/mefitz/join, אישור במסך הניהול.
export default async function Page() {
  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-8 text-center">
          <Image
            src="/logo-heichal-bw.png" alt="היכל החתם סופר"
            width={900} height={903} priority className="mx-auto mb-5 h-auto w-20 mix-blend-multiply"
          />
          <p className="text-sm font-medium text-slate-600">גיליונות החתם סופר</p>
          <h1 className="mt-2 text-2xl font-bold leading-snug" style={{ color: '#2563eb' }}>הצטרפות למערך המפיצים</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
            ממלאים את הפרטים, והבקשה עוברת לאישור במשרד. אחרי האישור יישלח אליכם מייל עם כל הפרטים.
          </p>
        </header>
        <JoinForm />
      </div>
    </main>
  )
}
