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

  // ── סורק ה-Gmail הישן (autoReply) — מכובה כברירת מחדל ──
  // ⚠️ המענה האוטומטי עבר למנגנון per-mailbox ב-webhook הנכנס (resend-inbound +
  // maintenanceReply per-תיבה). הסורק הישן רץ במקביל וענה על אותו דואר משרד —
  // מה שגרם לשני מענים על אותה פנייה. מכובה כברירת מחדל; להפעלה מפורשת בלבד
  // עם AUTO_REPLY_LEGACY=1 (למקרה חירום).
  if (process.env.AUTO_REPLY_LEGACY === '1') {
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
    console.log('[auto-reply] LEGACY Gmail scheduler started (every 15m)')
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

    // ── רשת ביטחון: טעינות של לידות שאינן מאושרות — כל שעה ──
    // ⚠️ הכלל הוא שביטול אישור מבטל את הטעינה, אבל סטטוס לידה משתנה ביותר
    // ממסלול אחד. מסלול שפוספס פירושו משפחה שאינה מאושרת ומחזיקה 600 ₪, וכרטיס
    // שחסר במלאי בלי הסבר. הסריקה השעתית מבטיחה שהפער לא ישרוד יותר משעה.
    const checkUnapproved = async () => {
      try {
        const { runUnloadUnapproved } = await import('@/lib/unloadExpired')
        const res = await runUnloadUnapproved()
        if (res.processed > 0) {
          console.log(`[unload-unapproved] processed=${res.processed} mailed=${res.mailed}`)
        }
      } catch (err) { console.error('[unload-unapproved] run failed', err) }
    }
    setTimeout(() => { void checkUnapproved(); setInterval(() => { void checkUnapproved() }, HOURLY_MS) }, INITIAL_DELAY_MS)
    console.log('[unload-unapproved] hourly safety-net scheduler started')
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

  // ── כרטיסי יולדות שלא נטענו — ניסיון חוזר שעתי ──
  // הטענת הכרטיס באישור הלידה רצה כמשימת רקע אחרי שהתגובה כבר נשלחה. אם היא
  // נכשלה (נדרים לא זמין) או לא הספיקה לרוץ (פריסה מחדש באמצע), הלידה נשארה
  // מאושרת בלי כרטיס — ואיש לא ידע, כי שום דבר לא ניסה שוב.
  // עד היום processAwaitingStock רץ רק כשמוסיפים מלאי או משנים מוקד; לידה
  // שנתקעה בלי קשר למלאי יכלה להישאר תקועה לנצח. כאן היא נסרקת כל שעה.
  if (process.env.MATERNITY_CARD_RETRY_DISABLED !== '1') {
    const tickCards = async () => {
      try {
        const { getServiceClient } = await import('@/lib/apiAuth')
        const admin = getServiceClient()
        if (!admin) return
        const { processAwaitingStock } = await import('@/lib/maternityCards')
        const res = await processAwaitingStock(admin)
        if (res.processed || res.failed || res.notConfigured) {
          console.log(`[maternity-cards] retry · processed=${res.processed} failed=${res.failed}` +
            (res.notConfigured ? ' · נדרים אינו מוגדר' : '') +
            (res.errors.length ? ` · ${res.errors.join(' | ')}` : ''))
        }
      } catch (err) { console.error('[maternity-cards] retry tick failed', err) }
    }
    setTimeout(() => { void tickCards(); setInterval(() => { void tickCards() }, HOURLY_MS) }, INITIAL_DELAY_MS)
    console.log('[maternity-cards] hourly retry scheduler started')
  }

  // ── סנכרון תיבות Gmail הישנות — כל שעה ──
  // זמני: כל עוד התיבות הישנות עדיין מקבלות מיילים חדשים (עד סגירת המעבר).
  // מושך אוטומטית את המיילים החדשים לכל תיבה פעילה, כדי שלא יצטברו בלי סנכרון
  // ידני. להשבתה: LEGACY_SYNC_DISABLED=1 (למשל אחרי סגירת התיבות הישנות).
  if (process.env.LEGACY_SYNC_DISABLED !== '1') {
    const tickLegacySync = async () => {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const db = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } },
        )
        const { runLegacySyncAll } = await import('@/lib/legacyMailSync')
        const res = await runLegacySyncAll(db)
        if (res.imported || res.failed) {
          console.log(`[legacy-sync] hourly · boxes=${res.boxes} imported=${res.imported} failed=${res.failed}`)
        }
      } catch (err) { console.error('[legacy-sync] hourly tick failed', err) }
    }
    setTimeout(() => { void tickLegacySync(); setInterval(() => { void tickLegacySync() }, HOURLY_MS) }, INITIAL_DELAY_MS)
    console.log('[legacy-sync] hourly scheduler started')
  }

  // ── גיבוי יומי מלא ל-Google Drive — מדי יום בחצות שעון ישראל ──
  // ⚠️ החליף את שירות ה-curl החיצוני שנשבר בשקט (curl parse error) ולא גיבה
  // 6 ימים בלי שאיש ידע. worker פנימי עמיד + התראת מייל אם עבר יום בלי גיבוי.
  // ה-worker אידמפוטנטי (גיבוי אחד ליום). להשבתה: DAILY_BACKUP_DISABLED=1.
  if (process.env.DAILY_BACKUP_DISABLED !== '1') {
    let lastBackupCheckDate = ''
    const checkBackup = async () => {
      const { date, hour } = israelParts()
      if (hour !== 0 || date === lastBackupCheckDate) return
      lastBackupCheckDate = date
      try {
        const { runDailyBackup, checkBackupFreshness } = await import('@/lib/dailyBackup')
        const res = await runDailyBackup()
        console.log(`[daily-backup] daily run · ok=${res.ok}` + (res.skipped ? ' (skipped)' : '') + (res.filename ? ` file=${res.filename} ${res.sizeMB}MB` : '') + (res.error ? ` error=${res.error}` : ''))
        // שומר סף — מתריע אם משום מה הגיבוי לא התעדכן
        await checkBackupFreshness()
      } catch (err) { console.error('[daily-backup] daily run failed', err) }
    }
    setTimeout(() => { void checkBackup(); setInterval(() => { void checkBackup() }, HOURLY_MS) }, INITIAL_DELAY_MS)
    console.log('[daily-backup] daily midnight (Israel) scheduler started')
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
