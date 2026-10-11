import { describe, it, expect, vi, beforeEach } from 'vitest'

// 🔴 הבאג: בורר הדורות בטופס נדרים נעצר אחרי הדור הראשון.
//
// עץ הדורות מכיל 10,171 צמתים ב-'pending' מול 353 ב-'verified'. הצגת
// ממתינים נשללה במכוון (ראו app/api/lineage) — סדר ייחוס לא נבנה על
// רשומה שטרם נבדקה. זו החלטת מדיניות ולא באג.
//
// הבאג הוא בחוזה: הצרכן מקבל children:[] גם כשהצומת הוא באמת עלה
// וגם כשיש לו 651 ילדים שכולם ממתינים. שני המצבים נראים זהים, והתיעוד
// אומר לנדרים "המשך עד children:[]" — ולכן הטופס פשוט נעצר, בלי לפתוח
// את מסלול ההזנה הידנית (lineage_new_nodes) שנועד בדיוק למצב הזה.
//
// התיקון: להחזיר גם hasPending — "כאן העץ המאושר נגמר, אבל יש המשך
// שטרם אושר" — כדי שהטופס יידע לפתוח הזנה ידנית במקום להיתקע.

let refRows: { key: string; name: string; generation: number; parent_key: string | null }[] = []

const rows: Record<string, { id: string; name: string; relation: string | null; status: string; parent_id: string | null; generation?: number }[]> = {
  root: [
    { id: 'g2-a', name: 'רבי אברהם שמואל בנימין', relation: 'son', status: 'verified', parent_id: null },
  ],
  // צומת עם המשך שכולו ממתין — נראה כיום כעלה סופי.
  'has-pending-only': [
    { id: 'p1', name: 'ממתין א', relation: 'son', status: 'pending', parent_id: 'has-pending-only' },
    { id: 'p2', name: 'ממתין ב', relation: 'son', status: 'pending', parent_id: 'has-pending-only' },
  ],
  // עלה אמיתי — אין לו ילדים כלל.
  'real-leaf': [],
  // 🔴 מסומן verified אך בקובץ המאושר הוא בדור 5 (נכד שהוצג כבן) — 11.10.
  'wrong-gen': [
    { id: 'w1', name: 'מרת רויזא גולדשטיין', relation: null, status: 'verified', parent_id: 'wrong-gen', generation: 3 },
  ],
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const state: { parent: string | null; status?: string } = { parent: null }
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      // ריק כברירת מחדל ⇒ הבודק מתירני; הבדיקה האחרונה ממלאת אותו.
      if (table === 'lineage_approved_ref') {
        return { select: () => Promise.resolve({ data: refRows, error: null }) }
      }
      Object.assign(builder, {
        select: chain,
        order: chain,
        limit: chain,
        maybeSingle: () => Promise.resolve({ data: { name: 'הורה' }, error: null }),
        eq: (col: string, val: string) => {
          if (col === 'status') state.status = val
          if (col === 'parent_id') state.parent = val
          return builder
        },
        is: (col: string) => { if (col === 'parent_id') state.parent = 'root'; return builder },
        then: (resolve: (r: unknown) => void) => {
          const all = rows[state.parent ?? 'root'] ?? []
          const data = state.status ? all.filter(r => r.status === state.status) : all
          return Promise.resolve({ data, error: null }).then(resolve)
        },
      })
      return builder
    },
  }),
}))

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
})

describe('fetchLineageChildren — הבחנה בין עלה אמיתי להמשך ממתין', () => {
  it('מחזיר את הילדים המאושרים', async () => {
    const { fetchLineageChildren } = await import('./lineageChildren')
    const r = await fetchLineageChildren(null)
    expect('children' in r && r.children.length).toBe(1)
  })

  it('עלה אמיתי — children ריק ו-hasPending=false', async () => {
    const { fetchLineageChildren } = await import('./lineageChildren')
    const r = await fetchLineageChildren('real-leaf')
    if ('error' in r) throw new Error(r.error)
    expect(r.children).toEqual([])
    expect(r.hasPending).toBe(false)
  })

  it('🔴 צומת שכל ילדיו ממתינים — children ריק אך hasPending=true', async () => {
    const { fetchLineageChildren } = await import('./lineageChildren')
    const r = await fetchLineageChildren('has-pending-only')
    if ('error' in r) throw new Error(r.error)
    // הממתינים לא נחשפים — שמות שטרם נבדקו לא יוצאים החוצה.
    expect(r.children).toEqual([])
    // אבל הטופס כן צריך לדעת שיש כאן המשך, כדי לפתוח הזנה ידנית.
    expect(r.hasPending).toBe(true)
  })

  it('אינו חושף שמות של צמתים ממתינים', async () => {
    const { fetchLineageChildren } = await import('./lineageChildren')
    const r = await fetchLineageChildren('has-pending-only')
    if ('error' in r) throw new Error(r.error)
    expect(JSON.stringify(r)).not.toContain('ממתין')
  })

  it('🔴 מסומן מאושר אך בדור שגוי בקובץ — מוסתר, ו-hasPending=true (הזנה ידנית)', async () => {
    refRows = [{ key: 'ג', name: 'מרת רויזא גולדשטיין', generation: 5, parent_key: null }]
    vi.resetModules()
    const { fetchLineageChildren } = await import('./lineageChildren')
    const r = await fetchLineageChildren('wrong-gen')
    if ('error' in r) throw new Error(r.error)
    expect(r.children).toEqual([])
    expect(r.hasPending).toBe(true)
  })
})
