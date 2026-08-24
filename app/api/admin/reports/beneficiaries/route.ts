import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { buildXlsx, xlsxHeaders, todayStamp, type Column, type CellValue } from '@/lib/xlsx'
import {
  applyFilters, groupCounts,
  type ReportRow, type ReportFilters, type GroupBy,
} from '@/lib/reportFilters'

export const dynamic = 'force-dynamic'
// ⚠️ חובה. exceljs נשען על Buffer ועל zlib של Node ואינו רץ ב-Edge runtime.
export const runtime = 'nodejs'

// ─────────────────────────────────────────────────────────────────────────────
// דוח הצאצאים — שליפה מסוננת (GET) וייצוא לאקסל (POST).
//
// 🔒 הדוח מחזיר ת"ז, כתובות וטלפונים — הנתונים הרגישים ביותר במערכת.
// לכן requirePermission על מחלקת הצאצאים ולא requireStaff גורף, שמאשר
// כל תפקיד ואינו בודק מחלקה.
//
// ⚠️ אין middleware — הנתיב מגן על עצמו.
// ─────────────────────────────────────────────────────────────────────────────

type Raw = {
  id: string
  family_name: string | null
  full_name: string | null
  id_number: string | null
  city: string | null
  address: string | null
  phone: string | null
  email: string | null
  community_affiliation: string | null
  birth_date: string | null
  children_count: number | null
  marital_status: string | null
  eligibility_status: string | null
  lineage?: { generation: number | null } | { generation: number | null }[] | null
}

const STATUS_HE: Record<string, string> = {
  approved: 'מאושר', pending: 'ממתין', rejected: 'נדחה',
  docs_pending: 'השלמת מסמכים', docs_returned: 'הוחזר תיקון', review: 'בבדיקה',
}

async function loadRows(db: NonNullable<ReturnType<typeof getServiceClient>>) {
  // 🔴 fetchAllRows ולא select רגיל: 7,108 משפחות. .limit() *אינו* עוקף
  // את תקרת 1,000 השקטה — הדוח היה מחזיר 1,000 שורות, נראה תקין
  // לחלוטין, וכל מספרי הסיכום היו שגויים.
  // 🔴 שם המפתח הזר מצוין במפורש: על העמודה lineage_node_id קיימים
  // *שני* מפתחות זרים כפולים לאותה טבלה — beneficiaries_lineage_node_id_fkey
  // ו-fk_lineage_node (כפילות היסטורית). בלי ציון מפורש PostgREST מחזיר
  // "more than one relationship was found" והדוח יוצא ריק לגמרי.
  //
  // ⚠️ ה-select במחרוזת אחת ולא בשרשור: פיצול ל-'a' + 'b' מונע
  // מ-TypeScript לגזור את צורת השורה, וה-builder אינו מתאים ל-PageResult.
  return fetchAllRows<Raw>((from, to) => db
    .from('beneficiaries')
    .select('id, family_name, full_name, id_number, city, address, phone, email, community_affiliation, birth_date, children_count, marital_status, eligibility_status, lineage:lineage_nodes!beneficiaries_lineage_node_id_fkey(generation)')
    .range(from, to))
}

function toReportRow(r: Raw): ReportRow {
  // ⚠️ Supabase מחזיר יחסי join לעתים כמערך ולעתים כאובייקט — ראו
  // הדפוס ב-holiday-load. גישה ישירה ל-.generation החזירה undefined
  // בחצי מהמקרים, וכל המשפחות היו נראות בלי שיוך לדור.
  const lin = Array.isArray(r.lineage) ? r.lineage[0] : r.lineage
  return {
    id: r.id,
    familyName: r.family_name ?? '',
    fullName: r.full_name ?? '',
    idNumber: r.id_number,
    city: r.city,
    address: r.address,
    phone: r.phone,
    email: r.email,
    community: r.community_affiliation,
    generation: lin?.generation ?? null,
    birthDate: r.birth_date,
    childrenCount: r.children_count ?? 0,
    maritalStatus: r.marital_status,
    status: r.eligibility_status,
  }
}

function parseFilters(raw: string | null): ReportFilters {
  if (!raw) return {}
  try {
    const p = JSON.parse(raw)
    return typeof p === 'object' && p ? p as ReportFilters : {}
  } catch {
    return {}
  }
}

// GET — שורות מסוננות + ערכי הבוררים.
export async function GET(request: NextRequest) {
  if (!(await requirePermission('beneficiaries', 'view'))) {
    return forbidden('אין הרשאה לצפות בדוחות הצאצאים')
  }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { rows, error } = await loadRows(db)
  if (error) return NextResponse.json({ error }, { status: 500 })

  const all = rows.map(toReportRow)
  const filters = parseFilters(request.nextUrl.searchParams.get('filters'))
  const { rows: filtered, excluded } = applyFilters(all, filters)

  // ערכי הבוררים נגזרים מכל המאגר ולא מהתוצאה המסוננת — אחרת בחירת
  // עיר אחת הייתה מרוקנת את רשימת הערים ומונעת בחירה נוספת.
  const uniq = (v: (string | null)[]) =>
    [...new Set(v.map(x => (x ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'he'))

  return NextResponse.json({
    total: filtered.length,
    totalAll: all.length,
    excluded,
    // תצוגה מקדימה בלבד — הייצוא המלא עובר ב-POST.
    preview: filtered.slice(0, 50),
    options: {
      communities: uniq(all.map(r => r.community)),
      cities: uniq(all.map(r => r.city)),
      generations: [...new Set(all.map(r => r.generation).filter((g): g is number => g != null))].sort((a, b) => a - b),
      maritalStatuses: uniq(all.map(r => r.maritalStatus)),
      statuses: uniq(all.map(r => r.status)),
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// כל העמודות האפשריות בייצוא.
//
// ⚠️ תאריך כ-kind:'date' ולא כמחרוזת מפורמטת: תא-תאריך אמיתי ממוין
// כרונולוגית וניתן לסינון לפי טווח, בעוד "10/8/2026" ממוין אלפביתית
// ו-1 בינואר מופיע אחרי 9 בדצמבר.
// ⚠️ ת"ז וטלפון כ-kind:'id' ולא כמספר: אקסל מוחק אפסים מובילים ומציג
// ת"ז בת 8 ספרות וטלפון בלי ה-0.
const COLUMN_DEFS: Record<string, { col: Column; get: (r: ReportRow) => CellValue }> = {
  familyName:    { col: { header: 'שם משפחה', kind: 'text', width: 18 }, get: r => r.familyName },
  fullName:      { col: { header: 'שם פרטי', kind: 'text', width: 16 }, get: r => r.fullName },
  idNumber:      { col: { header: 'ת"ז', kind: 'id', width: 12 }, get: r => r.idNumber },
  community:     { col: { header: 'קהילה', kind: 'text', width: 18 }, get: r => r.community },
  generation:    { col: { header: 'דור', kind: 'number', width: 8 }, get: r => r.generation },
  city:          { col: { header: 'עיר', kind: 'text', width: 14 }, get: r => r.city },
  address:       { col: { header: 'כתובת', kind: 'text', width: 22 }, get: r => r.address },
  phone:         { col: { header: 'טלפון', kind: 'id', width: 13 }, get: r => r.phone },
  email:         { col: { header: 'אימייל', kind: 'text', width: 26 }, get: r => r.email },
  birthDate:     { col: { header: 'תאריך לידה', kind: 'date', width: 12 }, get: r => r.birthDate || null },
  childrenCount: { col: { header: 'מספר ילדים', kind: 'number', width: 11 }, get: r => r.childrenCount },
  maritalStatus: { col: { header: 'מצב משפחתי', kind: 'text', width: 13 }, get: r => r.maritalStatus },
  status:        { col: { header: 'סטטוס', kind: 'text', width: 13 }, get: r => STATUS_HE[r.status ?? ''] ?? r.status },
}

export const DEFAULT_COLUMNS = [
  'familyName', 'fullName', 'idNumber', 'community', 'generation',
  'city', 'address', 'phone', 'birthDate', 'childrenCount', 'maritalStatus',
]

// POST — ייצוא לאקסל.
export async function POST(request: NextRequest) {
  if (!(await requirePermission('beneficiaries', 'view'))) {
    return forbidden('אין הרשאה לייצא דוחות צאצאים')
  }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = (await request.json().catch(() => null)) as
    | { filters?: ReportFilters; columns?: string[]; groupBy?: GroupBy | null }
    | null

  const keys = (body?.columns?.length ? body.columns : DEFAULT_COLUMNS)
    .filter(k => k in COLUMN_DEFS)
  if (!keys.length) return NextResponse.json({ error: 'לא נבחרו עמודות' }, { status: 400 })

  const { rows, error } = await loadRows(db)
  if (error) return NextResponse.json({ error }, { status: 500 })

  const { rows: filtered } = applyFilters(rows.map(toReportRow), body?.filters ?? {})

  const detail = {
    name: 'צאצאים',
    columns: keys.map(k => COLUMN_DEFS[k].col),
    rows: filtered.map(r => keys.map(k => COLUMN_DEFS[k].get(r))),
  }

  // ⚠️ הסיכום והפירוט בקובץ אחד ולא בשתי הורדות: buildXlsx מקבל מערך
  // גיליונות, וכך המשתמש מקבל קובץ אחד עם שתי לשוניות.
  const sheets = [detail]
  if (body?.groupBy) {
    const label = body.groupBy === 'community' ? 'קהילה' : body.groupBy === 'city' ? 'עיר' : 'דור'
    sheets.unshift({
      name: `סיכום לפי ${label}`,
      columns: [
        { header: label, kind: 'text', width: 22 },
        { header: 'מספר משפחות', kind: 'number', width: 14 },
      ],
      rows: groupCounts(filtered, body.groupBy).map(g => [g.label, g.count]),
    })
  }

  const buf = await buildXlsx(sheets)
  return new NextResponse(new Uint8Array(buf), {
    headers: xlsxHeaders(`דוח-צאצאים-${todayStamp()}`),
  })
}
