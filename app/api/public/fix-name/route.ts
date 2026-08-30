import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyPublicToken } from '@/lib/publicToken'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { babyNamesPatch, babiesOf, type AidNameFields } from '@/lib/babyNames'

export const dynamic = 'force-dynamic'

// סינון אותיות עבריות בלבד (שם, רווח, גרשיים/מקף) — זהה לסינון בטופס הציבורי.
const NON_HEBREW_NAME_CHARS = /[^א-ת ׳״'"-]/g
const hebrewNameOnly = (v: string) => v.replace(NON_HEBREW_NAME_CHARS, '')

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// קליטת שם התינוק מהעמוד הציבורי (הקישור שנשלח ליולדת). מאמת טוקן HMAC (kind='n'),
// שומר את השם, ומכבה את דגל "עדיין אין שם". פתוח לציבור — מוגן רק ע"י הטוקן החתום.
export async function POST(request: NextRequest) {
  // ⚠️ הגישה חסומה באסימון HMAC ולכן ניחוש אינו מעשי, אבל הגבלת קצב היא חלק
  // מההגנה בכל נקודת קצה ציבורית — כאן היא הייתה חסרה בעוד כל השאר מוגבלות.
  if (!rateLimit(`fix-name:${clientIp(request)}`, 20, 15 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות. נסו שוב בעוד מספר דקות.' }, { status: 429 })
  }

  // ⚠️ names[] הוא המסלול לתאומים; name הבודד נשמר לתאימות לאחור עם קישורים
  // שכבר נשלחו ליולדות ועם כל לקוח ישן.
  let body: { token?: string; name?: string; names?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const aidId = verifyPublicToken(body.token, 'n')
  if (!aidId) return NextResponse.json({ error: 'הקישור אינו תקין או שפג תוקפו' }, { status: 403 })

  // רק אותיות עבריות (אותה סינון כמו הטופס הציבורי) — מונע הזנת טקסט פסול
  const rawNames = Array.isArray(body.names)
    ? (body.names as unknown[]).map(v => hebrewNameOnly(String(v ?? '')).trim())
    : [hebrewNameOnly(String(body.name ?? '')).trim()]

  // ⚠️ די בשם אחד תקין: יולדת תאומים רשאית להשלים תאום אחד עכשיו ואת השני
  // בהמשך — הדגל יישאר דלוק והתיק יופיע ברשימת "ממתין לתיקונים" עד שיושלמו שניהם.
  if (!rawNames.some(Boolean)) {
    return NextResponse.json({ error: 'יש להזין שם תקין (אותיות עבריות בלבד)' }, { status: 400 })
  }
  if (rawNames.some(n => n.length > 60)) {
    return NextResponse.json({ error: 'השם ארוך מדי' }, { status: 400 })
  }
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: aid } = await admin
    .from('maternity_aids')
    .select('id, baby_name, baby_name_pending, babies, beneficiary_id, baby_id_number')
    .eq('id', aidId)
    .maybeSingle()
  if (!aid) return NextResponse.json({ error: 'הרשומה לא נמצאה' }, { status: 404 })

  // עדכון השמות בתיק + כיבוי דגל "אין שם". נכתב גם ל-babies[] וגם ל-baby_name:
  // קודם נכתב רק השדה הסקלרי, וכרטסת הלידה (שקוראת את המערך) הציגה את הישן.
  //
  // ⚠️ babyNamesPatch ולא babyNamePatch: לתאומים נשמר שם לכל תינוק בנפרד.
  // קודם נכתב תמיד babies[0], ולכן התאום השני נשאר בלי שם לצמיתות.
  //
  // ⚠️ שם שלא נשלח נשמר כפי שהוא — כך השלמת תאום אחד אינה מוחקת את האחר.
  const babies = babiesOf(aid as AidNameFields)
  const names = babies.map((b, i) => rawNames[i] || (b.name ?? null))
  const { error } = await admin
    .from('maternity_aids')
    .update(babyNamesPatch(aid as AidNameFields, names))
    .eq('id', aidId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // סנכרון לכרטסת המשפחה (children) — כמו בעריכת אדמין: מאתרים כל תינוק לפי
  // הת"ז שלו ומעדכנים את שמו. כשל בסנכרון לא חוסם.
  //
  // ⚠️ ההתאמה לפי ת"ז *של כל תאום* ולא לפי baby_id_number של התיק: השדה
  // הסקלרי מחזיק ת"ז אחת בלבד, ולכן התאום השני לא היה מסונכרן לעולם.
  try {
    if (aid.beneficiary_id) {
      const { data: ben } = await admin.from('beneficiaries').select('children').eq('id', aid.beneficiary_id).maybeSingle()
      const children = Array.isArray(ben?.children) ? ben!.children as Record<string, unknown>[] : []
      const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '')
      let changed = false
      const updated = children.map(c => {
        const hit = babies.findIndex((b, i) =>
          names[i] && digits(b.id_number) && digits(b.id_number) === digits(c.id_number))
        if (hit !== -1) { changed = true; return { ...c, name: names[hit] } }
        // לידה בודדת ותיקה — אין ת"ז לתינוק, נופלים לקישור לתיק.
        if (babies.length === 1 && names[0] && c.maternity_aid_id === aidId) {
          changed = true; return { ...c, name: names[0] }
        }
        return c
      })
      if (changed) await admin.from('beneficiaries').update({ children: updated }).eq('id', aid.beneficiary_id)
    }
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true })
}
