import type { Metadata } from 'next'
import KvitelForm from './KvitelForm'

export const metadata: Metadata = {
  title: 'קוויטל לציון רבינו החתם סופר זיע"א',
  description: 'שליחת שמות ובקשות לתפילה בציון מרנא ורבנא בעל החתם סופר זיע"א: שם, שם האם והבקשה, לרפואה, לפרנסה, לזיווג ולישועה.',
}

// עמוד ציבורי — הגשת שמות לקוויטל (ערוץ "לינק"). השמירה: /api/kvitel.
export default function Page() {
  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-8 text-center">
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
