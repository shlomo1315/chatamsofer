import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

function noCache(res: NextResponse) {
  // Stop NetFree / browser from serving stale admin pages (incl. cached 404s).
  // ⚠️ no-cache ולא no-store — ראו ההסבר ב-next.config.ts. no-store ביטל את
  // ה-Router Cache של Next וגרם לכל ניווט פנימי לרנדר מחדש מהשרת.
  res.headers.set('Cache-Control', 'private, no-cache, must-revalidate, max-age=0')
  return res
}

// ─── מטמון פרופיל הצוות ──────────────────────────────────────────────────────
// ה-proxy רץ על *כל* בקשה ל-/admin, וכל ריצה עשתה 1-2 שאילתות profiles מעל
// getUser. זה מס קבוע לפני שהדף בכלל מתחיל לרנדר. הפרופיל (תפקיד/פעיל/
// mail_only) כמעט אינו משתנה, ולכן נשמר כאן ל-60 שניות לפי מזהה המשתמש.
// שינוי הרשאות נכנס לתוקף תוך דקה לכל היותר — וה-RLS וה-API חוסמים בכל מקרה.
type StaffProfile = { mail_only: boolean | null; role: string; is_active: boolean | null }
const PROFILE_TTL = 60_000
const profileCache = new Map<string, { at: number; prof: StaffProfile | null }>()

function cachedProfile(userId: string) {
  const hit = profileCache.get(userId)
  if (hit && Date.now() - hit.at < PROFILE_TTL) return hit.prof
  return undefined // undefined = אין במטמון · null = נבדק ואין פרופיל
}

function rememberProfile(userId: string, prof: StaffProfile | null) {
  // גיזום עצל — המפה לא תגדל בלי גבול בתהליך ארוך־חיים
  if (profileCache.size > 500) {
    for (const [k, v] of profileCache) if (Date.now() - v.at > PROFILE_TTL) profileCache.delete(k)
  }
  profileCache.set(userId, { at: Date.now(), prof })
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

  // ⚠️ עטוף ב-try: אם רענון האסימון נכשל רגעית (למשל מרוץ סביב token rotation),
  // getUser עלול לזרוק. בלי הגנה כאן משתמש צוות מקבל ניתוק פתאומי ל-/login
  // דווקא בזמן שהסשן עדיין קיים בעוגיות.
  let user: { id: string; email?: string | null } | null = null
  try {
    const res = await supabase.auth.getUser()
    user = res.data.user ? { id: res.data.user.id, email: res.data.user.email } : null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[proxy] getUser נכשל:', msg)

    // נפילה-לאחור: אם יש session cookie תקין, נחלץ את המשתמש מ-getSession
    // במקום לנתק מיידית. זה מונע "התנתק כל כמה דקות" סביב גבול פקיעת הטוקן.
    try {
      const s = await supabase.auth.getSession()
      const su = s.data.session?.user
      if (su?.id) {
        user = { id: su.id, email: su.email ?? null }
        console.warn('[proxy] משתמש שוחזר מ-getSession אחרי כשל getUser')
      }
    } catch {
      // best-effort בלבד
    }
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

    let prof = cachedProfile(user.id) as StaffProfile | null | undefined
    if (prof === undefined) {
      const { data } = await supabase
        .from('profiles')
        .select('mail_only, role, is_active')
        .eq('id', user.id)
        .maybeSingle()
      prof = data

      if (!prof && user.email) {
        // ⚠️ נשאר ilike (התאמה חסרת רישיות — אימיילים נשמרים בטבלה כפי
        // שהוזנו). האינדקס profiles_email_lower_idx במיגרציה 20260809 הופך
        // אותו מסריקת טבלה מלאה לחיפוש אינדקס.
        const r = await supabase.from('profiles')
          .select('mail_only, role, is_active')
          .ilike('email', user.email).maybeSingle()
        prof = r.data
      }
      rememberProfile(user.id, prof ?? null)
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
