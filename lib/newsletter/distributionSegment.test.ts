import { describe, it, expect } from 'vitest'
import { joinOne } from '../joinOne'

// ─────────────────────────────────────────────────────────────────────────────
// מסנני "חלוקת חגים" כמקור נמענים.
//
// 🔴 הסמנטיקה היא הדבר שחייב להיות נעול: ריבוי ערכים *באותה* קטגוריה הוא
// איחוד, ובין קטגוריות שונות זו הצטלבות — בדיוק כמו בצאצאים. טעות כאן
// אינה קורסת, היא שולחת מייל לקהל הלא נכון.
// ─────────────────────────────────────────────────────────────────────────────

interface Reg {
  center_id?: string | null
  approval_status?: string | null
  load_status?: string | null
  beneficiary?: { city?: string | null } | { city?: string | null }[] | null
}

/** אותה שרשרת סינון שרצה ב-resolveSegment. */
function applyFilters(list: Reg[], def: {
  distCenterState?: ('has_center' | 'no_center')[]
  distApproval?: string[]
  distLoadState?: ('loaded' | 'not_loaded')[]
  distCenterIds?: string[]
  distCity?: string[]
}): Reg[] {
  let out = list
  if (def.distCenterState?.length) {
    const has = def.distCenterState.includes('has_center')
    const no = def.distCenterState.includes('no_center')
    out = out.filter(r => (r.center_id ? has : no))
  }
  if (def.distApproval?.length) {
    const want = new Set(def.distApproval)
    out = out.filter(r => want.has(r.approval_status ?? 'pending'))
  }
  if (def.distLoadState?.length) {
    const loaded = def.distLoadState.includes('loaded')
    const not = def.distLoadState.includes('not_loaded')
    out = out.filter(r => (r.load_status === 'loaded' ? loaded : not))
  }
  if (def.distCenterIds?.length) {
    const want = new Set(def.distCenterIds)
    out = out.filter(r => r.center_id && want.has(r.center_id))
  }
  if (def.distCity?.length) {
    const want = new Set(def.distCity)
    out = out.filter(r => want.has((joinOne(r.beneficiary)?.city ?? '').trim()))
  }
  return out
}

const rows: Reg[] = [
  { center_id: 'c1', approval_status: 'approved', load_status: 'loaded',  beneficiary: { city: 'ירושלים' } },
  { center_id: 'c1', approval_status: 'pending',  load_status: null,      beneficiary: { city: 'ירושלים' } },
  { center_id: 'c2', approval_status: 'approved', load_status: null,      beneficiary: [{ city: 'בני ברק' }] },
  { center_id: null, approval_status: 'pending',  load_status: null,      beneficiary: { city: 'אלעד' } },
  { center_id: null, approval_status: 'rejected', load_status: null,      beneficiary: { city: 'בני ברק' } },
]

describe('בחירה מרובה באותה קטגוריה = איחוד', () => {
  it('בחרו מוקד או טרם בחרו — כולם', () => {
    expect(applyFilters(rows, { distCenterState: ['has_center', 'no_center'] })).toHaveLength(5)
  })

  it('רק מי שבחר מוקד', () => {
    expect(applyFilters(rows, { distCenterState: ['has_center'] })).toHaveLength(3)
  })

  it('רק מי שטרם בחר', () => {
    expect(applyFilters(rows, { distCenterState: ['no_center'] })).toHaveLength(2)
  })

  it('מאושר או ממתין — שתי הקבוצות יחד', () => {
    expect(applyFilters(rows, { distApproval: ['approved', 'pending'] })).toHaveLength(4)
  })
})

describe('בין קטגוריות שונות = הצטלבות', () => {
  it('בחר מוקד וגם מאושר', () => {
    const out = applyFilters(rows, { distCenterState: ['has_center'], distApproval: ['approved'] })
    expect(out).toHaveLength(2)
  })

  it('בחר מוקד וגם מאושר וגם טרם נטען', () => {
    const out = applyFilters(rows, {
      distCenterState: ['has_center'], distApproval: ['approved'], distLoadState: ['not_loaded'],
    })
    expect(out).toHaveLength(1)
    expect(out[0].center_id).toBe('c2')
  })

  it('צירוף שאין לו אף תואם מחזיר ריק ולא את הכול', () => {
    expect(applyFilters(rows, {
      distCenterState: ['no_center'], distLoadState: ['loaded'],
    })).toHaveLength(0)
  })
})

describe('בלי סימון = בלי סינון', () => {
  it('אין מסננים כלל — כל הנרשמים', () => {
    expect(applyFilters(rows, {})).toHaveLength(5)
  })

  it('מערך ריק אינו מסנן החוצה את כולם', () => {
    expect(applyFilters(rows, { distCenterState: [], distApproval: [] })).toHaveLength(5)
  })
})

describe('מוקד ועיר', () => {
  it('מוקד מסוים', () => {
    expect(applyFilters(rows, { distCenterIds: ['c1'] })).toHaveLength(2)
  })

  it('כמה מוקדים — איחוד', () => {
    expect(applyFilters(rows, { distCenterIds: ['c1', 'c2'] })).toHaveLength(3)
  })

  // 🔴 join שמוחזר כמערך — המלכודת שהסתירה את המוקדים מהטבלה
  it('עיר נקראת גם כשה-join הוחזר כמערך', () => {
    expect(applyFilters(rows, { distCity: ['בני ברק'] })).toHaveLength(2)
  })

  it('כמה ערים — איחוד', () => {
    expect(applyFilters(rows, { distCity: ['ירושלים', 'אלעד'] })).toHaveLength(3)
  })
})
