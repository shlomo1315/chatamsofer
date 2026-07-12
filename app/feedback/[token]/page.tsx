import { verifyPublicToken } from '@/lib/publicToken'
import FeedbackForm from './FeedbackForm'

// ─────────────────────────────────────────────────────────────────────────────
// עמוד ציבורי — משוב על השהות בבית ההחלמה.
// ⚠️ מול היולדת לא מופיעה המילה "סקר" בשום מקום.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const aidId = verifyPublicToken(token, 's')

  if (!aidId) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50">
            <svg className="h-7 w-7 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.007M10.34 3.94l-7.6 13.17A1.5 1.5 0 004.04 19.5h15.92a1.5 1.5 0 001.3-2.39l-7.6-13.17a1.5 1.5 0 00-2.6 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#1B3256' }}>הקישור אינו תקין</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            ייתכן שהקישור פג תוקף או הועתק באופן חלקי.
            <br />
            נשמח אם תנסי שוב מהקישור המקורי שקיבלת.
          </p>
        </div>
      </main>
    )
  }

  return <FeedbackForm token={token} />
}
