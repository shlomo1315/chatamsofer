// מתזמן פנימי (in-process) — מתאים לסביבת שרת מתמשכת כמו Railway,
// שבה אין cron מובנה דרך vercel.json. רץ פעם ב-15 דקות ומפעיל את המענה האוטומטי לתיבת המשרד.
// Next.js קורא ל-register() פעם אחת בעליית השרת.

const INTERVAL_MS = 15 * 60 * 1000 // כל 15 דקות
const INITIAL_DELAY_MS = 60 * 1000 // המתנה קצרה אחרי עליית השרת

export async function register() {
  // רק בריצת שרת Node (לא edge), ורק בפרודקשן, וניתן לכבות עם AUTO_REPLY_DISABLED=1
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV !== 'production') return
  if (process.env.AUTO_REPLY_DISABLED === '1') return

  const { runAutoReply } = await import('@/lib/autoReply')

  const tick = async () => {
    try {
      const res = await runAutoReply()
      if (res.replied || res.skipped) {
        console.log(`[auto-reply] scanned=${res.scanned} replied=${res.replied} skipped=${res.skipped}` + (res.error ? ` error=${res.error}` : ''))
      }
    } catch (err) {
      console.error('[auto-reply] scheduler tick failed', err)
    }
  }

  setTimeout(() => {
    void tick()
    setInterval(() => { void tick() }, INTERVAL_MS)
  }, INITIAL_DELAY_MS)

  console.log('[auto-reply] in-process scheduler started (every 15m)')
}
