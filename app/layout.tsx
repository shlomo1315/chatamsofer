import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import './globals.css'

const heebo = Heebo({
  variable: '--font-heebo',
  subsets: ['hebrew', 'latin'],
})

export const metadata: Metadata = {
  title: 'היכל החתם סופר',
  description: 'מערכת מרכזית לניהול פעילות העמותה',
  // מערכת ניהול ופורטל פרטי — לא לאינדוקס במנועי חיפוש (הטופס הציבורי לא יופיע בגוגל)
  robots: { index: false, follow: false },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full`}>
      <body className="min-h-full bg-slate-50">{children}</body>
    </html>
  )
}
