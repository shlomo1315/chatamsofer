import { getServiceClient } from '@/lib/apiAuth'
import { cleanEmail } from '@/lib/emailAddress'
import { verifyUnsubscribe } from '@/lib/bookFairUnsubscribe'

// הסרה מרשימת התפוצה של יריד הספרים.
//
// 🔴 בלחיצה אחת ובלי התחברות: מי שלוחץ כאן ביקש לצאת, וכל שלב נוסף
// רק מונע ממנו לעשות זאת — ומוביל לסימון "ספאם" במקום, שפוגע
// במוניטין השליחה של כל המערכת.
//
// ⚠️ מבוצע בשרת בטעינת הדף ולא בכפתור: חלק מלקוחות המייל פותחים
// קישורים בדפדפן מצומצם בלי JavaScript.

export const dynamic = 'force-dynamic'

type Result = 'done' | 'invalid' | 'error'

async function unsubscribe(email: string, token: string): Promise<Result> {
  if (!email || !verifyUnsubscribe(email, token)) return 'invalid'

  const db = getServiceClient()
  if (!db) return 'error'

  const now = new Date().toISOString()

  // ⚠️ סימון ולא מחיקה: שורה שנמחקת יכולה להיכנס שוב בהרשמה הבאה,
  // והאדם היה מקבל דיוור אחרי שביקש במפורש לצאת.
  const { data: existing } = await db.from('book_fair_reminders')
    .select('id').eq('email', email).maybeSingle()

  const { error } = existing
    ? await db.from('book_fair_reminders').update({ unsubscribed_at: now }).eq('email', email)
    // ⚠️ רוכש שמעולם לא נרשם לתזכורת מקבל שורה חדשה ומסומנת — אחרת
    // אין לנו היכן לזכור שהוא ביקש לצאת.
    : await db.from('book_fair_reminders').insert({ email, unsubscribed_at: now })

  if (error) {
    console.error('[yerid/unsubscribe] failed:', error)
    return 'error'
  }
  return 'done'
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string; t?: string }>
}) {
  const sp = await searchParams
  const email = cleanEmail(sp.e)
  const result = await unsubscribe(email, String(sp.t ?? ''))

  const COPY: Record<Result, { title: string; text: string }> = {
    done: {
      title: 'הוסרתם מרשימת התפוצה',
      text: 'לא נשלח אליכם עוד דיוור מיריד הספרים. תודה על ההתעניינות!',
    },
    invalid: {
      title: 'הקישור אינו תקין',
      text: 'ייתכן שהקישור נחתך בהעתקה. נסו ללחוץ עליו ישירות מתוך המייל.',
    },
    error: {
      title: 'ההסרה נכשלה',
      text: 'אירעה תקלה זמנית. נסו שוב בעוד מספר דקות.',
    },
  }
  const { title, text } = COPY[result]

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#EAF4FC] via-[#DCEBF8] to-[#CFE2F3] px-6 py-16 text-center">
      <img src="/logo-heichal.png" alt="היכל החתם סופר" className="w-32 sm:w-40" />

      <div className="mt-8 w-full max-w-md rounded-2xl border border-[#9DC3E6]/50 bg-white/80 px-6 py-8 shadow-sm">
        <h1 className="text-2xl font-bold text-[#12314F]">{title}</h1>
        <p className="mt-3 text-base leading-relaxed text-[#3B5670]">{text}</p>
        {email && result === 'done' && (
          <p className="mt-4 text-sm text-[#3B5670]/70" dir="ltr">{email}</p>
        )}
      </div>

      <a href="/yerid" className="mt-8 text-sm font-medium text-[#8A6212] hover:underline">
        לחנות הספרים
      </a>
    </main>
  )
}
