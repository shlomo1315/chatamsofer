// מתזמן פנימי (in-process) — מתאים לסביבת שרת מתמשכת כמו Railway, שבה אין cron מובנה.
// Next.js קורא ל-register() פעם אחת בעליית השרת.
//  • מענה אוטומטי לתיבת המשרד — כל 15 דקות.
//  • פריקת כרטיסים שעברו 6 שבועות מהלידה — מדי יום בחצות (שעון ישראל).

const AUTOREPLY_INTERVAL_MS = 15 * 60 * 1000
const INITIAL_DELAY_MS = 60 * 1000
const HOURLY_MS = 60 * 60 * 1000

// התאריך/שעה הנוכחיים לפי שעון ישראל (עמיד לשעון קיץ/חורף)
function israelParts() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  })
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NODE_ENV !== 'production') return

  // ── מענה אוטומטי לתיבת המשרד (ניתן לכבות עם AUTO_REPLY_DISABLED=1) ──
  if (process.env.AUTO_REPLY_DISABLED !== '1') {
    const { runAutoReply } = await import('@/lib/autoReply')
    const tick = async () => {
      try {
        const res = await runAutoReply()
        if (res.replied || res.skipped) {
          console.log(`[auto-reply] scanned=${res.scanned} replied=${res.replied} skipped=${res.skipped}` + (res.error ? ` error=${res.error}` : ''))
        }
      } catch (err) { console.error('[auto-reply] scheduler tick failed', err) }
    }
    setTimeout(() => { void tick(); setInterval(() => { void tick() }, AUTOREPLY_INTERVAL_MS) }, INITIAL_DELAY_MS)
    console.log('[auto-reply] in-process scheduler started (every 15m)')
  }

  // ── פריקה אוטומטית בתום 6 שבועות — מדי יום בחצות שעון ישראל ──
  if (process.env.UNLOAD_EXPIRED_DISABLED !== '1') {
    let lastUnloadDate = ''
    const checkUnload = async () => {
      const { date, hour } = israelParts()
      if (hour !== 0 || date === lastUnloadDate) return
      lastUnloadDate = date
      try {
        const { runUnloadExpired } = await import('@/lib/unloadExpired')
        const res = await runUnloadExpired()
        console.log(`[unload-expired] daily run · processed=${res.processed}` + (res.error ? ` error=${res.error}` : ''))
      } catch (err) { console.error('[unload-expired] daily run failed', err) }
    }
    // בדיקה כל שעה — מפעילה את הפריקה כשמגיעה שעה 00:xx בישראל (פעם ביום)
    setTimeout(() => { void checkUnload(); setInterval(() => { void checkUnload() }, HOURLY_MS) }, INITIAL_DELAY_MS)
    console.log('[unload-expired] daily midnight (Israel) scheduler started')
  }
}
