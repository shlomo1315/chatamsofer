import { guardPage } from '@/lib/pageGuard'
import PrintClient from './PrintClient'

// מסך הדפסה — תעודות משלוח ורשימת כתובות למשלוחן (בקשת המשתמש 07.10).
//
// ⚠️ תחת /admin ולא כתובת עצמאית: כך ה-proxy ו-guardPage מגינים עליו
// כמו על כל מסך ניהול. ה-layout של הניהול (h-screen overflow-hidden)
// היה חותך את ההדפסה לעמוד אחד — ולכן התוכן מוצג ב-portal ישירות
// ב-body, ו-CSS ההדפסה מסתיר את כל השאר (ראו PrintClient).

export const dynamic = 'force-dynamic'

export default async function BookFairPrintPage({ searchParams }: {
  searchParams: Promise<{ mode?: string; id?: string; k?: string; noprint?: string }>
}) {
  await guardPage('book_fair')
  const sp = await searchParams
  return (
    <PrintClient
      mode={sp.mode === 'addresses' ? 'addresses' : 'notes'}
      id={sp.id ?? null}
      stashKey={sp.k ?? null}
      // ⚠️ noprint=1 — תצוגה בלי חלון הדפסה אוטומטי (לבדיקה ולצפייה)
      autoPrint={sp.noprint !== '1'}
    />
  )
}
