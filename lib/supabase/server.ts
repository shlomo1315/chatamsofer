import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { cache } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
// לקוח Supabase לצד השרת — מופע אחד לכל בקשה.
//
// ⚠️ cache() כאן אינו אופטימיזציה אלא תיקון באג. אסימון הרענון של Supabase הוא
// חד-פעמי: כל רענון מנפיק אסימון חדש ופוסל את הקודם מיידית.
//
// מסך ניהול יוצר עשרות לקוחות (56 קריאות ל-createClient בקוד, ועוד ה-layout),
// וכל אחד מחזיק מצב אימות משלו. כשתוקף אסימון הגישה פג, כולם ניגשים לרענן *בו
// זמנית* עם אותו אסימון — הראשון מצליח ופוסל אותו, וכל השאר נכשלים ב-
// "Invalid Refresh Token: Refresh Token Not Found". השגיאה נזרקת, והמשתמש רואה
// "אירעה שגיאה בטעינת הנתונים" באמצע עבודה. בלוג זה נראה כשתי שגיאות זהות
// באותה אלפית שנייה בדיוק — חתימה מובהקת של מרוץ, לא של תקלה אקראית.
//
// עם cache() כל הרכיבים באותה בקשה חולקים מופע אחד — רענון אחד במקום עשרות.
// הרענון עצמו נשאר באחריות proxy.ts, המקום היחיד שבו אפשר גם לכתוב את
// העוגיות החדשות בחזרה לדפדפן.
// ─────────────────────────────────────────────────────────────────────────────
export const createClient = cache(async () => {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // called from server component — ignore
          }
        },
      },
    }
  )
})

export function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  return url && url !== 'https://placeholder.supabase.co'
}
