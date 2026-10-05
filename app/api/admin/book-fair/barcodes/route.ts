import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { buildBookFairBarcodesPdf, buildBookFairBarcodeSheetsPdf } from '@/lib/bookFairBarcodesPdf'
import { scrambleBytes, DOC_CIPHER_ID } from '@/lib/docCipher'

// גיליון תוויות ברקוד להדפסה — כל ספר פעיל בקטלוג, לחיתוך ותלייה על
// השולחן ביריד. סריקה בקופה מזהה את המק"ט מיד.
//
// 🔴 הקובץ נשלח כ*נתונים* ולא כקובץ — אותו ערוץ כמו /api/admin/gratitude/
// batch-pdf. תגובת application/pdf היא "קובץ" מבחינת נטפרי ונחסמת ב-418
// Blocked by NetFree. המטען מעורבל (docCipher) כדי שגם ה-base64 לא יישא
// את חתימת ה-PDF ("JVBERi") — הדפדפן מבטל את הערבול ובונה Blob מקומי.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// מצבים (?mode=):
//   (ריק)   — גיליון משותף: תווית אחת לכל ספר (כמו קודם)
//   sheet   — דף מלא לספר אחד (?sku=…&pages=N), 24 תוויות זהות לעמוד
//   sheets  — שני דפים לכל ספר בקטלוג, PDF אחד
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('mode') ?? ''
  const onlySku = request.nextUrl.searchParams.get('sku')?.trim() ?? ''
  const pages = Math.max(1, Math.min(20, Number(request.nextUrl.searchParams.get('pages')) || 1))
  if (!(await requirePermission('book_fair', 'view'))) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  // ⚠️ fetchAllRows: PostgREST קוטע ב-1,000 שורות בשקט — קטלוג חתוך
  // היה מדפיס גיליון תוויות חסר בלי שום אזהרה.
  const { rows, error } = await fetchAllRows<{ sku: string; title: string }>((from, to) =>
    db.from('book_fair_books')
      .select('sku, title')
      .eq('is_active', true)
      .range(from, to)
  )
  if (error) return NextResponse.json({ error: 'טעינת הקטלוג נכשלה' }, { status: 500 })
  if (!rows.length) return NextResponse.json({ error: 'אין ספרים פעילים בקטלוג' }, { status: 404 })

  // ⚠️ מיון א"ב בעברית ב-JS ולא ב-PostgREST: סדר ה-collation של המסד
  // אינו סדר האלפבית העברי, ו-order('title') החזיר סדר שנראה אקראי.
  // localeCompare עם 'he' הוא המיון שהמשתמש מצפה לו כשהוא מחפש ספר
  // בערימת התוויות המודפסת.
  rows.sort((a, b) => a.title.localeCompare(b.title, 'he'))

  let selected = rows
  if (mode === 'sheet') {
    selected = rows.filter(r => r.sku === onlySku)
    if (!selected.length) return NextResponse.json({ error: 'הספר לא נמצא בקטלוג הפעיל' }, { status: 404 })
  }

  try {
    const bytes = mode === 'sheet' || mode === 'sheets'
      // ⚠️ הקטלוג המלא — שני עמודים לכל ספר (בקשת המשתמש 05.10).
      ? await buildBookFairBarcodeSheetsPdf(selected, mode === 'sheet' ? pages : 2)
      : await buildBookFairBarcodesPdf(rows)
    const name = mode === 'sheet'
      ? `ברקודים - ${selected[0].title}.pdf`
      : mode === 'sheets' ? 'ברקודים - דף לכל ספר.pdf' : 'ברקודים - יריד ספרים.pdf'
    const scrambled = scrambleBytes(new Uint8Array(bytes))
    return NextResponse.json({
      name,
      contentType: 'application/pdf',
      size: bytes.length,
      enc: DOC_CIPHER_ID,
      data: Buffer.from(scrambled).toString('base64'),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'הפקת גיליון הברקודים נכשלה' }, { status: 500 })
  }
}
