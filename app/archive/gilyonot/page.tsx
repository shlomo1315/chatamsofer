import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import { toRows, type ArchiveItem } from '@/lib/gilyonotArchiveView'
import ArchiveClient from './ArchiveClient'
import './archive.css'

// ארכיון הגיליונות הציבורי: קישור סטטי לקריאה והורדה בלבד.
//
// ⚠️ אבטחה: הדף קורא אך ורק את התצוגה gilyonot_public_archive עם מפתח anon, בלי
// עוגיות, בלי getServiceClient ובלי שום קישור למערכת הניהול. הקבצים נמצאים בדלי
// ציבורי נפרד (gilyonot-public) בשמות אקראיים. חיפוש וסינון רצים בדפדפן על
// הרשימה שנטענה כאן, בלי שאילתות נוספות למסד.
// לא מאונדקס בגוגל (החלטת שלמה): noindex כאן, X-Robots-Tag ב-next.config.ts, ואין ב-sitemap.
export const revalidate = 60
export const metadata: Metadata = {
  title: 'ארכיון גיליונות החתם סופר',
  description: 'צפייה והורדה של גיליונות החתם סופר, לפי פרשה, שנה ונושא.',
  robots: { index: false, follow: false, nocache: true },
}

export default async function Page() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  // בלי הגדרות (למשל בבנייה) מציגים מצב "לא זמין" במקום להיכשל; הדף מתרענן תוך דקה
  if (!url || !key) return <ArchiveClient rows={[]} fileBase="" failed />
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await db.from('gilyonot_public_archive')
    .select('id, title, parasha, year, topic, issue_date, file_size')
    .order('issue_date', { ascending: false, nullsFirst: false }).limit(5000)
  const base = `${url}/storage/v1/object/public/gilyonot-public`
  return <ArchiveClient rows={toRows((data ?? []) as ArchiveItem[])} fileBase={base} failed={!!error} />
}
