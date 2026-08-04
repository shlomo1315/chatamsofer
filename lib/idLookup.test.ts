import { describe, it, expect } from 'vitest'
import { idVariants, idOrFilter, sameId, digitsOnly } from './idLookup'

describe('digitsOnly', () => {
  it('מסיר מקפים רווחים וריק', () => {
    expect(digitsOnly('012-345-678')).toBe('012345678')
    expect(digitsOnly(' 12345678 ')).toBe('12345678')
    expect(digitsOnly(null)).toBe('')
  })
})

describe('idVariants', () => {
  it('מחזיר את הצורה שהוקשה וגם בלי האפס המוביל', () => {
    // ⚠️ זה המקרה שחסם משפחות: המתקשר מקיש 9 ספרות, ובמאגר נשמרו 8
    expect(idVariants('012345678')).toEqual(['012345678', '12345678'])
  })

  it('מוסיף ריפוד ל-9 כשהוקשו פחות', () => {
    expect(idVariants('12345678')).toEqual(['12345678', '012345678'])
  })

  it('אינו מכפיל כשאין מה להוסיף', () => {
    expect(idVariants('123456789')).toEqual(['123456789'])
  })

  it('מתעלם מתווים שאינם ספרות', () => {
    expect(idVariants('12-345-678')).toEqual(['12345678', '012345678'])
  })

  it('מחזיר ריק לקלט ריק', () => {
    expect(idVariants('')).toEqual([])
    expect(idVariants(undefined)).toEqual([])
    expect(idVariants('אבג')).toEqual([])
  })

  it('אינו מרפד מספר ארוך מדי', () => {
    expect(idVariants('1234567890')).toEqual(['1234567890'])
  })
})

describe('idOrFilter', () => {
  it('בונה תנאי or לכל עמודה ולכל גרסה', () => {
    expect(idOrFilter('012345678', ['id_number', 'spouse_id_number'])).toBe(
      'id_number.eq.012345678,id_number.eq.12345678,' +
      'spouse_id_number.eq.012345678,spouse_id_number.eq.12345678',
    )
  })

  it('מחזיר ריק כשאין מה לחפש — כדי שהקורא לא ישלח סינון ריק למסד', () => {
    expect(idOrFilter('', ['id_number'])).toBe('')
    expect(idOrFilter('123456789', [])).toBe('')
  })

  it('מייצר ספרות בלבד — בלי תווים שדורשים בריחה בתחביר or', () => {
    const f = idOrFilter('12-34/56 78', ['id_number'])
    expect(f).not.toMatch(/[^a-z_.,0-9]/)
  })
})

describe('sameId', () => {
  it('מזהה זהות בהתעלם מאפסים מובילים ומפורמט', () => {
    expect(sameId('012345678', '12345678')).toBe(true)
    expect(sameId('012-345-678', '12345678')).toBe(true)
  })
  it('אינו מזהה מספרים שונים, ולא ריק כשווה לריק', () => {
    expect(sameId('123456789', '123456780')).toBe(false)
    expect(sameId('', '')).toBe(false)
  })
})
