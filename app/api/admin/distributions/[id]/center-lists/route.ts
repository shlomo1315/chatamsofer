import { NextResponse, type NextRequest } from 'next/server'
import { requireNonMailStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import {
  buildCenterListPdf, buildAllCentersPdf, buildSummaryPdf, centerListName,
  type CenterListInput,
} from '@/lib/centerListPdf'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// ─────────────────────────────────────────────────────────────────────────────
// רשימות איסוף למוקדים — PDF להדפסה.
//
// ?center=<id>  — מוקד יחיד
// ?all=1        — כל המוקדים בקובץ אחד (סיכום בפתיחה, כל מוקד בעמוד חדש)
// ?zip=1        — ZIP ובו קובץ נפרד לכל מוקד
// ?summary=1    — דף הסיכום בלבד
//
// ⚠️ requireNonMailStaff: הרשימות נושאות ת"ז, טלפון וכתובת מגורים של אלפי
// משפחות. חשבון mail_only אינו אמור לראות את מרשם המוטבים.
// ─────────────────────────────────────────────────────────────────────────────

interface Row {
  center_id: string | null
  beneficiary: {
    id_number: string | null; full_name: string | null
    family_name: string | null; spouse_name: string | null
    phone: string | null; address: string | null; city: string | null
  } | null | Array<{
    id_number: string | null; full_name: string | null
    family_name: string | null; spouse_name: string | null
    phone: string | null; address: string | null; city: string | null
  }>
}

// ⚠️ ניסוח השם ("כהן אברהם ושרה") יושב ב-lib/centerListPdf → centerListName
// ומכוסה בבדיקות. לא עותק מקומי, כדי שלא יסטה ממנו.

/** כתובת מלאה — הרחוב ואחריו העיר, כי הרשימה נמסרת גם למי שאינו מקומי. */
function fullAddress(b: { address?: string | null; city?: string | null }): string {
  return [b.address, b.city].filter(Boolean).join(', ').trim()
}

// ─────────────────────────────────────────────────────────────────────────────
// כותרת ההורדה.
//
// 🔴 שם ה-ASCII חייב להיות **קריא**, לא רצף קווים תחתונים.
//
// ⚠️ הכלל הישן החליף כל תו שאינו ASCII ב-'_', כך ש"אזור מאה שערים — תשרי.pdf"
// הפך ל-"_____ ___ ______ _ ____.pdf". חלק מהדפדפנים (ונטפרי בדרך) מעדיפים
// את filename= הפשוט על פני filename*=, ואז המשתמש מקבל קובץ בשם קווים.
//
// לכן: filename* נושא את השם העברי המלא, ו-filename נושא שם לועזי אמיתי
// שנבנה מהחלקים הלטיניים/הספרתיים בלבד — ואם לא נותר כלום, שם ברירת מחדל
// בעל משמעות.
// ─────────────────────────────────────────────────────────────────────────────
function asciiFallback(filename: string, fallback: string): string {
  const ext = filename.match(/\.[a-z0-9]+$/i)?.[0] ?? ''
  const base = filename.slice(0, filename.length - ext.length)
  const kept = base
    .replace(/[^\x20-\x7E]+/g, ' ')   // כל רצף לא-לטיני → רווח אחד
    .replace(/["\\/:*?<>|]+/g, '')    // תווים אסורים בשמות קבצים
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim()
  // ⚠️ נדרשות **אותיות**, לא רק תווים: שם עברי שמכיל שנה החזיר "2026.zip",
  // שם חסר משמעות שאינו אומר לאיזה קובץ הוא שייך. עדיף שם לועזי קבוע.
  return (/[A-Za-z]{2,}/.test(kept) ? kept : fallback) + ext
}

function attachmentHeader(filename: string, fallback: string): string {
  return `attachment; filename="${asciiFallback(filename, fallback)}"; `
    + `filename*=UTF-8''${encodeURIComponent(filename)}`
}

function pdfResponse(bytes: Uint8Array, filename: string, fallback: string) {
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': attachmentHeader(filename, fallback),
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await requireNonMailStaff())) return unauthorized()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { id } = await ctx.params
  const sp = request.nextUrl.searchParams

  const { data: dist } = await db.from('distributions')
    .select('name, year').eq('id', id).maybeSingle()
  const distName = [(dist as { name?: string } | null)?.name, (dist as { year?: string } | null)?.year]
    .filter(Boolean).join(' ') || 'חלוקה'

  // המוקדים הפתוחים בחלוקה
  const { data: openRows } = await db.from('holiday_center_openings')
    .select('center_id').eq('distribution_id', id)
  const openIds = (openRows ?? []).map(r => String((r as { center_id: string }).center_id))
  const { data: centerRows } = await db.from('holiday_centers')
    .select('id, name, city').in('id', openIds.length ? openIds : ['00000000-0000-0000-0000-000000000000'])
  const centers = (centerRows ?? []) as { id: string; name: string | null; city: string | null }[]

  // ⚠️ שליפה בדפים — אלפי שורות; .limit() לבדו נחתך ל-1000.
  const { rows, error } = await fetchAllRows<Row>((from, to) =>
    db.from('distribution_recipients')
      .select('center_id, beneficiary:beneficiaries(id_number, full_name, family_name, spouse_name, phone, address, city)')
      .eq('distribution_id', id).not('center_id', 'is', null).range(from, to))
  if (error) return NextResponse.json({ error }, { status: 500 })

  // ⚠️ join של Supabase מחזיר מערך או אובייקט לפי ההקשר.
  const byCenter = new Map<string, CenterListInput['rows']>()
  for (const r of rows) {
    if (!r.center_id) continue
    const b = Array.isArray(r.beneficiary) ? r.beneficiary[0] : r.beneficiary
    if (!b) continue
    const arr = byCenter.get(r.center_id) ?? []
    arr.push({
      idNumber: b.id_number, name: centerListName(b),
      phone: b.phone, address: fullAddress(b),
    })
    byCenter.set(r.center_id, arr)
  }

  const inputFor = (c: { id: string; name: string | null; city: string | null }): CenterListInput => ({
    centerName: c.name ?? 'מוקד',
    centerCity: c.city,
    distributionName: distName,
    rows: byCenter.get(c.id) ?? [],
  })

  // ── דף סיכום בלבד ──
  if (sp.get('summary') === '1') {
    const bytes = await buildSummaryPdf(distName, centers.map(c => ({
      centerName: c.name ?? 'מוקד', centerCity: c.city, count: (byCenter.get(c.id) ?? []).length,
    })))
    return pdfResponse(bytes, `סיכום כרטיסים — ${distName}.pdf`, 'summary')
  }

  // ── מוקד יחיד ──
  const centerId = sp.get('center')
  if (centerId) {
    const c = centers.find(x => x.id === centerId)
    if (!c) return NextResponse.json({ error: 'המוקד לא נמצא' }, { status: 404 })
    const bytes = await buildCenterListPdf(inputFor(c))
    return pdfResponse(bytes, `${c.name ?? 'מוקד'} — ${distName}.pdf`, 'center-list')
  }

  // ── ZIP: קובץ נפרד לכל מוקד ──
  if (sp.get('zip') === '1') {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    for (const c of centers) {
      const bytes = await buildCenterListPdf(inputFor(c))
      // ⚠️ תווים אסורים בשמות קבצים מוסרים — ZIP עם שם פגום אינו נפתח בחלונות.
      const safe = (c.name ?? 'מוקד').replace(/[\\/:*?"<>|]/g, '-')
      zip.file(`${safe}.pdf`, bytes)
    }
    // ⚠️ Buffer<ArrayBuffer> ולא Buffer<ArrayBufferLike>: BodyInit אינו מקבל
    // את השני. אותו שיקול בדיוק כמו ב-lib/fileAccess.
    const out = Buffer.from(await zip.generateAsync({ type: 'uint8array' })) as Buffer<ArrayBuffer>
    return new NextResponse(out, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': attachmentHeader(`רשימות מוקדים — ${distName}.zip`, 'center-lists'),
        'Cache-Control': 'no-store',
      },
    })
  }

  // ── כל המוקדים בקובץ אחד ──
  if (sp.get('all') === '1') {
    const bytes = await buildAllCentersPdf(distName, centers.map(inputFor))
    return pdfResponse(bytes, `רשימות מוקדים — ${distName}.pdf`, 'center-lists')
  }

  // ── ברירת מחדל: רשימת המוקדים לבורר שבמסך ──
  return NextResponse.json({
    distributionName: distName,
    centers: centers
      .map(c => ({ id: c.id, name: c.name, city: c.city, count: (byCenter.get(c.id) ?? []).length }))
      .sort((a, b) => b.count - a.count),
  })
}
