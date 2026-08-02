import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import './globals.css'
import { DocViewerProvider } from '@/components/ui/DocViewer'

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
    // translate="no" + notranslate: חוסמים תרגום אוטומטי של הדפדפן (Google Translate).
    // התרגום מחליף צמתי טקסט ב-DOM מאחורי הגב של React, וכש-React מנסה אז לעדכן
    // (החלפת טאב / router.refresh) הוא נופל על "removeChild ... not a child of this node".
    // האפליקציה כולה בעברית — אין שום סיבה לתרגם, וזה הפתרון הרשמי לבאג הזה.
    <html lang="he" dir="rtl" translate="no" className={`${heebo.variable} h-full notranslate`}>
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className="min-h-full bg-slate-50">
        <DocViewerProvider>{children}</DocViewerProvider>
      </body>
    </html>
  )
}
