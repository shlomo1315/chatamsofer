import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { lineageOrderFixEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// חידוש קישור אישי שפג תוקפו — לבקשת המשפחה, מתוך מסך "תוקף הקישור פג".
//
// 🔴 הרקע: הקישור בתוקף ל-7 ימים, ובפועל 5 מתוך 10 הקישורים שנשלחו כבר פגו
// בעוד 9 מהם נפתחו. משפחה שפתחה את המייל אחרי שבוע, או חזרה להשלים מאוחר
// יותר, נתקלה במסך שגיאה סתום בלי שום דרך להמשיך — וזה מקור התלונות
// "קיבלתי קישור ולא עובד לי". כאן היא מבקשת קישור חדש בלחיצה אחת.
//
// ⚠️ אבטחה — הנקודות שמונעות ניצול לרעה של נתיב ציבורי:
//   • הקישור החדש נשלח *רק* לכתובת שנשמרה בהזמנה המקורית. הקורא אינו יכול
//     להזין כתובת — אחרת זו דלת לחטיפת קישור אישי בעזרת טוקן שדלף.
//   • נדרש טוקן קיים ואמיתי. טוקן שאינו קיים מקבל את אותה תשובה בדיוק
//     (ok) כדי לא להסגיר אילו טוקנים קיימים.
//   • הזמנה שבוטלה ידנית (revoked_at) *אינה* מתחדשת — ביטול הוא החלטה
//     של המשרד, ואיפוסו דרך נתיב ציבורי היה מבטל אותה.
//   • rate-limit לפי IP.
// ─────────────────────────────────────────────────────────────────────────────

function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** ⚠️ 30 יום ולא 7 — ראו ההערה ב-send-lineage-link. */
const RENEW_DAYS = 30

export async function POST(request: NextRequest) {
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const ip = clientIp(request)
  // ⚠️ מכסה נמוכה: כל בקשה שולחת מייל בפועל.
  if (!rateLimit(`lineage-renew:${ip}`, 5, 300_000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות — נסו שוב בעוד מספר דקות' }, { status: 429 })
  }

  let body: { token?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }
  const token = (body.token ?? '').trim()
  if (!token) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

  const { data: old } = await admin.from('lineage_share_invites')
    .select('token, root_node_id, beneficiary_id, mode, recipient_name, recipient_email, revoked_at, created_by')
    .eq('token', token).maybeSingle()

  // ⚠️ תשובה אחידה גם כשאין הזמנה וגם כשהיא בוטלה — כדי לא להסגיר מידע.
  // המשפחה רואה "הבקשה התקבלה" בכל מקרה, והמשרד רואה את האמת בלוג.
  if (!old || old.revoked_at || !old.recipient_email) {
    return NextResponse.json({ ok: true })
  }

  const newToken = randomBytes(16).toString('base64url')
  const expiresAt = new Date(Date.now() + RENEW_DAYS * 86400_000).toISOString()

  const { error } = await admin.from('lineage_share_invites').insert({
    token: newToken,
    root_node_id: old.root_node_id,
    beneficiary_id: old.beneficiary_id,
    mode: old.mode ?? 'order',
    expires_at: expiresAt,
    recipient_name: old.recipient_name,
    // 🔴 הכתובת מההזמנה הישנה בלבד — לעולם לא מגוף הבקשה.
    recipient_email: old.recipient_email,
    created_by: old.created_by,
  })
  if (error) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
  const link = `${base}/lineage-review/${newToken}`

  try {
    await ensureEmailTexts()
    const mail = lineageOrderFixEmail({ recipientName: old.recipient_name ?? 'משפחה יקרה', link })
    await deliverMail(old.recipient_email, mail.subject, mail.html, [], { ...mailFor('igud'), transactional: true })
  } catch (e) {
    console.error('[lineage-renew] שליחת המייל נכשלה:', e)
    return NextResponse.json({ error: 'שליחת המייל נכשלה' }, { status: 500 })
  }

  await logActivity(admin, {
    userId: null,
    action: 'lineage_order_link_renewed',
    entityType: 'beneficiary', entityId: old.beneficiary_id ?? null,
    details: { requestedFromExpiredToken: token, sentTo: old.recipient_email },
  })

  return NextResponse.json({ ok: true })
}
