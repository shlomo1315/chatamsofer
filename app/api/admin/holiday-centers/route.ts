import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// ניהול מוקדי החלוקה לחגים.
//
// 🔴 מאגר גלובלי שנשמר מחג לחג — נפרד לחלוטין מ-card_centers של היולדות.
// מה שמשתנה בין חלוקות הוא אילו מוקדים *פתוחים*, לא רשימת המוקדים.
//
// ⚠️ המוקדים ניתנים לעריכה בכל רגע, גם באמצע חלוקה פעילה: כתובת שהשתנתה
// או שעות שהתעדכנו חייבות להגיע לשובר שטרם נשלח.
// ─────────────────────────────────────────────────────────────────────────────

const COLS = 'id, city, name, address, phone, hours, region, capacity, is_active, sort_order'

export async function GET(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await db.from('holiday_centers')
    .select(COLS).order('region').order('sort_order').order('city')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // כמה נרשמו לכל מוקד — ⚠️ נצבר ב-SQL ולא בשליפת 6,000 שורות לדפדפן.
  const distributionId = request.nextUrl.searchParams.get('distribution_id') ?? ''
  const counts: Record<string, number> = {}
  const openIds: string[] = []

  if (distributionId) {
    const { data: taken } = await db.rpc('holiday_center_counts', { dist_id: distributionId })
      .then(r => r, () => ({ data: null }))

    if (Array.isArray(taken)) {
      for (const r of taken as { center_id: string; n: number }[]) {
        if (r.center_id) counts[r.center_id] = Number(r.n)
      }
    } else {
      // ⚠️ נפילה-לאחור בלי ה-RPC: שולפים רק את עמודת המוקד, לא שורות מלאות.
      const { data: rows } = await db.from('distribution_recipients')
        .select('center_id').eq('distribution_id', distributionId).not('center_id', 'is', null)
      for (const r of (rows ?? []) as { center_id: string | null }[]) {
        if (r.center_id) counts[r.center_id] = (counts[r.center_id] ?? 0) + 1
      }
    }

    const { data: open } = await db.from('holiday_center_openings')
      .select('center_id').eq('distribution_id', distributionId)
    for (const o of (open ?? []) as { center_id: string }[]) openIds.push(o.center_id)
  }

  return NextResponse.json({ centers: data ?? [], counts, openIds })
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const b = await request.json().catch(() => ({})) as Record<string, unknown>
  const city = String(b.city ?? '').trim()
  const name = String(b.name ?? '').trim()
  if (!city || !name) return NextResponse.json({ error: 'עיר ושם המוקד הם שדות חובה' }, { status: 400 })

  const row = {
    city, name,
    address: String(b.address ?? '').trim() || null,
    phone: String(b.phone ?? '').trim() || null,
    hours: String(b.hours ?? '').trim() || null,
    region: String(b.region ?? 'center'),
    // ⚠️ 0 ו-null אינם זהים: 0 הוא "סגור לחלוטין", null הוא "ללא הגבלה".
    capacity: b.capacity === '' || b.capacity == null ? null : Number(b.capacity),
    is_active: b.is_active !== false,
    sort_order: Number(b.sort_order ?? 0),
  }

  const id = String(b.id ?? '')
  const { error } = id
    ? await db.from('holiday_centers').update(row).eq('id', id)
    : await db.from('holiday_centers').insert(row)

  if (error) {
    // ⚠️ הפרת הייחודיות (city+name) היא טעות משתמש ולא תקלה — נאמר בשמה.
    const msg = error.code === '23505' ? 'כבר קיים מוקד בשם זה באותה עיר' : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}

/** פתיחה/סגירה של מוקד בחלוקה מסוימת. */
export async function PATCH(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const b = await request.json().catch(() => ({})) as {
    distribution_id?: string; center_id?: string; open?: boolean
  }
  const distributionId = String(b.distribution_id ?? '')
  const centerId = String(b.center_id ?? '')
  if (!distributionId || !centerId) {
    return NextResponse.json({ error: 'חסר מזהה חלוקה או מוקד' }, { status: 400 })
  }

  if (b.open) {
    const { error } = await db.from('holiday_center_openings')
      .upsert({ distribution_id: distributionId, center_id: centerId },
        { onConflict: 'distribution_id,center_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // 🔴 סגירת מוקד אינה מבטלת בחירות קיימות.
    //
    // ⚠️ משפחה שכבר נרשמה למוקד נשארת בו — השובר שלה כבר מבטיח את המקום
    // הזה. הסגירה מונעת בחירות *חדשות* בלבד.
    const { error } = await db.from('holiday_center_openings')
      .delete().eq('distribution_id', distributionId).eq('center_id', centerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const id = request.nextUrl.searchParams.get('id') ?? ''
  if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  // 🔴 מוקד שכבר נבחר אינו נמחק — הוא מושבת.
  //
  // ⚠️ מחיקה הייתה מותירה רשומות עם center_id יתום, והשובר של המשפחה
  // היה מצביע על מוקד שאינו קיים. ההשבתה מסתירה אותו מבחירות חדשות
  // ומשמרת את מה שכבר נבחר.
  const { count } = await db.from('distribution_recipients')
    .select('id', { count: 'exact', head: true }).eq('center_id', id)

  if ((count ?? 0) > 0) {
    await db.from('holiday_centers').update({ is_active: false }).eq('id', id)
    return NextResponse.json({ ok: true, deactivated: true, recipients: count })
  }

  const { error } = await db.from('holiday_centers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted: true })
}
