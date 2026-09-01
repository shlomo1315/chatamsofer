import { NextResponse } from 'next/server'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

const API = 'https://www.call2all.co.il/ym/api'

// ─────────────────────────────────────────────────────────────────────────────
// רשימות התפוצה והצינתוקים שקיימות בחשבון ימות.
//
// 🔴 למה זה קיים: השדה "שם רשימת הצינתוקים" היה טקסט חופשי. שם שאינו
// קיים בימות אינו נכשל — הוא נכתב ל-ext.ini, ימות אינה מוצאת רשימה
// בשם הזה, והשלוחה פשוט לא רושמת איש. אין שגיאה ואין דרך לדעת, פרט
// לכך שאף אחד לא מקבל שיחה חוזרת.
//
// ⚠️ טעות כתיב אחת בשם היא בדיוק המקרה הזה — ולכן בורר ולא הקלדה.
//
// ⚠️ כישלון בקריאה אינו חוסם: מחזירים רשימה ריקה עם דגל, והממשק נופל
// חזרה להקלדה חופשית. חסימת המסך בגלל שירות חיצוני שאינו זמין הייתה
// מונעת עבודה שאפשר לבצע גם בלעדיו.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  if (!(await requireStaff(['admin']))) return unauthorized()

  const token = process.env.YEMOT_TOKEN
  if (!token) return NextResponse.json({ lists: [], available: false, error: 'YEMOT_TOKEN אינו מוגדר' })

  try {
    const url = `${API}/GetTemplates?token=${encodeURIComponent(token)}`
    const res = await fetch(url, { cache: 'no-store' })
    const json = await res.json().catch(() => null) as
      { responseStatus?: string; templates?: unknown } | null

    if (!json || json.responseStatus !== 'OK') {
      return NextResponse.json({ lists: [], available: false })
    }

    // ⚠️ המבנה שימות מחזירה אינו מתועד באופן יציב — לוקחים את השם בכל
    // צורה סבירה, ומתעלמים בשקט מרשומה בלי שם.
    const raw = Array.isArray(json.templates) ? json.templates : []
    const lists = raw
      .map(t => {
        if (typeof t === 'string') return t
        const o = t as { name?: unknown; template?: unknown; templateName?: unknown }
        return String(o.name ?? o.template ?? o.templateName ?? '')
      })
      .filter(Boolean)
      // ⚠️ ייחודי וממוין: ימות עלולה להחזיר כפילויות בין סוגי רשימות.
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => a.localeCompare(b, 'he'))

    return NextResponse.json({ lists, available: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ lists: [], available: false })
  }
}
