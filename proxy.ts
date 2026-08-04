import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function noCache(res: NextResponse) {
  // Stop NetFree / browser from serving stale admin pages (incl. cached 404s)
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  return res
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const isConfigured = supabaseUrl && supabaseUrl !== 'https://placeholder.supabase.co'

  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin')
  const isLoginPage = request.nextUrl.pathname === '/login'

  if (!isConfigured) {
    // Dev mode: allow all routes, just protect against login loops
    return isAdminRoute ? noCache(response) : response
  }

  // מסלולים ציבוריים (פורטל, טופס רישום וכו') אינם דורשים אימות — מדלגים על קריאת
  // הרשת ל-getUser (חוסך ~0.3-0.5ש' לכל בקשה). האימות נדרש רק ב-/admin וב-/login.
  if (!isAdminRoute && !isLoginPage) return response

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // ⚠️ עטוף ב-try: אם רענון האסימון נכשל (למשל אסימון רענון שכבר נוצל), getUser
  // זורק — וללא התפיסה הזו כל הבקשה נופלת ל-500 והמשתמש רואה מסך שגיאה במקום
  // מסך התחברות. כשל אימות פירושו "אין משתמש", והטיפול בזה כבר קיים למטה.
  let user = null
  try {
    const res = await supabase.auth.getUser()
    user = res.data.user
  } catch (e) {
    console.error('[proxy] getUser נכשל:', e instanceof Error ? e.message : e)
  }

  if (isAdminRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isLoginPage) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url))
  }

  // משתמש מאומת אך ללא פרופיל צוות פעיל: /admin חסום עבורו גם ב-RLS וב-API,
  // אבל בלי הבדיקה כאן הוא עדיין מקבל את מסגרת הניהול (ריקה). נדחה כאן לפי
  // אותו קריטריון בדיוק כמו requireStaff (lib/apiAuth.ts): פרופיל קיים, פעיל,
  // ותפקיד מוכר — כולל נפילה-לאחור לפי אימייל לתמיכה בכניסת Google.
  if (isAdminRoute && user) {
    const path = request.nextUrl.pathname
    const isMailPath = path === '/admin/mail' || path.startsWith('/admin/mail/')

    let { data: prof } = await supabase
      .from('profiles')
      .select('mail_only, role, is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (!prof && user.email) {
      const r = await supabase.from('profiles').select('mail_only, role, is_active').ilike('email', user.email).maybeSingle()
      prof = r.data
    }

    const STAFF_ROLES = ['admin', 'secretary', 'reviewer', 'collections']
    if (!prof || prof.is_active === false || !STAFF_ROLES.includes(prof.role)) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // יוזרים "מייל בלבד": חסומים מכל המערכת חוץ מלשונית המייל.
    if (!isMailPath && prof.mail_only === true && prof.role !== 'admin') {
      return NextResponse.redirect(new URL('/admin/mail', request.url))
    }
  }

  return isAdminRoute ? noCache(response) : response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|.*\\.svg$).*)'],
}
