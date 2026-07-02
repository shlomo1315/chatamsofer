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

  // אימות מהיר: getClaims מאמת את ה-JWT מקומית (בלי סבב רשת לשרת האימות) כשמוגדרים
  // מפתחות חתימה, ולכן מהיר בהרבה מ-getUser על כל בקשה. נפילה-לאחור ל-getUser אם צריך.
  let user: { id: string } | null = null
  try {
    const { data } = await supabase.auth.getClaims()
    const sub = (data?.claims as { sub?: string } | undefined)?.sub
    if (sub) user = { id: String(sub) }
  } catch { /* ניפול ל-getUser */ }
  if (!user) {
    const { data } = await supabase.auth.getUser()
    if (data.user) user = { id: data.user.id }
  }

  if (isAdminRoute && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isLoginPage) {
    return NextResponse.redirect(new URL('/admin/dashboard', request.url))
  }

  // יוזרים "מייל בלבד": חסומים מכל המערכת חוץ מלשונית המייל.
  if (isAdminRoute && user) {
    const path = request.nextUrl.pathname
    const isMailPath = path === '/admin/mail' || path.startsWith('/admin/mail/')
    if (!isMailPath) {
      // select('*') עמיד גם אם העמודה mail_only טרם נוספה במסד
      const { data: prof } = await supabase
        .from('profiles')
        .select('mail_only, role')
        .eq('id', user.id)
        .maybeSingle()
      if (prof?.mail_only === true && prof.role !== 'admin') {
        return NextResponse.redirect(new URL('/admin/mail', request.url))
      }
    }
  }

  return isAdminRoute ? noCache(response) : response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api|.*\\.svg$).*)'],
}
