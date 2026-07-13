// מתזמן פנימי (in-process) — מתאים לסביבת שרת מתמשכת כמו Railway, שבה אין cron מובנה.
// Next.js קורא ל-register() פעם אחת בעליית השרת.
//  • מענה אוטומטי לתיבת המשרד — כל 15 דקות.
//  • פריקת כרטיסים שעברו 6 שבועות מהלידה — מדי יום בחצות (שעון ישראל).

const AUTOREPLY_INTERVAL_MS = 15 * 60 * 1000
const INITIAL_DELAY_MS = 60 * 1000
const HOURLY_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

// התאריך/שעה הנוכחיים לפי שעון ישראל (עמיד לשעון קיץ/חורף)
function israelParts() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short',
  })
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: p.weekday }
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // טקסטי המיילים הערוכים — נטענים למטמון בעליית התהליך, כדי שתבניות המייל
  // (שהן סינכרוניות) יוכלו לקרוא אותם. גם בפיתוח, כדי שההתנהגות זהה.
  try {
    const { loadEmailTexts } = await import('@/lib/emailTextsStore')
    await loadEmailTexts()
  } catch (e) {
    console.error('[instrumentation] טעינת טקסטי המיילים נכשלה:', e)
  }

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

  // ── רענון מאגר הכתובות (ערים/רחובות) ממשרד הפנים — מדי יום בחצות שעון ישראל ──
  if (process.env.GOV_SYNC_DISABLED !== '1') {
    let lastGovDate = ''
    const checkGovSync = async () => {
      const { date, hour } = israelParts()
      if (hour !== 0 || date === lastGovDate) return
      lastGovDate = date
      try {
        const { runGovSync } = await import('@/lib/govData')
        const res = await runGovSync()
        console.log(`[gov-sync] daily run · cities=${res.cities} streetsCities=${res.streetsCities}` + (res.error ? ` error=${res.error}` : ''))
      } catch (err) { console.error('[gov-sync] daily run failed', err) }
    }
    setTimeout(() => { void checkGovSync(); setInterval(() => { void checkGovSync() }, HOURLY_MS) }, INITIAL_DELAY_MS)
    console.log('[gov-sync] daily midnight (Israel) scheduler started')
  }

  // ── דוח שבועי של הלוואות במייל — כל יום ראשון בשעה 08:00 שעון ישראל ──
  if (process.env.LOANS_REPORT_DISABLED !== '1') {
    let lastReportDate = ''
    const checkLoansReport = async () => {
      const { date, hour, weekday } = israelParts()
      if (weekday !== 'Sun' || hour !== 8 || date === lastReportDate) return
      lastReportDate = date
      try {
        const { runWeeklyLoansReport } = await import('@/lib/loansReport')
        const res = await runWeeklyLoansReport()
        console.log(`[loans-report] weekly run · sent=${res.sent}` + (res.to ? ` to=${res.to}` : '') + (res.error ? ` error=${res.error}` : ''))
      } catch (err) { console.error('[loans-report] weekly run failed', err) }
    }
    setTimeout(() => { void checkLoansReport(); setInterval(() => { void checkLoansReport() }, HOURLY_MS) }, INITIAL_DELAY_MS)
    console.log('[loans-report] weekly (Sun 08:00 Israel) scheduler started')
  }

  // ── תור מיילים מתוזמנים (מכתבי ברכה, משוב בית החלמה) — בדיקה שעתית ──
  // ה-worker עצמו לא שולח בשבת/חג, ולוקח advisory lock כדי שלא ירוץ פעמיים.
  if (process.env.SCHEDULED_MAIL_DISABLED !== '1') {
    const tickScheduled = async () => {
      try {
        const { runScheduledMail } = await import('@/lib/scheduledMail')
        const res = await runScheduledMail()
        if (res.sent || res.failed || res.skipped) {
          console.log(`[scheduled-mail] sent=${res.sent} failed=${res.failed} skipped=${res.skipped}`)
        }
      } catch (err) { console.error('[scheduled-mail] tick failed', err) }
    }
    setTimeout(() => { void tickScheduled(); setInterval(() => { void tickScheduled() }, HOURLY_MS) }, INITIAL_DELAY_MS)
    console.log('[scheduled-mail] hourly scheduler started')
  }

  // ── מנוע הדיוור (ניוזלטר) — כל דקה ──
  // שולח קמפיינים שבסטטוס 'sending' במנות של 100 (Resend Batch API),
  // עם throttle של 2 בקשות/שנייה. חסין לקריסות: ממשיך מהשורות שנשארו pending.
  if (process.env.NEWSLETTER_DISABLED !== '1') {
    const tickNewsletter = async () => {
      try {
        const { runCampaignSender } = await import('@/lib/newsletter/sender')
        const res = await runCampaignSender()
        if (res.sent || res.failed) {
          console.log(`[newsletter] sent=${res.sent} failed=${res.failed}`)
        }
      } catch (err) { console.error('[newsletter] tick failed', err) }
    }
    setTimeout(() => { void tickNewsletter(); setInterval(() => { void tickNewsletter() }, MINUTE_MS) }, INITIAL_DELAY_MS)
    console.log('[newsletter] sender started (every 1m)')
  }
}
