import { verifyPublicToken } from '@/lib/publicToken'
import GratitudeForm from './GratitudeForm'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'דברי ברכה · היכל החתם סופר',
}

export default async function GratitudePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const aidId = verifyPublicToken(token, 'g')

  if (!aidId) {
    return (
      <main dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center text-2xl">
            🔒
          </div>
          <h1 className="text-xl font-bold text-slate-800 mb-2">הקישור אינו תקין</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            ייתכן שפג תוקפו של הקישור.
            <br />
            אפשר פשוט להשיב למייל שקיבלתם, ונשמח לקבל את דבריכם.
          </p>
        </div>
      </main>
    )
  }

  return <GratitudeForm token={token} />
}
