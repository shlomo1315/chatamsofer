import type { Metadata } from 'next'
import DonorReportView from './DonorReportView'

export const dynamic = 'force-dynamic'

// ⚠️ הטוקן בכתובת: בלי אינדוקס ובלי העברת הכתובת הלאה ב-Referer.
export const metadata: Metadata = {
  title: 'מעקב אשראי – יולדות שאושרו',
  description: 'דוח יולדות שאושרו לפי בית החלמה, תאריכים וסכומים',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <DonorReportView token={token} />
}
