import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'

const geist = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'היכל החתם סופר - מערכת ניהול',
  description: 'מערכת מרכזית לניהול פעילות העמותה',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="he" dir="rtl" className={`${geist.variable} h-full`}>
      <body className="min-h-full bg-slate-50">{children}</body>
    </html>
  )
}
