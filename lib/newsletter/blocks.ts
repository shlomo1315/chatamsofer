import { readFileSync } from 'fs'
import { join } from 'path'

// הלוגו מוטמע כ-data URI ולא נטען מהרשת.
//
// למה: Gmail/Outlook חוסמים תמונות חיצוניות כברירת מחדל — הלוגו לא היה מוצג
// עד שהנמען לוחץ "הצג תמונות". תמונה מוטמעת מוצגת תמיד.
// (נטען פעם אחת בעליית השרת ונשמר בזיכרון.)
let logoDataUri: string | null = null

function getLogoDataUri(): string {
  if (logoDataUri !== null) return logoDataUri
  try {
    const buf = readFileSync(join(process.cwd(), 'public', 'logo.png'))
    logoDataUri = `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    // נפילה-לאחור: כתובת רשת (עלולה להיחסם, אבל עדיף מכלום)
    const site = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')
    logoDataUri = `${site}/logo.png`
  }
  return logoDataUri
}

// ─────────────────────────────────────────────────────────────────────────────
// עורך בלוקים — כל בלוק מרונדר לטבלת HTML עם inline styles.
//
// למה בלוקים ולא WYSIWYG חופשי: עורכים כמו Tiptap מייצרים HTML מודרני
// (flexbox/grid) ש-Outlook ו-Gmail לא תומכים בו — מייל שנראה מושלם בעורך
// מתפרק אצל חצי מהנמענים. טבלאות + inline styles זה הפורמט היחיד שעובד בכל
// תוכנות המייל. זו הסיבה שכל מערכות הדיוור המקצועיות עובדות ככה.
// ─────────────────────────────────────────────────────────────────────────────

export type BlockType = 'heading' | 'text' | 'image' | 'button' | 'divider' | 'spacer'

export interface Block {
  id: string
  type: BlockType
  // heading / text
  content?: string
  align?: 'right' | 'center' | 'left'
  level?: 1 | 2
  // image
  src?: string
  alt?: string
  href?: string
  // button
  label?: string
  url?: string
  color?: string
  // spacer
  height?: number
}

const NAVY = '#1B3256'
const GOLD = '#C69D2D'

function escapeAttr(s: unknown): string {
  return String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// URL בטוח בלבד — מונע javascript: ו-data: בקישורים
function safeUrl(url: unknown): string {
  const s = String(url ?? '').trim()
  if (!/^https?:\/\//i.test(s) && !/^mailto:/i.test(s)) return '#'
  return escapeAttr(s)
}

/**
 * רינדור בלוק בודד ל-HTML של מייל.
 * `content` עשוי להכיל HTML בסיסי (bold/italic/link) שהעורך מייצר — הוא מנוקה
 * ב-sanitize לפני השמירה, ולכן אינו מנוטרל כאן.
 */
function renderBlock(b: Block): string {
  const align = b.align ?? 'right'

  switch (b.type) {
    case 'heading': {
      const size = b.level === 2 ? 20 : 25
      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
        <tr><td style="text-align:${align};">
          <h2 style="margin:0;color:${NAVY};font-size:${size}px;font-weight:900;line-height:1.4;">
            ${b.content ?? ''}
          </h2>
        </td></tr>
      </table>`
    }

    case 'text':
      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
        <tr><td style="text-align:${align};color:#334155;font-size:15px;line-height:1.9;">
          ${b.content ?? ''}
        </td></tr>
      </table>`

    case 'image': {
      const img = `<img src="${safeUrl(b.src)}" alt="${escapeAttr(b.alt ?? '')}" width="540"
        style="display:block;width:100%;max-width:540px;height:auto;border-radius:12px;border:0;" />`
      const inner = b.href ? `<a href="${safeUrl(b.href)}" target="_blank">${img}</a>` : img
      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
        <tr><td align="center">${inner}</td></tr>
      </table>`
    }

    case 'button':
      return `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 18px;width:100%;">
        <tr><td align="center" style="border-radius:14px;background:${escapeAttr(b.color ?? GOLD)};">
          <a href="${safeUrl(b.url)}" target="_blank"
             style="display:block;padding:15px 24px;font-family:Arial,sans-serif;font-size:15px;
                    font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px;text-align:center;">
            ${escapeAttr(b.label ?? 'לחצו כאן')}
          </a>
        </td></tr>
      </table>`

    case 'divider':
      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;">
        <tr><td style="border-top:2px solid ${GOLD};font-size:0;line-height:0;">&nbsp;</td></tr>
      </table>`

    case 'spacer':
      return `<div style="height:${Math.min(Math.max(Number(b.height) || 20, 4), 80)}px;font-size:0;line-height:0;">&nbsp;</div>`

    default:
      return ''
  }
}

/** רינדור כל הבלוקים לגוף המייל (ללא המעטפת). */
export function renderBlocks(blocks: Block[]): string {
  return (blocks ?? []).map(renderBlock).join('\n')
}

/**
 * בונה את המייל המלא — התוכן בתוך המעטפת הקיימת של המערכת
 * (shell מ-emailTemplates: לוגו, RTL, Heebo, פוטר).
 * כך הניוזלטר נראה כמו חלק מהמערכת ולא כמו גוף זר.
 */
export function buildCampaignHtml(opts: {
  /** @deprecated לא בשימוש — שם הקמפיין הוא פנימי ואינו מוצג לנמען */
  title?: string
  preheader?: string
  blocks?: Block[]
  rawHtml?: string
  mode: 'blocks' | 'html'
  unsubscribeUrl: string
}): string {
  const body = opts.mode === 'html'
    ? (opts.rawHtml ?? '')
    : renderBlocks(opts.blocks ?? [])

  // פוטר ההסרה — חובה חוקית בכל דיוור
  const footer = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 0;">
      <tr><td style="text-align:center;padding-top:18px;border-top:1px solid #e2e8f0;">
        <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.7;">
          קיבלתם מייל זה כחלק מרשימת התפוצה של היכל החתם סופר.<br/>
          <a href="${opts.unsubscribeUrl}" style="color:#94a3b8;text-decoration:underline;">
            להסרה מרשימת התפוצה
          </a>
        </p>
      </td></tr>
    </table>`

  return newsletterShell(opts.preheader ?? '', body + footer)
}

// מעטפת ייעודית לניוזלטר.
//
// למה לא shell() הרגיל: הוא מכריח כותרת גדולה בראש המייל — ובדיוור, הכותרת
// היא חלק מהתוכן שהמשתמש בונה, לא משהו שנכפה עליו. שם הקמפיין הוא מזהה
// פנימי לניהול בלבד ואסור שיופיע לנמען.
function newsletterShell(preheader: string, body: string): string {
  const safePreheader = String(preheader ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;900&display=swap" rel="stylesheet"/>
  <style>* { font-family: 'Heebo', Arial, sans-serif !important; }</style>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:'Heebo',Arial,sans-serif;direction:rtl;">
  <span style="display:none;font-size:1px;color:#eef2f7;max-height:0;overflow:hidden;">${safePreheader}</span>

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:36px 16px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0"
             style="max-width:620px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(15,23,42,0.10);">

        <tr><td style="background:${NAVY};height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>

        <!-- לוגו בלבד — ללא כותרת כפויה. הכותרת היא חלק מהתוכן. -->
        <tr>
          <td style="padding:32px 40px 8px;text-align:center;">
            <img src="${getLogoDataUri()}" alt="היכל החתם סופר" width="72" height="72"
                 style="display:inline-block;"/>
          </td>
        </tr>

        <tr><td style="padding:20px 40px 32px;">${body}</td></tr>

        <tr>
          <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:2px solid ${NAVY}22;">
            <p style="margin:0 0 4px;color:#334155;font-size:13px;font-weight:700;">היכל החתם סופר</p>
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.7;">
              <a href="mailto:office@chasamsofer.info" style="color:${NAVY};text-decoration:none;font-weight:600;">
                office@chasamsofer.info
              </a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}
