import { NextResponse, type NextRequest } from 'next/server'
import { requireMailAccess, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { getGmailClientForToken, parseMessage, getBody } from '@/lib/gmail'
import { fetchAllRows } from '@/lib/fetchAllRows'

export const dynamic = 'force-dynamic'
const UNREAD_LABEL = 'UNREAD'

// ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
// ׳×׳™׳‘׳× ׳”׳“׳•׳׳¨ ג€” ׳ ׳‘׳ ׳™׳× ׳¢׳ ׳”׳׳™׳ ׳“׳§׳¡, ׳׳ ׳¢׳ Gmail API.
//
// נ”´ ׳–׳” ׳”׳”׳‘׳“׳ ׳׳”׳׳¡׳ ׳”׳™׳©׳: ׳¨׳©׳™׳׳× ׳”׳”׳•׳“׳¢׳•׳× ׳ ׳©׳׳₪׳× ׳׳”׳׳¡׳“ (׳׳™׳™׳“׳™, ׳ ׳™׳×׳ ׳׳—׳™׳₪׳•׳©
// ׳•׳׳¡׳™׳ ׳•׳ ׳׳₪׳™ ׳׳—׳׳§׳”), ׳•׳¨׳§ *׳’׳•׳£ ׳”׳”׳•׳“׳¢׳”* ׳ ׳׳©׳ ׳-Gmail ג€” ׳•׳¨׳§ ׳›׳©׳₪׳•׳×׳—׳™׳ ׳׳•׳×׳”.
//
// ג ן¸ ׳”׳׳¡׳ ׳”׳™׳©׳ ׳§׳¨׳ ׳׳× ׳›׳ ׳”׳×׳™׳‘׳” ׳-Gmail ׳‘׳›׳ ׳˜׳¢׳™׳ ׳”, ׳•׳׳›׳ ׳”׳™׳” ׳׳™׳˜׳™, ׳׳ ׳™׳“׳¢
// ׳׳—׳₪׳© ׳׳₪׳™ ׳׳•׳˜׳‘, ׳•׳׳ ׳™׳›׳•׳ ׳”׳™׳” ׳׳”׳¦׳™׳’ ׳׳—׳׳§׳”. ׳”׳׳™׳ ׳“׳§׳¡ ׳₪׳•׳×׳¨ ׳׳× ׳©׳׳•׳©׳×׳.
//
// ג ן¸ ׳”׳’׳•׳£ ׳׳¢׳•׳׳ ׳׳™׳ ׳• ׳ ׳©׳׳¨ ׳‘׳׳¡׳“. ׳”׳•׳ ׳ ׳׳©׳ ׳‘׳›׳ ׳₪׳×׳™׳—׳” ג€” ׳›׳ ׳׳™׳ ׳¢׳•׳×׳§ ׳©׳ ׳™ ׳©׳™׳›׳•׳
// ׳׳¡׳×׳•׳¨ ׳׳× Gmail, ׳•׳–׳• ׳›׳ ׳”׳¡׳™׳‘׳” ׳©׳”׳׳¢׳‘׳¨ ׳”׳–׳” ׳ ׳¢׳©׳”.
//
// GET ?folder=inbox|sent&department=&q=&page=  ג€” ׳¨׳©׳™׳׳”
// GET ?id=<gmail_message_id>                    ג€” ׳”׳•׳“׳¢׳” ׳׳׳׳” (׳’׳•׳£ ׳-Gmail)
// ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

const PAGE_SIZE = 50

const LIST_COLS =
  'gmail_message_id, thread_id, from_email, from_name, to_email, original_to, ' +
  'subject, snippet, sent_at, has_attachments, is_unread, labels, department, beneficiary_id, account_id'

export async function GET(request: NextRequest) {
  const staff = await requireMailAccess()
  if (!staff) return unauthorized()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: '׳©׳’׳™׳׳× ׳©׳¨׳×' }, { status: 500 })

  const sp = request.nextUrl.searchParams
  const messageId = sp.get('id')

  // ג”€ג”€ ׳”׳•׳“׳¢׳” ׳‘׳•׳“׳“׳×: ׳׳˜׳-׳“׳׳˜׳” ׳׳”׳׳™׳ ׳“׳§׳¡ + ׳’׳•׳£ ׳-Gmail ג”€ג”€
  if (messageId) {
    const { data } = await db.from('gmail_messages')
      .select(LIST_COLS).eq('gmail_message_id', messageId).maybeSingle()
    if (!data) return NextResponse.json({ error: 'ההודעה לא נמצאה' }, { status: 404 })

    const row = data as unknown as Record<string, unknown>
    const { data: acc } = await db.from('gmail_accounts')
      .select('refresh_token').eq('id', String(row.account_id ?? '')).maybeSingle()
    const token = (acc as { refresh_token?: string } | null)?.refresh_token

    let body = ''
    let attachments: unknown[] = []
    let unreadInGmail = false
    if (token) {
      try {
        const gmail = getGmailClientForToken(token)
        const res = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' })
        body = getBody(res.data?.payload)
        attachments = parseMessage(res.data).attachments ?? []
        unreadInGmail = (res.data?.labelIds ?? []).includes(UNREAD_LABEL)
      } catch (e) {
        // ג ן¸ ׳›׳©׳ ׳‘׳׳©׳™׳›׳× ׳”׳’׳•׳£ ׳׳™׳ ׳• ׳׳¡׳×׳™׳¨ ׳׳× ׳”׳”׳•׳“׳¢׳”: ׳”׳׳˜׳-׳“׳׳˜׳” ׳׳•׳¦׳’׳× ׳¢׳
        // ׳”׳•׳“׳¢׳× ׳©׳’׳™׳׳”, ׳›׳“׳™ ׳©׳™׳”׳™׳” ׳‘׳¨׳•׳¨ ׳©׳”׳”׳•׳“׳¢׳” ׳§׳™׳™׳׳× ׳•׳”׳‘׳¢׳™׳” ׳”׳™׳ ׳‘׳˜׳¢׳™׳ ׳”.
        console.error('[inbox] ׳׳©׳™׳›׳× ׳’׳•׳£ ׳ ׳›׳©׳׳”:', e instanceof Error ? e.message : e)
        return NextResponse.json({ message: row, body: '', attachments: [], bodyError: '׳˜׳¢׳™׳ ׳× ׳×׳•׳›׳ ׳”׳”׳•׳“׳¢׳” ׳ ׳›׳©׳׳”' })
      }
    }

    // ג ן¸ ׳¡׳™׳׳•׳ ׳›׳ ׳§׳¨׳ ׳׳×׳‘׳¦׳¢ ׳‘-Gmail *׳•׳’׳* ׳‘׳׳™׳ ׳“׳§׳¡. ׳¢׳“׳›׳•׳ ׳”׳׳™׳ ׳“׳§׳¡ ׳‘׳׳‘׳“ ׳”׳™׳”
    // ׳׳×׳ ׳’׳© ׳¢׳ ׳”׳¡׳ ׳›׳¨׳•׳ ׳”׳‘׳, ׳©׳׳•׳©׳ ׳׳× ׳׳¦׳‘ ׳”׳׳׳× ׳-Gmail ׳•׳׳—׳–׳™׳¨ ׳׳•׳×׳• ׳׳׳-׳ ׳§׳¨׳.
    let markReadApplied = false
    if (unreadInGmail && token) {
      try {
        await getGmailClientForToken(token).users.messages.modify({
          userId: 'me', id: messageId, requestBody: { removeLabelIds: [UNREAD_LABEL] },
        })
        await db.from('gmail_messages').update({ is_unread: false }).eq('gmail_message_id', messageId)
        markReadApplied = true
      } catch { /* best-effort ג€” ׳”׳§׳¨׳™׳׳” ׳¢׳¦׳׳” ׳—׳©׳•׳‘׳” ׳™׳•׳×׳¨ ׳׳”׳¡׳™׳׳•׳ */ }
    }

    if (markReadApplied) row.is_unread = false

    return NextResponse.json({ message: row, body, attachments })
  }

  // ג”€ג”€ ׳¨׳©׳™׳׳” ג”€ג”€
  const folder = sp.get('folder') ?? 'inbox'
  const department = sp.get('department') ?? ''
  const q = (sp.get('q') ?? '').trim()
  const page = Math.max(0, Number(sp.get('page') ?? 0) || 0)

  let query = db.from('gmail_messages')
    .select(LIST_COLS, { count: 'exact' })
    .is('deleted_at', null)

  // ג ן¸ ׳”׳¡׳™׳ ׳•׳ ׳׳₪׳™ ׳×׳•׳•׳™׳•׳× Gmail ׳•׳׳ ׳׳₪׳™ ׳©׳“׳” ׳׳©׳׳ ׳•: ׳”׳×׳•׳•׳™׳•׳× ׳”׳ ׳׳§׳•׳¨ ׳”׳׳׳×,
  // ׳•׳”׳ ׳׳×׳¢׳“׳›׳ ׳•׳× ׳‘׳›׳ ׳¡׳ ׳›׳¨׳•׳. ׳©׳“׳” ׳ ׳’׳–׳¨ ׳”׳™׳” ׳׳×׳™׳™׳©׳.
  if (folder === 'sent') query = query.contains('labels', ['SENT'])
  else if (folder === 'unread') query = query.eq('is_unread', true).contains('labels', ['INBOX'])
  else if (folder === 'followup') query = query.contains('labels', ['לטיפול'])
  else if (folder === 'starred') query = query.contains('labels', ['STARRED'])
  else if (folder === 'all') { /* ׳”׳›׳ ג€” ׳‘׳׳™ ׳¡׳™׳ ׳•׳ ׳×׳•׳•׳™׳× */ }
  else query = query.contains('labels', ['INBOX'])

  if (department) query = query.eq('department', department)
  // ג ן¸ ׳¡׳™׳ ׳•׳ ׳׳₪׳™ ׳×׳™׳‘׳”: ׳›׳©׳׳—׳•׳‘׳¨׳•׳× ׳›׳׳” ׳×׳™׳‘׳•׳×, "׳“׳•׳׳¨ ׳ ׳›׳ ׳¡" ׳׳¢׳¨׳‘׳‘ ׳׳× ׳›׳•׳׳
  // ׳•׳׳™ ׳׳₪׳©׳¨ ׳׳¢׳‘׳•׳“ ׳¢׳ ׳×׳™׳‘׳” ׳׳—׳×.
  const accountId = sp.get('account') ?? ''
  if (accountId) query = query.eq('account_id', accountId)

  // ׳×׳•׳•׳™׳× Gmail ׳¡׳₪׳¦׳™׳₪׳™׳× (׳׳”׳₪׳׳ ׳ ׳”׳¦׳“׳“׳™).
  const label = sp.get('label') ?? ''
  if (label) query = query.contains('labels', [label])

  // 🔴 תיבות "לסנכרון בלבד" (sync_only) אינן חלק מהתצוגה הרגילה.
  //
  // המיילים הישנים מ-Gmail נמשכים לארכיון, אבל אין לעבוד בהם: הם הציפו
  // את הדואר הנכנס ואת "כל ההודעות" באלפי הודעות היסטוריות, והסתירו את
  // מה שבאמת מחכה לטיפול בתיבות הדומיין.
  //
  // ⚠️ מוסתרים רק מהרשימות הכלליות. כשבוחרים במפורש את התיבה (account=)
  // או את התווית שלה (label=) — הם כן מוצגים, אחרת הארכיון היה נמשך
  // לשווא ובלי שום דרך להגיע אליו.
  if (!accountId && !label) {
    const { data: hidden } = await db.from('gmail_accounts')
      .select('id').eq('sync_only', true)
    const hiddenIds = (hidden ?? []).map(a => String((a as { id: string }).id))
    if (hiddenIds.length) {
      query = query.or(`account_id.is.null,account_id.not.in.(${hiddenIds.join(',')})`)
    }
  }

  if (q) {
    // ג ן¸ ׳—׳™׳₪׳•׳© ׳¢׳ ׳׳˜׳-׳“׳׳˜׳” ׳‘׳׳‘׳“ ג€” ׳”׳’׳•׳£ ׳׳™׳ ׳• ׳‘׳׳¡׳“. ׳–׳” ׳׳›׳•׳•׳: ׳—׳™׳₪׳•׳© ׳‘׳’׳•׳£
    // ׳׳—׳™׳™׳‘ ׳©׳׳™׳¨׳× ׳¢׳•׳×׳§, ׳•׳–׳• ׳‘׳“׳™׳•׳§ ׳”׳›׳₪׳™׳׳•׳× ׳©׳”׳׳¢׳‘׳¨ ׳ ׳•׳¢׳“ ׳׳¡׳׳§.
    const safe = q.replace(/[%,()]/g, ' ')
    query = query.or(
      `subject.ilike.%${safe}%,from_email.ilike.%${safe}%,from_name.ilike.%${safe}%,snippet.ilike.%${safe}%`,
    )
  }

  const { data, count, error } = await query
    .order('sent_at', { ascending: false, nullsFirst: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

  if (error) {
    console.error('[inbox] שליפה נכשלה:', error.message)
    return NextResponse.json({ error: '׳©׳׳™׳₪׳× ׳”׳”׳•׳“׳¢׳•׳× ׳ ׳›׳©׳׳”' }, { status: 500 })
  }

  // מונה הלא-נקראים לכל מחלקה ולכל תיבה — לתגיות בפאנל הצדדי.
  //
  // 🔴 fetchAllRows ולא שאילתה בודדת: התקרה השקטה של 1,000 חתכה את
  // הספירה, והמסך הציג מונה נמוך מהאמת. ראו lib/fetchAllRows.
  //
  // ⚠️ תיבות sync_only אינן נספרות: הן אינן מוצגות ברשימה, ומונה
  // "230 לא נקראו" על ארכיון שאי אפשר לפתוח הוא רעש בלבד.
  const { rows: unreadRows } = await fetchAllRows<{ department?: string | null; account_id?: string | null }>(
    (from, to) => db.from('gmail_messages')
      .select('department, account_id').eq('is_unread', true).is('deleted_at', null)
      .contains('labels', ['INBOX']).range(from, to))
  const syncOnlyIds = new Set(
    ((await db.from('gmail_accounts').select('id').eq('sync_only', true)).data ?? [])
      .map(a => String((a as { id: string }).id)))
  const unreadByDept: Record<string, number> = {}
  const unreadByAccount: Record<string, number> = {}
  for (const r of unreadRows) {
    if (r.account_id && syncOnlyIds.has(String(r.account_id))) continue
    const k = r.department || '_none'
    unreadByDept[k] = (unreadByDept[k] ?? 0) + 1
    if (r.account_id) unreadByAccount[r.account_id] = (unreadByAccount[r.account_id] ?? 0) + 1
  }

  // ג”€ג”€ ׳”׳×׳™׳‘׳•׳× ׳•׳”׳×׳•׳•׳™׳•׳× ׳׳₪׳׳ ׳ ׳”׳¦׳“׳“׳™ ג”€ג”€
  // ⚠️ refresh_token נשלף לשימוש *בשרת בלבד* (משיכת שמות התוויות למטה),
  // ומנוקה לפני שהרשימה נשלחת ללקוח — אסור שיגיע לדפדפן.
  const { data: accountsRaw } = await db.from('gmail_accounts')
    .select('id, email, label, department, refresh_token, sync_only, label_id').eq('is_active', true).order('email')
  const accounts = (accountsRaw ?? []).map(({ refresh_token: _t, ...rest }) => rest)

  // ג ן¸ ׳”׳×׳•׳•׳™׳•׳× ׳ ׳’׳–׳¨׳•׳× ׳׳”׳׳™׳ ׳“׳§׳¡ ׳•׳׳ ׳ ׳©׳׳₪׳•׳× ׳-Gmail ׳‘׳›׳ ׳˜׳¢׳™׳ ׳”: ׳©׳׳™׳₪׳” ׳׳©׳
  // ׳”׳™׳™׳×׳” ׳׳•׳¡׳™׳₪׳” ׳¡׳‘׳‘ ׳¨׳©׳× ׳׳›׳ ׳¨׳¢׳ ׳•׳, ׳•׳”׳×׳•׳•׳™׳•׳× ׳׳׳™׳׳ ׳׳¡׳•׳ ׳›׳¨׳ ׳•׳×.
  // ׳׳¡׳ ׳ ׳™׳ ׳×׳•׳•׳™׳•׳× ׳׳¢׳¨׳›׳× (INBOX, SENT, CATEGORY_*) ׳©׳׳™׳ ׳ ׳׳¢׳ ׳™׳™׳ ׳•׳× ׳‘׳×׳¦׳•׳’׳”.
  const SYSTEM = /^(INBOX|SENT|DRAFT|SPAM|TRASH|UNREAD|STARRED|IMPORTANT|CHAT|CATEGORY_)/
  const { data: labelRows } = await db.from('gmail_messages')
    .select('labels').is('deleted_at', null).limit(2000)
  const labelCounts: Record<string, number> = {}
  for (const r of (labelRows ?? []) as { labels?: string[] | null }[]) {
    for (const l of r.labels ?? []) {
      if (!l || SYSTEM.test(l)) continue
      labelCounts[l] = (labelCounts[l] ?? 0) + 1
    }
  }
  // 🔴 תרגום מזהי תוויות לשמות אמיתיים.
  //
  // Gmail מחזיר ב-labelIds *מזהים* ("Label_2", "924736508402…"), לא שמות,
  // והם מה שנשמר באינדקס. המסך הציג אותם כפי שהם, ולכן במקום
  // "רישום חגי תשרי" נראה "Label_2" — חסר משמעות למשתמש.
  // השמות נמשכים מ-Gmail (labels.list) וממופים כאן, בעת ההצגה בלבד:
  // הנתונים השמורים אינם משתנים, ולכן אין צורך במיגרציה או בסנכרון מחדש.
  //
  // ⚠️ כשל במשיכה אינו מפיל את המסך — נופלים בחזרה למזהה הגולמי.
  const labelNames = new Map<string, string>()
  try {
    const acct = (accountsRaw ?? [])[0] as { refresh_token?: string } | undefined
    if (acct?.refresh_token) {
      const gmail = getGmailClientForToken(acct.refresh_token)
      const list = await gmail.users.labels.list({ userId: 'me' })
      for (const l of (list.data?.labels ?? []) as { id?: string | null; name?: string | null }[]) {
        if (l.id && l.name) labelNames.set(String(l.id), String(l.name))
      }
    }
  } catch (e) {
    console.error('[inbox] משיכת שמות התוויות נכשלה:', e instanceof Error ? e.message : e)
  }

  const labels = Object.entries(labelCounts)
    .map(([id, n]) => ({ id, name: labelNames.get(id) ?? id, count: n }))
    // ⚠️ מסתירים תוויות שנותרו כמזהה גולמי ואינן קיימות עוד ב-Gmail
    // (נמחקו שם אך נשארו על הודעות ישנות באינדקס) — הן רק רעש.
    .filter(l => !/^Label_\d+$/.test(l.name))
    .sort((a, b) => b.count - a.count)
    .slice(0, 25)

  // 🔴 תוויות התיבות המסונכרנות — הדרך היחידה להגיע לארכיון.
  //
  // ⚠️ אלה אינן תוויות Gmail: הן מוגדרות במערכת (mail_label_defs) ומשויכות
  // לתיבה דרך gmail_accounts.label_id. הן לא נבנו מ-gmail_messages.labels
  // ולכן נעלמו מהסרגל לגמרי — ומיילי "גמ״ח ישן" נאספו בלי דרך לפתוח אותם.
  //
  // הספירה היא לפי התיבה (account_id), לא לפי תווית על ההודעה: התווית
  // מתארת *מאיפה* המייל הגיע, וזה בדיוק מה שהמשתמש מחפש.
  const boxLabels: { id: string; name: string; count: number; account: string; department: string | null }[] = []
  {
    const { data: defsRow } = await db.from('app_settings')
      .select('value').eq('key', 'mail_label_defs').maybeSingle()
    let defs: { id: string; name: string }[] = []
    try {
      const raw = (defsRow as { value?: string } | null)?.value
      if (raw) defs = JSON.parse(raw)
    } catch { defs = [] }

    for (const acc of (accountsRaw ?? []) as { id: string; label?: string | null; label_id?: string | null; sync_only?: boolean; department?: string | null }[]) {
      if (!acc.sync_only || !acc.label_id) continue
      const { count: n } = await db.from('gmail_messages')
        .select('id', { count: 'exact', head: true })
        .is('deleted_at', null).eq('account_id', acc.id)
      boxLabels.push({
        id: acc.label_id,
        name: defs.find(d => d.id === acc.label_id)?.name ?? acc.label ?? 'ארכיון',
        count: n ?? 0,
        account: acc.id,
        // ⚠️ המחלקה נשלחת כדי שהלקוח יציג את התווית רק בתיבה שאליה היא
        // שייכת: "גמ״ח ישן" בתוך תיבת המשרד הראשי היא רעש — הארכיון של
        // הגמ״ח אינו קשור לדואר שנמצא שם.
        department: acc.department ?? null,
      })
    }
  }

  // ׳׳•׳ ׳” "לטיפול" ג€” ׳׳×׳’׳™׳× ׳‘׳₪׳׳ ׳.
  const { count: followupCount } = await db.from('gmail_messages')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null).contains('labels', ['לטיפול'])

  return NextResponse.json({
    messages: data ?? [],
    boxLabels,
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    hasMore: (count ?? 0) > (page + 1) * PAGE_SIZE,
    unreadByDept,
    unreadByAccount,
    accounts: accounts ?? [],
    labels,
    followupCount: followupCount ?? 0,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
