import { NextResponse } from 'next/server'
import { scrambleBytes, DOC_CIPHER_ID } from '@/lib/docCipher'

// קובץ קוויטל (PDF או Word) נשלח לדפדפן כ*נתונים* ולא כקובץ.
//
// ⚠️ נטפרי מזהה תגובה לפי סוג התוכן שלה: application/pdf נחסם ב-418, והדפדפן קיבל
// "ההורדה נכשלה" בסגירת המנה. המטען מעורבל לפני ה-base64, אחרת חתימת ה-PDF ("JVBERi")
// גלויה גם בתוך JSON. הדפדפן מבטל את הערבול ומרכיב Blob מקומי (downloadKvitel).
// אותו מנגנון כמו מכתבי הברכה (api/admin/gratitude/batch-pdf).
// date — היום שבשם הקובץ (יום ההורדה או יום סגירת המנה), לא השבת שבכותרת.
export function kvitelFileResponse(bytes: Uint8Array, format: 'pdf' | 'docx', date: Date) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(date)
  return NextResponse.json({
    name: `קוויטל-${day}.${format}`,
    contentType: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: bytes.length,
    enc: DOC_CIPHER_ID,
    data: Buffer.from(scrambleBytes(new Uint8Array(bytes))).toString('base64'),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
