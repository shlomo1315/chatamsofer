import type { Metadata } from 'next'
import ChargesView from './ChargesView'

export const dynamic = 'force-dynamic'

// ⚠️ הטוקן בכתובת: בלי אינדוקס ובלי העברת הכתובת הלאה ב-Referer.
export const metadata: Metadata = {
  title: 'דוח חיובים לפי תאריך',
  description: 'פירוט החיובים של בתי ההחלמה וסכום כולל לכל יום בכל סניף',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ChargesView token={token} />
}
