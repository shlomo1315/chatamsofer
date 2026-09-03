import Anthropic from '@anthropic-ai/sdk'

// ─────────────────────────────────────────────────────────────────────────────
// זיהוי מספר קבלה מתוך הקובץ שבית ההחלמה מעלה.
//
// 🔴 הצעה, לא קביעה. הזיהוי לעולם אינו ודאי — קבלה מצולמת בעקום, בכתב יד
// או בתאורה חלשה תיתן מספר שגוי. לכן התוצאה מוצגת לאישור ואינה נשמרת
// בשקט: מספר שגוי שנשמר לבדו גרוע ממספר חסר, כי איש לא יידע לבדוק אותו.
//
// ⚠️ Claude ולא OCR קלאסי: קבלות בתי ההחלמה כתובות עברית, לעיתים בכתב יד,
// ו-OCR רגיל נכשל בהן. מודל שרואה תמונה מתמודד גם עם צילום עקום.
//
// ⚠️ נכשל-שקט: כל שגיאה מחזירה null. הזיהוי הוא נוחות בלבד, ואסור לו
// לחסום שמירה של קבלה שכבר הועלתה.
// ─────────────────────────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-5'

/** סוגי קבצים שאפשר לשלוח למודל. ⚠️ PDF נתמך אף הוא, כמסמך. */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export interface ReceiptScan {
  /** מספר הקבלה שזוהה, או null אם לא נמצא. */
  number: string | null
  /** מידת הביטחון של המודל — קלט להצגה, לא להכרעה אוטומטית. */
  confidence: 'high' | 'low' | null
}

/**
 * מנסה לזהות מספר קבלה מתוך קובץ.
 *
 * @returns תמיד אובייקט; `number: null` כשלא זוהה או שהזיהוי אינו זמין.
 */
export async function scanReceiptNumber(
  bytes: Uint8Array | ArrayBuffer,
  contentType: string,
): Promise<ReceiptScan> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { number: null, confidence: null }

  const isImage = IMAGE_TYPES.has(contentType)
  const isPdf = contentType === 'application/pdf'
  if (!isImage && !isPdf) return { number: null, confidence: null }

  try {
    const client = new Anthropic({ apiKey: key })
    const data = Buffer.from(bytes as Uint8Array).toString('base64')

    // ⚠️ PDF נשלח כ-document ותמונה כ-image — שני טיפוסים נפרדים ב-SDK,
    // ולא ניתן לאחד אותם למשתנה אחד.
    const media: Anthropic.ContentBlockParam = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : {
        type: 'image',
        source: {
          type: 'base64',
          media_type: contentType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif',
          data,
        },
      }

    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          media,
          {
            type: 'text',
            // ⚠️ הנחיה מפורשת להחזיר null: בלעדיה המודל "ממציא" מספר
            // מתוך כל רצף ספרות שהוא רואה — סכום, תאריך או ח.פ.
            text: [
              'זו קבלה של בית החלמה. החזר JSON בלבד, בלי טקסט נוסף:',
              '{"number": "<מספר הקבלה>", "confidence": "high"|"low"}',
              '',
              'כללים:',
              '- "מספר הקבלה" הוא המספר הסידורי של המסמך (ליד "קבלה מס\'", "מס\' קבלה", "חשבונית מס/קבלה").',
              '- אל תחזיר סכום, תאריך, מספר טלפון, ח.פ., ע.מ. או מספר עוסק.',
              '- אם אינך רואה מספר קבלה מפורש — החזר {"number": null, "confidence": null}.',
              '- confidence="low" כשהצילום מטושטש, חתוך, או שיש ספק בין כמה מספרים.',
            ].join('\n'),
          },
        ],
      }],
    })

    const text = res.content
      .map(c => (c.type === 'text' ? c.text : ''))
      .join('')
    return parseReceiptReply(text)
  } catch (err) {
    // ⚠️ נכשל-שקט. הזיהוי הוא נוחות; העלאת הקבלה חייבת להמשיך לעבוד.
    console.error('[receiptOcr] הזיהוי נכשל:', err instanceof Error ? err.message : err)
    return { number: null, confidence: null }
  }
}

/**
 * פרסור תשובת המודל.
 *
 * 🔴 מיוצא לבדיקה — כאן נופלת ההכרעה אם לקבל מספר או לפסול אותו, וזו
 * הנקודה שבה "מספר מומצא" נחסם.
 *
 * ⚠️ כל כשל מחזיר null ולא זורק: תשובה לא צפויה מהמודל אינה אמורה
 * להפיל את העלאת הקבלה.
 */
export function parseReceiptReply(text: string): ReceiptScan {
  const empty: ReceiptScan = { number: null, confidence: null }
  try {
    // ⚠️ המודל עלול לעטוף ב-```json — חולצים את האובייקט הראשון.
    const match = String(text ?? '').match(/\{[\s\S]*\}/)
    if (!match) return empty

    const parsed = JSON.parse(match[0]) as { number?: unknown; confidence?: unknown }
    const raw = typeof parsed.number === 'string' ? parsed.number.trim() : ''

    // ⚠️ מספר קבלה סביר: 2–20 תווים של ספרות, מקפים ולוכסנים בלבד.
    // מחרוזת מילולית ("לא נמצא", "קבלה 123") פירושה שהמודל לא מצא והמציא,
    // ומספר באורך חריג הוא לרוב ח.פ. או טלפון שנתפס בטעות.
    const number = /^[\d\-/]{2,20}$/.test(raw) ? raw : null
    if (!number) return empty

    return { number, confidence: parsed.confidence === 'high' ? 'high' : 'low' }
  } catch {
    return empty
  }
}
