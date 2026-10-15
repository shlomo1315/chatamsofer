import type { Metadata } from 'next'
import CreditForm from './CreditForm'

export const metadata: Metadata = {
  title: 'פרטי חשבון לזיכוי | היכל החתם סופר',
  description: 'מילוי פרטי חשבון בנק להעברת זיכוי על ספרים שלא סופקו',
  robots: { index: false, follow: false },
}

export default async function CreditPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-bold text-slate-900">פרטי חשבון לזיכוי</h1>
        <CreditForm token={token} />
      </div>
    </main>
  )
}
