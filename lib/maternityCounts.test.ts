import { describe, it, expect } from 'vitest'
import { maternityCounts } from './maternityCounts'

// 🔴 הטסט שהיה תופס את התקלה: הדשבורד הציג "2 ממתינות לאישור מנהל"
// בזמן שמסך היולדות הציג 0, כי הוא ספר status='deep_review' גולמי בלי
// הכלל שמוריד תיק שממתין לתשובת היולדת.

type Row = Record<string, unknown>

/** לקוח Supabase מדומה — מחזיר שורות קבועות לכל טבלה. */
const db = (aids: Row[], msgs: Row[] = []) => ({
  from: (t: string) => ({
    select: () => ({
      in: async () => ({ data: t === 'maternity_aids' ? aids : msgs }),
    }),
  }),
})

const aid = (o: Partial<Row> & { id: string }): Row => ({
  status: 'pending', birth_type: null, baby_name_pending: false,
  beneficiary: { eligibility_status: 'approved' }, ...o,
})

const msg = (aid_id: string, direction: string, created_at = '2026-08-20T10:00:00Z') =>
  ({ aid_id, direction, created_at })

describe('🔴 המונה תואם לרשימה', () => {
  it('תיק בבדיקת מנהל שממתין לתשובת היולדת אינו נספר', async () => {
    // בדיוק המקרה מהשטח: 2 תיקים ב-deep_review, לשניהם נשלח בירור.
    const c = await maternityCounts(db(
      [aid({ id: 'a', status: 'deep_review' }), aid({ id: 'b', status: 'deep_review' })],
      [msg('a', 'staff'), msg('b', 'staff')],
    ))
    expect(c.deepReview).toBe(0)
  })

  it('תיק בבדיקת מנהל שהיולדת ענתה עליו — כן נספר', async () => {
    const c = await maternityCounts(db(
      [aid({ id: 'a', status: 'deep_review' })],
      [msg('a', 'staff', '2026-08-20T10:00:00Z'), msg('a', 'applicant', '2026-08-21T10:00:00Z')],
    ))
    expect(c.deepReview).toBe(1)
  })

  it('⚠️ אותו כלל חל על "ממתין לאישור"', async () => {
    const c = await maternityCounts(db(
      [aid({ id: 'a' }), aid({ id: 'b' })],
      [msg('a', 'staff')],
    ))
    expect(c.pending).toBe(1)
  })

  it('תיק שממתין לתיקון שם אינו נספר ב"ממתין לאישור"', async () => {
    // לשונית נפרדת — אחרת אותו תיק נספר פעמיים.
    const c = await maternityCounts(db([aid({ id: 'a', baby_name_pending: true })]))
    expect(c.pending).toBe(0)
  })

  it('תיק שממתין להשלמת מסמכים אינו נספר ב"ממתין לאישור"', async () => {
    const c = await maternityCounts(db([
      aid({ id: 'a', beneficiary: { eligibility_status: 'docs_pending' } }),
    ]))
    expect(c.pending).toBe(0)
  })
})

describe('⚠️ הרחגות', () => {
  it('לידה שקטה אינה נספרת', async () => {
    // מוצגת בלשונית נפרדת ומסוננת ממסך היולדות.
    const c = await maternityCounts(db([
      aid({ id: 'a', status: 'active', birth_type: 'silent' }),
      aid({ id: 'b', status: 'active' }),
    ]))
    expect(c.active).toBe(1)
  })

  it('כשל בשליפת הבירורים — כולם נספרים ולא מוסתרים', async () => {
    // מונה גבוה מדי מוביל לבדיקה; נמוך מדי מסתיר עבודה.
    const failing = {
      from: (t: string) => ({
        select: () => ({
          in: async () => {
            if (t === 'maternity_messages') throw new Error('נפל')
            return { data: [aid({ id: 'a', status: 'deep_review' })] }
          },
        }),
      }),
    }
    const c = await maternityCounts(failing)
    expect(c.deepReview).toBe(1)
  })

  it('אין תיקים — אפסים, בלי נפילה', async () => {
    const c = await maternityCounts(db([]))
    expect(c).toEqual({ pending: 0, deepReview: 0, active: 0 })
  })

  it('🔴 ההודעה האחרונה קובעת, לפי זמן ולא לפי סדר השליפה', async () => {
    // המסד עשוי להחזיר בכל סדר; הכלל חייב למיין בעצמו.
    const c = await maternityCounts(db(
      [aid({ id: 'a', status: 'deep_review' })],
      [msg('a', 'applicant', '2026-08-21T10:00:00Z'), msg('a', 'staff', '2026-08-19T10:00:00Z')],
    ))
    expect(c.deepReview).toBe(1)
  })
})
