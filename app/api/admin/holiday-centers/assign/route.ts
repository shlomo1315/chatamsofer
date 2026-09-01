import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// שיוך מוקד ידני על ידי המשרד.
//
// 🔴 למה זה קיים: המוקד נבחר עד כה רק בשני ערוצים שהמשפחה מפעילה —
// הפורטל והשלוחה. משפחה שאינה מסתדרת עם שניהם (וזה קורה: 76 נרשמו
// בהזנה ידנית) לא יכלה לקבל מוקד כלל, והמשרד יכול היה רק להסתכל על
// "טרם נבחר" בטבלה בלי שום דרך לתקן.
//
// ⚠️ המשרד *כן* רשאי לדרוס בחירה קיימת, בשונה מהמשפחה: משפחה שהתקשרה
// וטעתה במוקד היא בדיוק המקרה שבגללו נדרשת התערבות ידנית. לכן אין כאן
// is('center_id', null) — אבל *כל* דריסה נרשמת ביומן עם המוקד הקודם,
// כי היא שינוי בלתי הפיך שמישהו יצטרך להסביר.
//
// ⚠️ שערי הבחירה (centers_open, המועד, approval_status) אינם חלים כאן:
// הם קיימים כדי לשלוט במה שהמשפחות עושות בעצמן. שיוך ידני הוא בדיוק
// הכלי לטפל במי שנפל בין הכיסאות אחרי שהשערים נסגרו.
//
// ⚠️ תפוסת המוקד כן נבדקת ומדווחת — אבל אינה חוסמת: המשרד רשאי לחרוג
// ביודעין (משפחה שכבר הגיעה למקום), והחסימה הייתה מונעת בדיוק את
// ההתערבות שהנתיב נועד לאפשר. התשובה מחזירה over_capacity כדי
// שהממשק יציג אזהרה.
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 🔒 מנהלים בלבד — זו כתיבה על נתון שהמשפחה אינה יכולה לשנות בעצמה.
  if (!(await requireStaff(['admin']))) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const b = await request.json().catch(() => ({})) as {
    recipient_id?: string
    /** null = ביטול השיוך והחזרה ל"טרם נבחר". */
    center_id?: string | null
  }
  const recipientId = String(b.recipient_id ?? '').trim()
  if (!recipientId) return NextResponse.json({ error: 'חסר מזהה נרשם' }, { status: 400 })

  const { data: recRow } = await db.from('distribution_recipients')
    .select('id, distribution_id, center_id').eq('id', recipientId).maybeSingle()
  const rec = recRow as { id: string; distribution_id: string; center_id: string | null } | null
  if (!rec) return NextResponse.json({ error: 'הנרשם לא נמצא' }, { status: 404 })

  // ── ביטול שיוך ──
  if (b.center_id === null || b.center_id === '') {
    const { error } = await db.from('distribution_recipients').update({
      center_id: null, center_chosen_at: null, center_source: null,
    }).eq('id', rec.id)
    if (error) {
      console.error('[admin/assign-center] ביטול נכשל:', error.message)
      return NextResponse.json({ error: 'הביטול נכשל' }, { status: 500 })
    }
    console.log(`[admin/assign-center] בוטל שיוך: rec=${rec.id} (היה ${rec.center_id ?? '—'})`)
    return NextResponse.json({ ok: true, label: null })
  }

  const centerId = String(b.center_id)
  const { data: centerRow } = await db.from('holiday_centers')
    .select('id, city, name, capacity, is_active').eq('id', centerId).maybeSingle()
  const center = centerRow as {
    id: string; city: string | null; name: string | null
    capacity: number | null; is_active: boolean
  } | null

  if (!center) return NextResponse.json({ error: 'המוקד לא נמצא' }, { status: 404 })
  // ⚠️ מוקד מבוטל כן נחסם: שיוך אליו היה שולח משפחה למקום שאינו פועל.
  if (!center.is_active) {
    return NextResponse.json({ error: 'המוקד אינו פעיל — לא ניתן לשייך אליו' }, { status: 400 })
  }

  // ספירת התפוסה — לדיווח, לא לחסימה (ראו ההערה בראש הקובץ).
  let taken = 0
  const { data: countRows } = await db
    .rpc('holiday_center_counts', { dist_id: rec.distribution_id })
    .then(r => r, () => ({ data: null }))
  for (const r of (countRows ?? []) as { center_id: string; n: number }[]) {
    if (r.center_id === centerId) taken = Number(r.n)
  }
  const overCapacity = center.capacity != null && taken >= center.capacity

  const { error } = await db.from('distribution_recipients').update({
    center_id: centerId,
    center_chosen_at: new Date().toISOString(),
    // ⚠️ 'office' ולא 'portal': הערוץ הוא חלק מהתיעוד, ומי שיבדוק
    // בעתיד למה משפחה משויכת למוקד חייב לדעת שהמשרד עשה זאת.
    center_source: 'office',
  }).eq('id', rec.id)

  if (error) {
    console.error('[admin/assign-center] שמירה נכשלה:', error.message)
    return NextResponse.json({ error: 'השמירה נכשלה' }, { status: 500 })
  }

  const label = [center.city, center.name].filter(Boolean).join(' · ')
  console.log(
    `[admin/assign-center] rec=${rec.id} → ${centerId}` +
    (rec.center_id ? ` (דריסת ${rec.center_id})` : '') +
    (overCapacity ? ' [מעל התפוסה]' : ''),
  )
  return NextResponse.json({
    ok: true,
    label,
    replaced: !!rec.center_id,
    over_capacity: overCapacity,
  })
}
