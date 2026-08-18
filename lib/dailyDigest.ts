import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// סיכום יומי למנהל — איסוף הנתונים ובניית המייל.
//
// 🔴 שתי שאלות נפרדות, ושתיהן חייבות להופיע:
//   1. **מה קרה היום** — הפעילות שנכנסה למערכת ב-24 השעות האחרונות.
//   2. **מה ממתין** — מה שתקוע ודורש הכרעה, בלי קשר למתי נכנס.
// סיכום שמציג רק את הראשונה נראה שקט גם כשיש 40 בקשות תקועות משבוע שעבר.
//
// ⚠️ החלון נמדד לפי שעון ישראל ולא UTC: המייל יוצא בחצות שעון ישראל,
// ו-UTC היה חותך את היום באמצע ומדווח על "אתמול" חלקי.
// ─────────────────────────────────────────────────────────────────────────────

const ISRAEL_TZ = 'Asia/Jerusalem'

/** תחילת היום (00:00 שעון ישראל) של התאריך הנתון, כ-Date אמיתי. */
export function israelDayStart(ref: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ISRAEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ref)
  // ⚠️ ה-offset נגזר מהתאריך עצמו ולא מקובע ל-+02:00 — ישראל עוברת לשעון
  // קיץ, וקיבוע היה מזיז את הגבול בשעה במחצית השנה.
  const probe = new Date(`${parts}T00:00:00Z`)
  const asIsrael = new Date(probe.toLocaleString('en-US', { timeZone: ISRAEL_TZ }))
  const asUtc = new Date(probe.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offsetMs = asUtc.getTime() - asIsrael.getTime()
  return new Date(probe.getTime() + offsetMs)
}

export interface DigestSection {
  title: string
  /** צבע המקטע — מזהה את המחלקה, לא מקשט. */
  ink: string
  /** מה קרה היום. */
  today: { label: string; value: number | string }[]
  /**
   * מה ממתין להכרעה. ⚠️ מוצג גם כשאפס — "אין ממתינים" הוא מידע.
   *
   * ⚠️ info=true: שורה שהיא *מידע* ולא משימה יומית, ולכן אינה נספרת
   * בסך הכולל. ראה totalPending.
   */
  pending: { label: string; value: number | string; urgent?: boolean; info?: boolean }[]
}

export interface DigestData {
  dateLabel: string
  sections: DigestSection[]
  /** סך הפריטים הממתינים בכל המחלקות — הכותרת של המייל. */
  totalPending: number
}

const he = (n: number) => n.toLocaleString('he-IL')
const usd = (n: number) => `$${Math.round(n).toLocaleString('he-IL')}`
const ils = (n: number) => `${Math.round(n).toLocaleString('he-IL')} ₪`

/**
 * איסוף כל נתוני הסיכום.
 *
 * ⚠️ head:true על כל ספירה — מחזיר count בלבד בלי להעביר שורות. סיכום
 * שמושך אלפי רשומות רק כדי לספור אותן היה מאט את ה-cron בלי צורך.
 */
export async function buildDigestData(db: SupabaseClient, ref = new Date()): Promise<DigestData> {
  const dayStart = israelDayStart(ref)
  const since = dayStart.toISOString()
  const hc = { count: 'exact' as const, head: true }

  const dateLabel = new Intl.DateTimeFormat('he-IL', {
    timeZone: ISRAEL_TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(dayStart)

  const [
    newBens, pendingBens, deepReview, docsPending,
    newLoans, loansPending, loansApprovedToday, loansDisbursedToday, loansAwaitingDisburse,
    newBirths, birthsPending, birthsDeepReview,
    newRecipients, recipientsPending,
    widowPending, aidPending,
    disbursedRows,
  ] = await Promise.all([
    db.from('beneficiaries').select('id', hc).gte('created_at', since),
    db.from('beneficiaries').select('id', hc).eq('eligibility_status', 'pending'),
    db.from('beneficiaries').select('id', hc).eq('eligibility_status', 'deep_review'),
    db.from('beneficiaries').select('id', hc).eq('eligibility_status', 'docs_pending'),

    db.from('loans').select('id', hc).gte('created_at', since),
    db.from('loans').select('id', hc).in('status', ['pending', 'inquiry']),
    db.from('loans').select('id', hc).gte('approved_at', since),
    db.from('loans').select('id', hc).gte('disbursed_at', since),
    // 🔴 אושר וטרם נמסר שטר — כסף שהוקצה ולא יצא. הפער הזה אינו מופיע
    // בשום סטטוס בודד.
    db.from('loans').select('id', hc).in('status', ['approved', 'active']).is('disbursed_at', null),

    // ⚠️ לידות שקטות מוחרגות, כמו בכל שאר המסכים.
    db.from('maternity_aids').select('id', hc).gte('created_at', since).or('birth_type.is.null,birth_type.neq.silent'),
    db.from('maternity_aids').select('id', hc).eq('status', 'pending').or('birth_type.is.null,birth_type.neq.silent'),
    db.from('maternity_aids').select('id', hc).eq('status', 'deep_review'),

    db.from('distribution_recipients').select('id', hc).gte('registered_at', since),
    db.from('distribution_recipients').select('id', hc).eq('approval_status', 'pending'),

    db.from('widow_requests').select('id', hc).eq('status', 'pending'),
    db.from('financial_aid_requests').select('id', hc).eq('status', 'pending'),

    // סכום שנמסר היום — נתון כספי, לכן נשלף ולא נספר.
    db.from('loans').select('approved_amount, amount').gte('disbursed_at', since),
  ])

  const disbursedAmt = (disbursedRows.data ?? []).reduce(
    (s, r) => s + (Number((r as { approved_amount?: number | null }).approved_amount
      ?? (r as { amount?: number | null }).amount) || 0), 0)

  const n = (r: { count: number | null }) => r.count ?? 0

  const sections: DigestSection[] = [
    {
      title: 'איגוד הצאצאים',
      ink: '#6366f1',
      today: [{ label: 'משפחות שנרשמו', value: he(n(newBens)) }],
      // 🔴 שורות מידע ולא משימות: אלפי צאצאים "ממתינים לאישור" הם מצב
      // מתמשך של המאגר ולא עבודה של היום. ספירתם בסך הכולל הציגה 12,879
      // "פריטים ממתינים לטיפול" והטביעה את מה שבאמת דורש הכרעה.
      pending: [
        { label: 'ממתינות לאישור', value: he(n(pendingBens)), info: true },
        { label: 'בבדיקה מעמיקה', value: he(n(deepReview)), info: true },
        { label: 'ממתינות להשלמת מסמכים', value: he(n(docsPending)), info: true },
      ],
    },
    {
      title: 'גמ״ח הלוואות',
      ink: '#1d4ed8',
      today: [
        { label: 'בקשות חדשות', value: he(n(newLoans)) },
        { label: 'אושרו היום', value: he(n(loansApprovedToday)) },
        { label: 'נמסר שטר היום', value: `${he(n(loansDisbursedToday))} · ${usd(disbursedAmt)}` },
      ],
      pending: [
        { label: 'ממתינות לטיפול', value: he(n(loansPending)), urgent: n(loansPending) > 0 },
        { label: 'אושרו וטרם נמסר שטר', value: he(n(loansAwaitingDisburse)), urgent: n(loansAwaitingDisburse) > 0 },
      ],
    },
    {
      title: 'עזר יולדות',
      ink: '#0f766e',
      today: [{ label: 'לידות חדשות', value: he(n(newBirths)) }],
      pending: [
        { label: 'ממתינות לאישור', value: he(n(birthsPending)), urgent: n(birthsPending) > 0 },
        // ⚠️ deep_review ביולדות = "ממתין לאישור מנהל" (ראה lib/maternityBuckets).
        { label: 'הועבר לאישור מנהל', value: he(n(birthsDeepReview)), urgent: n(birthsDeepReview) > 0 },
      ],
    },
    {
      title: 'חלוקות חגים',
      ink: '#b45309',
      today: [{ label: 'נרשמו היום', value: he(n(newRecipients)) }],
      pending: [{ label: 'ממתינים לאישור', value: he(n(recipientsPending)), urgent: n(recipientsPending) > 0 }],
    },
    {
      title: 'מחלקות נוספות',
      ink: '#7c3aed',
      today: [],
      pending: [
        { label: 'אלמנות ויתומים — ממתינות', value: he(n(widowPending)), urgent: n(widowPending) > 0 },
        { label: 'סיוע רפואי — ממתינות', value: he(n(aidPending)), urgent: n(aidPending) > 0 },
      ],
    },
  ]

  // 🔴 הסך כולל *רק* משימות שדורשות הכרעה — בלי שורות המידע של הצאצאים.
  // עם הצאצאים המספר היה 12,879, כלומר "יש אלפי דברים לטפל" — וזה הפך
  // את הכותרת לחסרת שימוש.
  const totalPending = n(loansPending) + n(loansAwaitingDisburse)
    + n(birthsPending) + n(birthsDeepReview) + n(recipientsPending)
    + n(widowPending) + n(aidPending)

  return { dateLabel, sections, totalPending }
}

/**
 * בניית ה-HTML של המייל.
 *
 * ⚠️ טבלאות ו-inline styles ולא flex/grid: לקוחות מייל (בעיקר Outlook)
 * אינם תומכים בפריסות מודרניות, וגיליון סגנון חיצוני נחתך.
 *
 * ⚠️ dir="rtl" על כל טבלה בנפרד — Gmail מסיר את התכונה מה-body.
 */
export function renderDigestHtml(d: DigestData): string {
  const card = (s: DigestSection) => {
    const row = (label: string, value: number | string, urgent?: boolean, info?: boolean) => `
      <tr>
        <td style="padding:7px 0;font-size:13px;color:#475569;border-bottom:1px solid #f1f5f9;">${label}</td>
        <td style="padding:7px 0;font-size:14px;font-weight:700;text-align:left;border-bottom:1px solid #f1f5f9;color:${urgent ? '#b45309' : info ? '#64748b' : '#0f172a'};" dir="ltr">${value}</td>
      </tr>`

    const todayRows = s.today.map(t => row(t.label, t.value)).join('')
    const pendingRows = s.pending.map(p => row(p.label, p.value, p.urgent, p.info)).join('')

    return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl"
      style="margin:0 0 14px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#ffffff;">
      <tr>
        <td style="padding:0;">
          <div style="height:3px;background:${s.ink};"></div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 18px 4px;">
          <div style="font-size:15px;font-weight:800;color:#0f172a;">${s.title}</div>
        </td>
      </tr>
      ${s.today.length ? `
      <tr><td style="padding:6px 18px 0;">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:.04em;padding-bottom:2px;">היום</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl">${todayRows}</table>
      </td></tr>` : ''}
      ${s.pending.length ? `
      <tr><td style="padding:10px 18px 16px;">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:.04em;padding-bottom:2px;">${s.pending.every(p => p.info) ? 'מצב המאגר' : 'ממתין לטיפול'}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl">${pendingRows}</table>
      </td></tr>` : ''}
    </table>`
  }

  return `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl" style="max-width:620px;">

  <tr><td style="padding:0 0 18px;text-align:center;">
    <div style="font-size:11px;font-weight:700;color:#b08d3f;letter-spacing:.18em;">היכל החתם סופר</div>
    <div style="font-size:22px;font-weight:800;color:#0f172a;padding-top:6px;">סיכום יומי</div>
    <div style="font-size:13px;color:#64748b;padding-top:4px;">${d.dateLabel}</div>
  </td></tr>

  <tr><td style="padding:0 0 18px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="rtl"
      style="border-radius:12px;background:${d.totalPending > 0 ? '#fffbeb' : '#f0fdf4'};border:1px solid ${d.totalPending > 0 ? '#fde68a' : '#bbf7d0'};">
      <tr><td style="padding:16px 18px;text-align:center;">
        <div style="font-size:32px;font-weight:800;color:${d.totalPending > 0 ? '#b45309' : '#15803d'};" dir="ltr">${d.totalPending.toLocaleString('he-IL')}</div>
        <div style="font-size:12px;font-weight:700;color:${d.totalPending > 0 ? '#92400e' : '#166534'};padding-top:2px;">
          ${d.totalPending > 0 ? 'פריטים ממתינים לטיפול' : 'אין פריטים ממתינים — הכל מטופל'}
        </div>
      </td></tr>
    </table>
  </td></tr>

  <tr><td>${d.sections.map(card).join('')}</td></tr>

  <tr><td style="padding:8px 0 0;text-align:center;">
    <div style="font-size:11px;color:#94a3b8;">
      נשלח אוטומטית בכל לילה · לא נשלח בשבתות ובחגים
    </div>
  </td></tr>

</table>
</td></tr></table>
</body></html>`
}

/** גרסת טקסט — ⚠️ נדרשת: לקוח שחוסם HTML מציג מייל ריק בלעדיה. */
export function renderDigestText(d: DigestData): string {
  const lines = [`סיכום יומי — ${d.dateLabel}`, '', `סה"כ ממתינים לטיפול: ${d.totalPending}`, '']
  for (const s of d.sections) {
    lines.push(`── ${s.title} ──`)
    for (const t of s.today) lines.push(`  היום · ${t.label}: ${t.value}`)
    for (const p of s.pending) lines.push(`  ממתין · ${p.label}: ${p.value}`)
    lines.push('')
  }
  return lines.join('\n')
}
