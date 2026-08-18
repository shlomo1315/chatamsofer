import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { suggestDomainFix, groupFixes, type DomainFix } from '@/lib/emailDomainFix'
import { isValidEmail, emailProblem } from '@/lib/emailVerification'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// ─────────────────────────────────────────────────────────────────────────────
// תיקון קבוצתי של שגיאות כתיב בדומיין המייל.
//
// GET  — סורק ומחזיר את ההצעות בלי לשנות דבר (תצוגה מקדימה).
// POST — מחיל את התיקונים שהמנהל אישר.
//
// 🔴 שני שלבים בכוונה: זו כתיבה על כתובות של אנשים אמיתיים. המנהל רואה
// בדיוק כמה ומה ("gnail.com → gmail.com · 23") לפני שמשהו נוגע במסד.
//
// ⚠️ הסריקה על *כל* מי שיש לו מייל, לא רק על הלא-מאומתים: כתובת שסומנה
// כמאומתת במיגרציה הרטרואקטיבית של 20260805 יכולה להיות שגויה בדיוק
// באותה מידה — האימות ההוא מעולם לא קרה בפועל.
// ─────────────────────────────────────────────────────────────────────────────

interface Row {
  id: string
  full_name?: string | null
  family_name?: string | null
  email?: string | null
  email_verified_at?: string | null
}

const displayName = (r: Row) =>
  [r.family_name, r.full_name].filter(Boolean).join(' ').trim() || 'ללא שם'

/** סורק את המאגר ומחזיר את כל התיקונים הוודאיים. */
async function scan(db: ReturnType<typeof getServiceClient>) {
  if (!db) return { rows: [], error: 'שגיאת שרת' }
  // ⚠️ fetchAllRows — תקרת 1,000 הייתה חותכת את הסריקה בשקט, וכתובות
  // פגומות היו נשארות בלי שאיש ידע.
  const res = await fetchAllRows<Row>((from, to) => db
    .from('beneficiaries')
    .select('id, full_name, family_name, email, email_verified_at')
    .not('email', 'is', null).neq('email', '')
    .range(from, to))
  return res
}

export async function GET() {
  const staff = await requirePermission('beneficiaries', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { rows, error } = await scan(db)
  if (error) return NextResponse.json({ error }, { status: 500 })

  const fixes: (DomainFix & { id: string; name: string; verified: boolean })[] = []
  const unfixable: { id: string; name: string; email: string; problem: string; verified: boolean }[] = []
  for (const r of rows) {
    const fix = suggestDomainFix(r.email)
    if (fix) fixes.push({ ...fix, id: r.id, name: displayName(r), verified: Boolean(r.email_verified_at) })
    else if (!isValidEmail(r.email)) {
      // 🔴 פגומה ואין תיקון ודאי — זו הרשימה שדורשת אדם. הכתובת
      // שגויה בחלק שלפני ה-@, או בדומיין שאינו ברשימת השגיאות
      // המוכרות, ולנחש שם פירושו להמציא כתובת.
      unfixable.push({
        id: r.id, name: displayName(r),
        email: (r.email ?? '').trim(),
        problem: emailProblem(r.email) ?? 'כתובת לא תקינה',
        verified: Boolean(r.email_verified_at),
      })
    }
  }

  return NextResponse.json({
    total: rows.length,
    fixable: fixes.length,
    groups: groupFixes(fixes),
    // ⚠️ מוחזרת גם הרשימה המלאה: המנהל רוצה לראות שמות לפני שהוא מאשר
    // שינוי על עשרות רשומות, לא רק מספר מסכם.
    fixes: fixes.slice(0, 500),
    // ⚠️ מוחזרות גם הכתובות שאין להן תיקון: בלעדיהן המסך מציג "תוקנו
    // 47" ויוצר רושם שהבעיה נסגרה, בעוד שהאמיתיות שבהן עדיין שם.
    unfixableCount: unfixable.length,
    unfixable: unfixable.slice(0, 500),
  })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('beneficiaries', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { from_domain?: string; ids?: string[] }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { rows, error } = await scan(db)
  if (error) return NextResponse.json({ error }, { status: 500 })

  // ⚠️ ההצעות מחושבות מחדש בשרת ולא נלקחות מהלקוח: כתובת יכולה להשתנות
  // בין התצוגה המקדימה לאישור, ולסמוך על ערך שהגיע מהדפדפן פירושו לכתוב
  // למסד מה שנשלח — לא מה שנכון.
  const onlyIds = Array.isArray(body.ids) && body.ids.length ? new Set(body.ids.map(String)) : null
  const onlyDomain = String(body.from_domain ?? '').trim().toLowerCase() || null

  const todo: { id: string; name: string; fix: DomainFix }[] = []
  for (const r of rows) {
    if (onlyIds && !onlyIds.has(String(r.id))) continue
    const fix = suggestDomainFix(r.email)
    if (!fix) continue
    if (onlyDomain && fix.fromDomain !== onlyDomain) continue
    todo.push({ id: r.id, name: displayName(r), fix })
  }

  if (!todo.length) return NextResponse.json({ ok: true, fixed: 0, failed: 0 })

  let fixed = 0, failed = 0
  for (const t of todo) {
    // ⚠️ הכתובת מתוקנת אך **אינה** מסומנת כמאומתת. gnail→gmail הוא הסקה
    // מבוססת ולא הוכחה שהתיבה קיימת; היא עוברת את מסלול קוד האימות הרגיל.
    const { error: upErr } = await db
      .from('beneficiaries')
      .update({ email: t.fix.fixed })
      .eq('id', t.id)
    if (upErr) failed++; else fixed++
  }

  await logActivity(db, {
    userId: staff.userId,
    action: 'email_domains_bulk_fixed',
    entityType: 'beneficiary',
    entityId: null,
    details: {
      fixed, failed,
      domain: onlyDomain,
      groups: groupFixes(todo.map(t => t.fix)),
      // ⚠️ הכתובות עצמן ביומן: זו כתיבה על נתוני אנשים, וצריך להיות אפשר
      // לשחזר בדיוק מה השתנה אם מתברר שהתיקון היה שגוי.
      sample: todo.slice(0, 50).map(t => ({ id: t.id, from: t.fix.original, to: t.fix.fixed })),
    },
  }).catch(() => {})

  return NextResponse.json({ ok: true, fixed, failed })
}
