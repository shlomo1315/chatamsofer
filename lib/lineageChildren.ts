// שליפת צאצאים ישירים מעץ הדורות בפורמט של טופס נדרים ({ nodeId, name, relation }).
// משותף ל-nedarim-form/lineage-children ו-lineage-roots. מחזיר אך ורק שמות
// מעץ הדורות (מידע היסטורי מאומת) — לא נתוני מוטבים.
import { createClient } from '@supabase/supabase-js'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

interface LineageRow { id: string; name: string; relation: string | null }

export interface LineageChild { nodeId: string; name: string; relation: string | null }

export interface LineageChildrenResult {
  children: LineageChild[]
  /**
   * העץ המאושר נגמר כאן — אך קיימים צאצאים שטרם אושרו.
   *
   * 🔴 בלי השדה הזה `children: []` היה דו-משמעי: גם עלה אמיתי בסוף
   * השושלת וגם צומת עם מאות צאצאים שכולם ממתינים לאישור נראים זהים.
   * התיעוד מנחה את הטופס "המשך עד children:[]", ולכן הבורר פשוט נעצר —
   * זו הייתה התקיעה אחרי הדור הראשון.
   *
   * ⚠️ השמות עצמם *אינם* נחשפים. הצגת דורות ממתינים נשללה במכוון
   * (ראו app/api/lineage): סדר ייחוס אינו נבנה על רשומה שטרם נבדקה.
   * כאן נמסרת רק *עובדת קיומו* של המשך — שהיא מה שהטופס צריך כדי
   * לפתוח הזנה ידנית (lineage_new_nodes) במקום להיתקע.
   */
  hasPending: boolean
}

// parentId=null → השורש (parent_id is null); אחרת ילדי הצומת. status=verified בלבד.
export async function fetchLineageChildren(
  parentId: string | null,
): Promise<LineageChildrenResult | { error: string }> {
  const client = getClient()
  if (!client) return { error: 'שגיאת שרת' }

  let query = client
    .from('lineage_nodes')
    .select('id,name,relation')
    .eq('status', 'verified')
    .order('generation')
    .order('name')

  query = parentId ? query.eq('parent_id', parentId) : query.is('parent_id', null)

  const { data, error } = await query
  if (error) return { error: error.message }

  const children = (data as LineageRow[] ?? []).map((n) => ({
    nodeId: n.id,
    name: n.name,
    relation: n.relation ?? null,
  }))

  // ⚠️ נבדק רק כשאין ילדים מאושרים: זו השאלה היחידה שבה התשובה משנה
  // התנהגות, ואין טעם בשאילתה נוספת כשהבורר ממילא ממשיך לדור הבא.
  let hasPending = false
  if (children.length === 0 && parentId) {
    const { data: pending } = await client
      .from('lineage_nodes')
      .select('id')
      .eq('parent_id', parentId)
      .eq('status', 'pending')
      .limit(1)
    hasPending = (pending?.length ?? 0) > 0
  }

  return { children, hasPending }
}
