// מתזמן פנימי (in-process) — מתאים לסביבת שרת מתמשכת כמו Railway, שבה אין cron מובנה.
// Next.js קורא ל-register() פעם אחת בעליית השרת.
//  • פריקת כרטיסים שעברו 6 שבועות מהלידה — מדי יום בחצות (שעון ישראל).
//
// ⚠️ המענה האוטומטי אינו מתוזמן: הוא מופעל מה-webhook של הדואר הנכנס.

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

  // ⚠️ סורק ה-Gmail הישן (lib/autoReply) הוסר. הוא סרק את תיבת Gmail כל 15
  // דקות וענה בעצמו, לפי מכסה של 2 לשבוע — סותרת את המכסה שבמנגנון החי.
  // כל המענה האוטומטי נמצא היום ב-lib/autoReplySender, מונע מהגדרות שנערכות
  // במסך ההגדרות ומופעל מה-webhook הנכנס בלבד.

  // ── פריקה אוטומטית בתום 6 שבועות — מדי יום בחצות שעון ישראל ──
  if (process.env.UNLOAD_EXPIRED_DISABLED !== '1') {
    // 🔴 המצב נשמר במסד ולא בזיכרון, והחלון אינו שעה אחת.
    //
    // קודם: `if (hour !== 0 || date === lastUnloadDate) return` עם
    // lastUnloadDate במשתנה מקומי. שתי תקלות שהצטברו —
    //   · כל דפלוי אִפֵּס את המשתנה והפיל את התהליך;
    //   · החלון היה שעה אחת בלבד, כך שאם השרת עלה מחדש ב-01:00
    //     הפריקה נדלגה ליום שלם.
    // התוצאה בפועל: הפריקה לא רצה 12 יום, ו-11 יולדות נשארו עם ₪6,600.
    //
    // עכשיו: רץ בכל שעה אחרי חצות ישראל, ומדלג רק אם *כבר רץ היום* לפי
    // הרישום במסד — כך דפלוי אינו מוחק את הידיעה, ואיחור אינו מבטל.
    const checkUnload = async () => {
      const { date, hour } = israelParts()
      if (hour < 0) return
      try {
        const { getServiceClient } = await import('@/lib/apiAuth')
        const db = getServiceClient()
        if (!db) return

        const KEY = 'unload_expired_last_run'
        const { data } = await db.from('app_settings').select('value').eq('key', KEY).maybeSingle()
        // ⚠️ app_settings.value היא עמודת text — נשמר כמחרוזת פשוטה.
        if ((data as { value?: string } | null)?.value === date) return

        const { runUnloadExpired } = await import('@/lib/unloadExpired')
        const res = await runUnloadExpired()

        // ⚠️ נרשם רק אחרי ריצה מוצלחת: כשל שנרשם כ"רץ היום" היה חוסם
        // ניסיון חוזר עד מחר, והכסף היה נשאר תקוע יום נוסף.
        if (res.ok) {
          await db.from('app_settings').upsert(
            { key: KEY, value: date, updated_at: new Date().toISOString() },
            { onConflict: 'key' },
          )
        }
        console.log(`[unload-expired] run ${date} ${hour}:00 · processed=${res.processed}` + (res.error ? ` error=${res.error}` : ''))
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

    // ── יתרות מנדרים — כל שעה ──
    //
    // 🔴 card_balance נכתב פעם אחת בטעינה ואינו מתעדכן מקניות: כל
    // היולדות רשומות 600 גם אחרי שקנו. בלי הרענון הזה המזכירה רואה
    // מספר שנראה מדויק והוא שקר, וזה כבר גרם לרישום שגוי של 13 פריקות.
    //
    // ⚠️ ללא דגל תאריך, בשונה מהפריקה: זו פעולת קריאה בלבד שאינה
    // משנה כסף, וריצה כפולה רק מרעננת שוב.
    // ─────────────────────────────────────────────────────────────────────
    // 🔴 מפסק — ריצה שכשלה *כולה* אינה חוזרת מעצמה.
    //
    // ⚠️ ב-15-16.09 הרענון רץ כל שעה על ~223 משפחות והחזיר 0 הצלחות ו-223
    // כשלים, שעה אחר שעה. כל משפחה נקראת פעמיים (ניסיון חוזר ב-
    // refreshLiveBalances) ⇒ ~450 פניות לנדרים בכל שעה, כולן לחינם. נדרים
    // ספרו מעל 2,500 פניות בשעה ואיימו לחסום את ה-IP. הוויסות שנוסף קודם
    // האט את הקצב אבל לא נגע בסיבה: worker שממשיך לנסות בלי סוף.
    //
    // ⚠️ 0 הצלחות מתוך מאות אינו "תקלה רגעית" אלא תקלה מבנית (הרשאה שגויה,
    // מוסד לא נכון, ממשק שהשתנה) — ואין שום ערך בניסיון החוזר. נעצרים
    // ומשאירים שורת לוג מפורשת, במקום להציף צד שלישי עד לחסימה.
    // ─────────────────────────────────────────────────────────────────────
    let balancesStopped = false
    const refreshBalances = async () => {
      if (balancesStopped) return
      try {
        const { refreshLiveBalances } = await import('@/lib/refreshLiveBalances')
        const r = await refreshLiveBalances()
        if (r.ok) {
          console.log(`[live-balances] רועננו ${r.updated}/${r.checked}${r.failed ? ` · ${r.failed} נכשלו` : ''}`)
          // 🔴 כשל גורף — מפסיקים עד הפריסה הבאה.
          if (r.checked > 0 && r.updated === 0) {
            balancesStopped = true
            console.error(
              `[live-balances] 🔴 הופסק: ${r.checked} משפחות נבדקו ואף אחת לא הצליחה. ` +
              'זו תקלה מבנית ולא רעש רגעי — כל ניסיון נוסף רק מציף את נדרים. ' +
              'לבדוק הרשאות/מוסד ואז לפרוס מחדש.',
            )
          }
        } else {
          // ⚠️ כשל כולל (אין הרשאות, אין מסד) — גם הוא עוצר: אין טעם לחזור
          // כל שעה על קריאה שלא יכולה להצליח.
          balancesStopped = true
          console.error('[live-balances] 🔴 הופסק —', r.error)
        }
      } catch (e) {
        console.error('[live-balances] שגיאה:', e instanceof Error ? e.message : e)
      }
    }
    if (process.env.LIVE_BALANCES_DISABLED !== '1') {
      setTimeout(() => { void refreshBalances(); setInterval(() => { void refreshBalances() }, HOURLY_MS) }, INITIAL_DELAY_MS)
      console.log('[live-balances] hourly Nedarim balance refresh started')
    }
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

  // ── חידוש מנוי ה-push של Gmail — כל שעה ──
  //
  // 🔴 מנוי ה-watch פג אחרי 7 ימים בדיוק, וגוגל אינו מתריע ואינו מנסה שוב.
  // בלי החידוש הזה הסנכרון המיידי נדם בשקט מדי שבוע: המסך ממשיך להציג
  // "מופעל", הדחיפות מפסיקות, ואיש לא יודע עד שמייל לא מגיע. זה בדיוק
  // מה שקרה — המנוי הופעל ידנית ופג כעבור שבוע.
  //
  // ⚠️ רץ כל שעה אבל מחדש רק כשנותרו פחות מ-3 ימים, כך שיש מרווח
  // לנסיונות חוזרים אם החידוש נכשל. הקריאה אידמפוטנטית.
  if (process.env.GMAIL_WATCH_RENEW_DISABLED !== '1') {
    const tickWatchRenew = async () => {
      try {
        const { getServiceClient } = await import('@/lib/apiAuth')
        const db = getServiceClient()
        if (!db) return
        const { renewExpiringWatches } = await import('@/lib/gmailWatchRenew')
        const res = await renewExpiringWatches(db)
        if (res.renewed || res.failed) {
          console.log(`[gmail-watch-renew] hourly · renewed=${res.renewed} failed=${res.failed}`)
        }
      } catch (err) { console.error('[gmail-watch-renew] hourly tick failed', err) }
    }
    setTimeout(() => { void tickWatchRenew(); setInterval(() => { void tickWatchRenew() }, HOURLY_MS) }, INITIAL_DELAY_MS)
    console.log('[gmail-watch-renew] hourly scheduler started')
  }

  // ── גיבוי יומי מלא ל-Google Drive — מדי יום בחצות שעון ישראל ──
  // ⚠️ החליף את שירות ה-curl החיצוני שנשבר בשקט (curl parse error) ולא גיבה
  // 6 ימים בלי שאיש ידע. worker פנימי עמיד + התראת מייל אם עבר יום בלי גיבוי.
  // ה-worker אידמפוטנטי (גיבוי אחד ליום). להשבתה: DAILY_BACKUP_DISABLED=1.
  if (process.env.DAILY_BACKUP_DISABLED !== '1') {
    let lastBackupCheckDate = ''
    const checkBackup = async () => {
      const { date, hour } = israelParts()
      if (date === lastBackupCheckDate) return
      try {
        const { runDailyBackup, checkBackupFreshness, backupDoneToday } = await import('@/lib/dailyBackup')
        // חלון חצות (שעה 0) — הרצה רגילה. מחוץ לחלון — catch-up: רק אם
        // הגיבוי של היום עוד לא בוצע (למשל deploy שנפל בדיוק על חצות
        // "בלע" את חלון ההרצה). runDailyBackup אידמפוטנטי, אז אין כפילות.
        if (hour !== 0 && (await backupDoneToday())) return
        const res = await runDailyBackup()
        // מעדכנים את סמן היום רק כשהצליח/דולג — כך אחרי כשל, ה-catch-up
        // (ההרצה בעוד שעה) ינסה שוב באותו יום במקום להיכנע עד מחר.
        if (res.ok) lastBackupCheckDate = date
        console.log(`[daily-backup] ${hour === 0 ? 'daily' : 'catch-up'} run · ok=${res.ok}` + (res.skipped ? ' (skipped)' : '') + (res.filename ? ` file=${res.filename} ${res.sizeMB}MB` : '') + (res.error ? ` error=${res.error}` : ''))
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

  // ─────────────────────────────────────────────────────────────────────────
  // ── ניקוי יריד הספרים — כל 15 דקות ──
  //
  // 🔴 המלאי נשחק בלי זה. השריון מנכה מהמלאי מיד (stock_web/stock_phone
  // פירושם "זמין למכירה"), ולכן כל עגלה נטושה וכל שיחה שהתנתקה מחזיקה
  // עותקים שלא יוחזרו לעולם — הקטלוג יציג "אזל" על ספרים שעל המדף.
  //
  // ⚠️ הפקיעה העצלה שבתוך book_fair_reserve מכסה רק את מי שמנסה לקנות
  // את *אותו* ספר. הקטלוג, המסכים והתראות המלאי אינם עוברים דרכה.
  //
  // ⚠️ 15 דקות ולא שעה: ה-TTL של שריון הוא 20 דקות, וריצה שעתית הייתה
  // מותירה מלאי מוקפא עד 40 דקות מיותרות בשיא היריד.
  //
  // ⚠️ הראוט /api/cron/book-fair-cleanup נשאר להרצה ידנית. כאן מייבאים
  // את הפונקציה ישירות, כמו בכל שאר המשימות.
  if (process.env.BOOK_FAIR_CLEANUP_DISABLED !== '1') {
    let cleaning = false
    const tickBookFair = async () => {
      // ריצה אורכת שניות ועושה קריאות רשת לספק הסליקה; טיק שנכנס
      // באמצע היה מאמת את אותן הזמנות פעמיים.
      if (cleaning) return
      cleaning = true
      try {
        const { getServiceClient } = await import('@/lib/apiAuth')
        const db = getServiceClient()
        if (!db) return
        const { runBookFairCleanup } = await import('@/lib/bookFairCleanup')
        const r = await runBookFairCleanup(db)
        if (r.expiredReservations || r.cancelledOrders || r.rescuedOrders || r.stockDrift) {
          console.log(
            `[book-fair-cleanup] expired=${r.expiredReservations} cancelled=${r.cancelledOrders}` +
            ` rescued=${r.rescuedOrders}` + (r.stockDrift ? ` ⚠️ drift=${r.stockDrift}` : ''),
          )
        }
      } catch (err) {
        console.error('[book-fair-cleanup] tick failed', err)
      } finally {
        cleaning = false
      }
    }
    setTimeout(() => { void tickBookFair(); setInterval(() => { void tickBookFair() }, 15 * MINUTE_MS) }, INITIAL_DELAY_MS)
    console.log('[book-fair-cleanup] scheduler started (every 15m)')
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ── החלפת קול ⇒ יצירה מחדש של כל ההקלטות — כל 5 דקות ──
  //
  // 🔴 החלפת הקול בהגדרות משנה רק הקלטות *חדשות*. כל קובץ MP3 שכבר הועלה
  // לימות ממשיך להתנגן בקול הישן, ולכן המערכת מדברת בשני קולות: החדש
  // בהודעות הטקסט, הישן בכל מה שהוקלט. אין מסך שמראה את הפער.
  //
  // ⚠️ נעילה בזיכרון: ריצה אורכת דקות, וטיק שני שנכנס באמצע היה מייצר את
  // אותם קבצים במקביל ודורס את התוצאה של קודמו.
  // ─────────────────────────────────────────────────────────────────────────
  if (process.env.VOICE_REBUILD_DISABLED !== '1') {
    let rebuilding = false
    const tickVoiceRebuild = async () => {
      if (rebuilding) return
      try {
        const { getVoiceStale, clearVoiceStale } = await import('@/lib/elevenTts')
        const stale = await getVoiceStale()
        if (!stale.stale) return

        rebuilding = true
        console.log(`[voice-rebuild] הקול הוחלף (${stale.voiceId}) — מייצר מחדש את כל ההקלטות`)
        const { rebuildAllRecordings } = await import('@/lib/voiceRebuild')
        const res = await rebuildAllRecordings()
        console.log(`[voice-rebuild] הושלם: ${res.ok}/${res.total} הוחלפו, ${res.failed} נכשלו`)

        // ⚠️ מסמנים כהושלם גם כשחלק נכשלו: אחרת הריצה תחזור כל 5 דקות
        // ותייצר שוב את מה שכבר הוחלף. הכשלים נרשמו בלוג ויוצגו במסך.
        await clearVoiceStale()
      } catch (err) {
        console.error('[voice-rebuild] tick failed', err)
      } finally {
        rebuilding = false
      }
    }
    setTimeout(() => { void tickVoiceRebuild(); setInterval(() => { void tickVoiceRebuild() }, 5 * MINUTE_MS) }, INITIAL_DELAY_MS)
    console.log('[voice-rebuild] watcher started (every 5m)')
  }
}
