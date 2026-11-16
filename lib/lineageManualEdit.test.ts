import { describe, it, expect } from 'vitest'
import { pickEditable } from '@/app/api/admin/beneficiaries/update/route'
import { displayChain } from './lineageDisplayChain'

describe('הוספת אבות ידנית מעריכת הכרטסת', () => {
  it('lineage_manual עובר את סינון השדות המותרים', () => {
    expect(pickEditable({ lineage_manual: ['רבי א', 'רבי ב'], id: 'x' })).toEqual({ lineage_manual: ['רבי א', 'רבי ב'] })
  })
  it('אבות ידניים מוצגים אחרי הדור האחרון בעץ', () => {
    const saved = [{ generation: 1, name: 'א' }, { generation: 2, name: 'ב' }, { generation: 3, name: 'ג' }]
    const names = displayChain(saved, null, ['ד']).map(c => (typeof c === 'string' ? c : (c as { name: string }).name))
    expect(names.at(-1)).toBe('ד')
  })
})
