import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { fetchAllRows } from '@/lib/fetchAllRows'

export const dynamic = 'force-dynamic'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function GET(request: NextRequest) {
  const parentId = request.nextUrl.searchParams.get('parent_id')
  const all = request.nextUrl.searchParams.get('all')
  const nodeId = request.nextUrl.searchParams.get('node_id')
  // ⚠️ include_pending הוסר. הפרמטר התקבל בעבר ופתח את הבורר גם לצמתים
  // שממתינים לאישור; כעת הוא מתעלם בשקט — קורא ישן שעדיין שולח אותו יקבל
  // מאושרים בלבד, וזו ההתנהגות הרצויה ולא כשל.

  const client = getClient()
  if (!client) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // node_id mode: return path from root to this node
  if (nodeId) {
    // ⚠️ שליפה בדפים — .limit() לבדו נחתך ל-1000 (db-max-rows), ואז המסלול
    // לצומת מעבר לשורה 1000 לא נמצא. ראו lib/fetchAllRows.
    const { rows: nodes } = await fetchAllRows<{ id: string; name: string; parent_id: string | null; generation: number }>((from, to) =>
      client.from('lineage_nodes').select('id,name,parent_id,generation').range(from, to),
    )
    const map = Object.fromEntries(nodes.map(n => [n.id, n]))

    // walk up from nodeId to root
    const path: { id: string; name: string; generation: number }[] = []
    let cur: { id: string; name: string; parent_id: string | null; generation: number } | undefined = map[nodeId]
    while (cur) {
      path.unshift({ id: cur.id, name: cur.name, generation: cur.generation })
      cur = cur.parent_id ? map[cur.parent_id] : undefined
    }
    return NextResponse.json({ path })
  }

  // ⚠️ מאושרים בלבד. הוצגו כאן לזמן קצר גם דורות שממתינים לאישור, כדי לצמצם
  // כפילויות (נרשם שאינו מוצא רשומה קיימת מזין אותה שוב) — אבל ההחלטה נסוגה:
  // סדר ייחוס אינו אמור להיבנות על רשומה שטרם נבדקה.
  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 רשימת עמודות מפורשת — לא select('*').
  //
  // ⚠️ הנתיב הזה **ציבורי לחלוטין** (בורר הדורות בטופס הרישום ובטופס נדרים
  // החיצוני). כאן ישב select('*'), ומיגרציה מאוחרת הוסיפה לטבלה עמודת
  // id_number — כך שת"ז אמיתיות (89 על צמתים מאושרים) נחשפו לכל מי שקרא
  // /api/lineage?all=1, בלי ששום שורת קוד השתנתה.
  //
  // 🔴 הכלל: select('*') בנתיב ציבורי חושף אוטומטית כל עמודה שתתווסף בעתיד.
  // בנתיב לא-מאומת חובה למנות את העמודות במפורש.
  // ─────────────────────────────────────────────────────────────────────────
  const PUBLIC_COLS = 'id, name, parent_id, generation, status, relation'

  let nodes: Record<string, unknown>[] = []
  if (all === '1') {
    // ⚠️ כל המאושרים — שליפה בדפים. .limit() לבדו נחתך ל-1000 בעץ גדול. ראו lib/fetchAllRows.
    const { rows, error } = await fetchAllRows<Record<string, unknown>>((from, to) =>
      client.from('lineage_nodes').select(PUBLIC_COLS).eq('status', 'verified').order('generation').order('name').range(from, to),
    )
    if (error) return NextResponse.json({ error }, { status: 500 })
    nodes = rows
  } else {
    // דור אחד בלבד (הורה נתון או שורשים) — קטן ממילא, שאילתה רגילה מספיקה.
    let query = client
      .from('lineage_nodes')
      .select(PUBLIC_COLS)
      .order('generation')
      .order('name')
    // ─────────────────────────────────────────────────────────────────────
    // 🔴 מאושרים בלבד — בכל המסלולים, כולל תיקון ייחוס.
    //
    // ⚠️ עד כה include_pending=1 הרחיב את הבורר גם לצמתים שממתינים לאישור,
    // כדי שמי שמגיע לדור 6 ומטה (שם פחות מ-1.5% מהעץ מאושר) לא ייתקע מול
    // רשימה ריקה. ההחלטה נסוגה: סדר ייחוס אינו נבנה על רשומה שטרם נבדקה,
    // גם לא כשלב ביניים — מה שנבחר מתוך רשימה נראה למשתמש כעובדה מאושרת.
    //
    // ⚠️ תופעת לוואי שנפתרת כאן: אותו שם הופיע פעמיים בדורות 3-4. כמעט כל
    // הכפילויות הן צמתים pending תחת הורים שונים, ולכן הן נעלמות מעצמן
    // ברגע שהרשימה מאושרים בלבד.
    //
    // 🔴 המחיר ידוע ומקובל: מי שהשרשרת שלו עוברת דרך צומת שטרם אושר לא
    // יוכל להשלים אותה מהבורר. זה מוסבר במסך, והפתרון הוא אישור הצומת
    // במרכז הבקרה — לא הצגתו כאילו אושר.
    // ─────────────────────────────────────────────────────────────────────
    query = query.eq('status', 'verified')
    query = parentId ? query.eq('parent_id', parentId) : query.is('parent_id', null)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    nodes = data ?? []
  }

  // ⚠️ במצב parent_id (רשימת הבחירה לדור הבא), מחזירים גם empty ואת מספר הדור
  // המבוקש בצורה מפורשת — כדי שצרכן חיצוני (טופס נדרים פלוס, UI עצמאי משלהם)
  // יוכל להבחין "דור קיים אך ריק מרשומות מאושרות" מכשל אחר, בלי לנחש
  // מתוך nodes.length לבד. הדור מחושב יחסית לשורש (0-based), כמו בטופס הציבורי.
  if (parentId) {
    let requestedGeneration: number | null = null
    const { data: parentNode } = await client
      .from('lineage_nodes')
      .select('generation')
      .eq('id', parentId)
      .maybeSingle()
    if (parentNode?.generation != null) {
      const { data: rootNode } = await client
        .from('lineage_nodes')
        .select('generation')
        .is('parent_id', null)
        .order('generation')
        .limit(1)
        .maybeSingle()
      const minGen = rootNode?.generation ?? 0
      requestedGeneration = Number(parentNode.generation) - Number(minGen) + 1
    }
    return NextResponse.json({ nodes, empty: nodes.length === 0, generation: requestedGeneration })
  }

  return NextResponse.json({ nodes })
}
