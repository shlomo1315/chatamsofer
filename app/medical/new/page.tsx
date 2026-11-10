import type { Metadata } from 'next'
import Image from 'next/image'
import MedicalForm from '../MedicalForm'

export const metadata: Metadata = {
  title: 'בקשת סיוע למי שאינו רשום באיגוד הצאצאים | היכל החתם סופר',
  description: 'טופס בקשת סיוע למי שאינו רשום באיגוד הצאצאים: פרטים אישיים מלאים, מסמכים רפואיים והסכום המבוקש.',
}

// קישור משותף: נפתח ישר בטופס למגיש שאינו רשום באיגוד. השמירה: /api/medical/submit.
export default function Page() {
  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-5 text-center">
          <Image
            src="/logo-heichal-bw.png" alt="היכל החתם סופר"
            width={900} height={903} priority className="mx-auto mb-2 h-auto w-20 mix-blend-multiply"
          />
          <h1 className="text-2xl font-bold leading-snug" style={{ color: '#1B3256' }}>בקשת סיוע למי שאינו רשום באיגוד</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            מלאו את כל הפרטים האישיים וצרפו מסמכים. הבקשה תיבדק, ותקבלו הודעה בהמשך.
          </p>
        </header>
        <MedicalForm unregistered />
      </div>
    </main>
  )
}
