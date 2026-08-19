import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { emailVerifyRequestEmail } from '@/lib/emailTemplates'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import { listUnverified, verificationStats, isValidEmail } from '@/lib/emailVerification'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// ניהול אימות כתובות המייל.
//
// GET  — המספרים המדויקים + הרשימה המלאה של מי שטרם אימת, עם סימון כתובות פגומות.
// POST — שליחת בקשה לאמת. גוף: { ids: string[] } או { all: true }.
//
// מנהל בלבד: הרשימה כוללת שמות וכתובות מייל של משפחות.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  await ensureEmailTexts()
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { rows, error } = await listUnverified(admin)
  if (error) return NextResponse.json({ error }, { status: 500 })

  const stats = await verificationStats(admin, rows)
  return NextResponse.json({ stats, families: rows }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  await ensureEmailTexts()
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { ids?: unknown; all?: unknown; limit?: unknown; stream?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { rows, error } = await listUnverified(admin)
  if (error) return NextResponse.json({ error }, { status: 500 })

  const wanted = Array.isArray(body.ids) ? new Set(body.ids.map(String)) : null
  // ⚠️ כתובת פגומה מסוננת תמיד, גם ב"שלח לכולם": שליחה אליה נכשלת בוודאות,
  // צורכת ממכסת השליחה היומית, ומסמנת "נשלחה בקשה" על מי שלא קיבל דבר.
  let targets = rows.filter(r => isValidEmail(r.email) && (!wanted || wanted.has(r.id)))

  // 🔴 הגבלת כמות — חימום הדומיין.
  //
  // שליחה בבת אחת לרשימה שלא אומתה מעולם מייצרת שיעור bounce גבוה, וזה
  // הסיגנל החזק ביותר שיש לספקים (Gmail/Outlook) ל"שולח ספאם". התוצאה
  // אינה נפילה של Resend אלא ירידה בדירוג הדומיין — ואז *גם* קודי האימות,
  // המייל היחיד שחוסם אדם מלהיכנס לפורטל, מתחילים ליפול לספאם.
  // מנה יומית מבוקרת מאפשרת לראות את שיעור ה-bounce לפני שנגרם נזק.
  // 🔴 קדימות למי שטרם קיבל בקשה מעולם.
  //
  // ⚠️ הבאג שהיה כאן: הרשימה מגיעה ממוינת לפי created_at בלבד, ו-slice
  // חתך תמיד את אותן שורות ראשונות. כלומר כל חימום חוזר נשלח *שוב לאותם
  // אנשים*, בעוד מי שנמצא עמוק ברשימה לא קיבל דבר לעולם — וגם מכסת
  // החימום היומית התבזבזה על נמענים שכבר קיבלו.
  //
  // המיון כאן יציב: קודם מי ש-email_verify_requested_at שלו ריק, ורק
  // כשנגמרו — מי שכבר קיבל, מהישן לחדש (הוותיק ביותר ראשון). כך סבב שני
  // מתחיל מאליו אחרי שכולם קיבלו פעם אחת, בלי מתג ובלי התערבות.
  const byNeverRequested = (a: typeof targets[number], b: typeof targets[number]) => {
    const aReq = a.requestedAt, bReq = b.requestedAt
    if (!aReq && bReq) return -1
    if (aReq && !bReq) return 1
    if (!aReq && !bReq) return 0
    return String(aReq).localeCompare(String(bReq))   // הוותיק ביותר ראשון
  }
  targets = [...targets].sort(byNeverRequested)

  const limit = Number(body.limit)
  if (Number.isFinite(limit) && limit > 0) targets = targets.slice(0, Math.floor(limit))

  if (!targets.length) {
    return NextResponse.json({ sent: 0, failed: 0, skipped: rows.length, summary: 'לא נמצאו כתובות תקינות לשליחה.' })
  }

  const from = mailFor('igud')
  const now = new Date().toISOString()
  let sent = 0
  const failures: { email: string; error: string }[] = []

  // ── מצב זרימה: מונה חי במקום עיגול מסתובב ──
  //
  // ⚠️ השליחה סדרתית ואורכת דקות. בלי זה המסך מציג "שולח…" בלי שום
  // אינדיקציה כמה כבר יצאו, ואי אפשר לדעת אם התהליך מתקדם או תקוע.
  // כל מייל משדר שורת JSON אחת (NDJSON), והלקוח מעדכן את המונה.
  if (body.stream === true) {
    const encoder = new TextEncoder()
    const total = targets.length
    const stream = new ReadableStream({
      async start(controller) {
        const line = (o: unknown) => {
          try { controller.enqueue(encoder.encode(JSON.stringify(o) + '\n')) } catch { /* הלקוח ניתק */ }
        }
        line({ type: 'start', total })
        for (const target of targets) {
          const mail = emailVerifyRequestEmail(target.name)
          const res = await deliverMail(target.email, mail.subject, mail.html, undefined, from)
          if (!res.ok) {
            failures.push({ email: target.email, error: res.error || 'השליחה נכשלה' })
          } else {
            sent++
            await admin.from('beneficiaries')
              .update({ email_verify_requested_at: now })
              .eq('id', target.id)
              .then(undefined, () => {})
          }
          line({ type: 'progress', sent, failed: failures.length, total, name: target.name })
        }
        await logActivity(admin, {
          userId: staff.userId,
          action: 'email_verification_requests_sent',
          entityType: 'beneficiary',
          details: { sent, failed: failures.length, requested: total },
        }).catch(() => {})
        console.log(`[email-verification] נשלחו ${sent} בקשות אימות · ${failures.length} כשלים`)
        line({
          type: 'done', sent, failed: failures.length, total,
          failures: failures.slice(0, 20),
          summary: `נשלחו ${sent} בקשות` + (failures.length ? ` · ${failures.length} נכשלו` : ''),
        })
        controller.close()
      },
    })
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        // ⚠️ מונע באפרינג של פרוקסי — בלעדיו כל השורות מגיעות יחד בסוף,
        // וה"עדכון החי" מאבד את כל תכליתו.
        'X-Accel-Buffering': 'no',
      },
    })
  }

  // ⚠️ סדרתי ולא במקביל: שליחה מקבילה לאלפי כתובות חוטפת חסימת קצב מהספק,
  // ואז חלק מהמשפחות מסומנות כ"נשלח" בלי שההודעה יצאה.
  for (const target of targets) {
    const mail = emailVerifyRequestEmail(target.name)
    const res = await deliverMail(target.email, mail.subject, mail.html, undefined, from)
    if (!res.ok) {
      failures.push({ email: target.email, error: res.error || 'השליחה נכשלה' })
      continue
    }
    sent++
    // ⚠️ מסומן רק אחרי שליחה מוצלחת. סימון מוקדם היה מסתיר ממך משפחות שלא
    // קיבלו כלום, והן היו נשארות בלי בקשה לנצח.
    await admin.from('beneficiaries')
      .update({ email_verify_requested_at: now })
      .eq('id', target.id)
      .then(undefined, () => {})
  }

  await logActivity(admin, {
    userId: staff.userId,
    action: 'email_verification_requests_sent',
    entityType: 'beneficiary',
    details: { sent, failed: failures.length, requested: targets.length },
  }).catch(() => {})

  console.log(`[email-verification] נשלחו ${sent} בקשות אימות · ${failures.length} כשלים`)
  return NextResponse.json({
    sent,
    failed: failures.length,
    skipped: rows.length - targets.length,
    failures: failures.slice(0, 20),
    summary: `נשלחו ${sent} בקשות` +
      (failures.length ? ` · ${failures.length} נכשלו` : '') +
      (rows.length - targets.length ? ` · ${rows.length - targets.length} דולגו (כתובת פגומה)` : ''),
  })
}
