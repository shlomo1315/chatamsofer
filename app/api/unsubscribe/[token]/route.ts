import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyUnsubscribeToken, addUnsubscribe } from '@/lib/unsubscribe'

// הסרה מרשימת תפוצה.
//
// POST — One-Click unsubscribe (Gmail שולח POST אוטומטית כשלוחצים "בטל מנוי")
// GET  — לחיצה על הקישור בפוטר המייל
//
// שים לב: אין requireStaff — זו נקודת קצה ציבורית בכוונה. האימות הוא
// הטוקן החתום, שמונע הסרה של כתובת אחרת.
export const dynamic = 'force-dynamic'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function page(title: string, message: string, ok: boolean): NextResponse {
  const color = ok ? '#059669' : '#dc2626'
  return new NextResponse(
    `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
</head>
<body style="margin:0;font-family:Arial,sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:40px;max-width:420px;text-align:center;">
    <div style="font-size:40px;margin-bottom:12px;">${ok ? '✓' : '⚠'}</div>
    <h1 style="margin:0 0 10px;color:${color};font-size:20px;">${title}</h1>
    <p style="margin:0;color:#64748b;font-size:14px;line-height:1.7;">${message}</p>
  </div>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

// מסך אישור — נשאלים לפני ההסרה, לא מסירים בלחיצה על הקישור.
// (קישור במייל נלחץ לפעמים בטעות, או ע"י סורקי אבטחה של תיבות הדואר.)
function confirmPage(token: string, email: string): NextResponse {
  const safe = email.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return new NextResponse(
    `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>הסרה מרשימת התפוצה</title>
</head>
<body style="margin:0;font-family:Arial,sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;">
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:36px;max-width:440px;text-align:center;">
    <div style="font-size:36px;margin-bottom:14px;">📬</div>
    <h1 style="margin:0 0 10px;color:#1B3256;font-size:20px;">להסיר אתכם מרשימת התפוצה?</h1>
    <p style="margin:0 0 6px;color:#64748b;font-size:14px;line-height:1.7;">
      הכתובת <strong style="color:#334155;">${safe}</strong> לא תקבל עוד מיילים פרסומיים מאיתנו.
    </p>
    <p style="margin:0 0 24px;color:#94a3b8;font-size:13px;line-height:1.7;">
      מיילים הקשורים לבקשות שהגשתם (אישורים, שוברים) ימשיכו להישלח כרגיל.
    </p>

    <form method="POST" action="/api/unsubscribe/${token}?confirm=1" style="margin:0;">
      <button type="submit"
        style="width:100%;background:#dc2626;color:#fff;border:0;border-radius:12px;padding:14px;
               font-size:15px;font-weight:bold;cursor:pointer;font-family:inherit;">
        כן, הסירו אותי
      </button>
    </form>

    <p style="margin:16px 0 0;color:#94a3b8;font-size:13px;">
      לא רוצים להסיר? פשוט סגרו את החלון.
    </p>
  </div>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

async function unsubscribe(token: string): Promise<boolean> {
  const parsed = verifyUnsubscribeToken(token)
  if (!parsed) return false

  const db = admin()
  if (!db) return false

  await addUnsubscribe(db, parsed.email, 'user', parsed.campaignId)
  return true
}

/** הרשמה חוזרת — מסירים את הכתובת מרשימת ההסרות. */
async function resubscribe(token: string): Promise<boolean> {
  const parsed = verifyUnsubscribeToken(token)
  if (!parsed) return false

  const db = admin()
  if (!db) return false

  const { error } = await db.from('unsubscribes').delete().eq('email', parsed.email)
  if (error) { console.error('[unsubscribe] הרשמה חוזרת נכשלה:', error.message); return false }

  console.log(`[unsubscribe] ${parsed.email} נרשם/ה בחזרה לרשימת התפוצה`)
  return true
}

// מסך תוצאה אחרי הסרה — עם אפשרות לחזור בגלל טעות
function removedPage(token: string): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>הוסרתם מרשימת התפוצה</title>
</head>
<body style="margin:0;font-family:Arial,sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;">
  <div style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:36px;max-width:440px;text-align:center;">
    <div style="font-size:36px;margin-bottom:14px;">✓</div>
    <h1 style="margin:0 0 10px;color:#059669;font-size:20px;">הוסרתם מרשימת התפוצה</h1>
    <p style="margin:0 0 6px;color:#64748b;font-size:14px;line-height:1.7;">
      לא תקבלו מאיתנו עוד מיילים פרסומיים.
    </p>
    <p style="margin:0 0 26px;color:#94a3b8;font-size:13px;line-height:1.7;">
      מיילים הקשורים לבקשות שהגשתם (אישורים, שוברים) ימשיכו להישלח כרגיל.
    </p>

    <div style="border-top:1px solid #f1f5f9;padding-top:22px;">
      <p style="margin:0 0 12px;color:#64748b;font-size:13px;">
        הסרתם בטעות, או שתרצו לחזור?
      </p>
      <form method="POST" action="/api/unsubscribe/${token}?resubscribe=1" style="margin:0;">
        <button type="submit"
          style="width:100%;background:#fff;color:#4f46e5;border:1.5px solid #c7d2fe;border-radius:12px;
                 padding:13px;font-size:14px;font-weight:bold;cursor:pointer;font-family:inherit;">
          הצטרפות חוזרת לרשימת התפוצה
        </button>
      </form>
    </div>
  </div>
</body>
</html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

// One-Click — Gmail/Apple שולחים POST אוטומטית ומצפים ל-200.
// כאן אין אישור אינטראקטיבי: הלחיצה על "בטל מנוי" בממשק של Gmail
// היא עצמה ההסכמה, וזה מה שהתקן דורש.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const url = new URL(request.url)

  // ── הצטרפות חוזרת לרשימת התפוצה ──
  if (url.searchParams.get('resubscribe') === '1') {
    const ok = await resubscribe(token)
    return ok
      ? page(
          'חזרתם לרשימת התפוצה',
          'תמשיכו לקבל מאיתנו עדכונים.<br/>אפשר להסיר את עצמכם בכל עת, מהקישור שבתחתית כל מייל.',
          true,
        )
      : page('אירעה שגיאה', 'לא הצלחנו לרשום אתכם בחזרה. אפשר לפנות אלינו ישירות.', false)
  }

  // ── הסרה ──
  // confirm=1 = אישור מדף האינטרנט (טופס). ללא זה = One-Click של Gmail.
  const confirmed = url.searchParams.get('confirm') === '1'
  const ok = await unsubscribe(token)

  if (confirmed) {
    // מסך התוצאה כולל אפשרות לחזור — למי שהסיר בטעות
    return ok
      ? removedPage(token)
      : page('אירעה שגיאה', 'לא הצלחנו לבצע את ההסרה. אפשר לפנות אלינו ישירות.', false)
  }

  return NextResponse.json({ ok }, { status: ok ? 200 : 400 })
}

// לחיצה על הקישור בפוטר — מציג שאלה, לא מסיר מיד.
export async function GET(_r: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const parsed = verifyUnsubscribeToken(token)

  if (parsed) {
    // כבר מוסר? מציגים את מסך ההצטרפות החוזרת במקום לשאול שוב על הסרה.
    const db = admin()
    if (db) {
      const { data: existing } = await db
        .from('unsubscribes')
        .select('email')
        .eq('email', parsed.email)
        .maybeSingle()
      if (existing) return removedPage(token)
    }

    // מסך אישור — ההסרה מתבצעת רק בלחיצה על הכפתור
    return confirmPage(token, parsed.email)
  }

  return page(
        'הקישור אינו תקין',
        'ייתכן שהקישור פג או שאינו שלם. אפשר לפנות אלינו ישירות ונסיר אתכם ידנית.',
        false,
      )
}
