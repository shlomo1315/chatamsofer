import { describe, it, expect } from 'vitest'
import { buildLineageFixText } from './lineageFixText'

describe('buildLineageFixText', () => {
  it('כולל שם קודם, שם נכון, בן/חתן והערה', () => {
    const t = buildLineageFixText(
      [{ generation: 3, name: 'ישן' }],
      { 3: { name: ' חדש ', rel: 'חתן', note: 'מקור' } },
    )
    expect(t).toBe('דור 3: במקום "ישן" השם הנכון "חדש" (חתן) (מקור)')
  })
  it('דור חסר בלי שם קודם ובלי בן/חתן', () => {
    expect(buildLineageFixText([{ generation: 2 }], { 2: { name: 'א', rel: '', note: '' } })).toBe('דור 2: השם הנכון "א"')
  })
  it('שורה לכל דור', () => {
    const t = buildLineageFixText([{ generation: 1, name: 'x' }, { generation: 2 }], { 1: { name: 'y', rel: 'בן', note: '' }, 2: { name: 'z', rel: '', note: '' } })
    expect(t.split('\n')).toHaveLength(2)
  })
})
