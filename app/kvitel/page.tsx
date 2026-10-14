import type { Metadata } from 'next'
import Image from 'next/image'
import KvitelForm from './KvitelForm'

export const metadata: Metadata = {
  title: 'קוויטל לציון רבינו החתם סופר זיע"א',
  description: 'שליחת שמות ובקשות לתפילה בציון מרנא ורבנא בעל החתם סופר זיע"א: שם, שם האם והבקשה, לרפואה, לפרנסה, לזיווג ולישועה.',
}

// עמוד ציבורי — הגשת שמות לקוויטל (ערוץ "לינק"). השמירה: /api/kvitel.
export default function Page() {
  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 pt-4 pb-0">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-4 text-center">
          <Image
            src="/logo-heichal-bw.png" alt="היכל החתם סופר"
            width={620} height={622} priority className="mx-auto mb-2 h-auto w-20 mix-blend-multiply"
          />
          <h1 className="text-2xl font-bold leading-snug" style={{ color: '#1B3256' }}>
            קוויטל לציון רבינו הקדוש
          </h1>
          <p className="mt-2 text-base text-slate-700">מרנא ורבנא בעל החתם סופר זיע&quot;א</p>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            כתבו את השמות ואת הבקשות, והם יוזכרו בתפילה על הציון.
            לכל שם יש לכתוב את שם האם.
          </p>
        </header>
        <KvitelForm />
      </div>
    </main>
  )
}
