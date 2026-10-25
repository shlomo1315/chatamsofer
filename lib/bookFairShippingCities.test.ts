import { describe, it, expect } from 'vitest'
import { shippingOrders, byCity, NO_CITY, type CityOrderInput } from './bookFairShippingCities'

const o = (id: string, city: string | null, shipping: number, extra: Partial<CityOrderInput> = {}): CityOrderInput => ({
  id, order_number: id, status: 'paid', channel: 'web', delivery_method: 'shipping', shipping_agorot: shipping, city_name: city, ...extra,
})

describe('דמי משלוח לפי עיר', () => {
  const orders = [
    o('1', 'בני ברק', 2000),
    o('2', 'בני ברק', 4500),                       // שילם 45 בסוף היריד
    o('3', 'ירושלים', 4000),                       // 14 כרכים: נגבה 40, מגיע 50
    o('4', 'ירושלים', 0, { channel: 'office', status: 'packed' }),
    o('5', 'ירושלים', 2000, { status: 'cancelled' }),
    o('6', 'ירושלים', 0, { delivery_method: 'pickup' }),
    o('7', null, 3000),
  ]
  const volumes = { '1': 3, '2': 10, '3': 14, '4': 0, '5': 2, '6': 2, '7': 6 }
  const rows = shippingOrders(orders, volumes)
  const { cities, total } = byCity(rows)
  const city = (n: string) => cities.find(c => c.city === n)!

  it('רק משלוחים ששולמו', () => {
    expect(rows.map(r => r.id).sort()).toEqual(['1', '2', '3', '4', '7'])
  })

  it('לפי התעריף המוסכם, ונגבה כפי שנשמר בהזמנה', () => {
    expect(city('בני ברק')).toMatchObject({ orders: 2, volumes: 13, expected: 7000, charged: 6500, diff: -500 })
    expect(city('ירושלים')).toMatchObject({ orders: 2, officeOrders: 1, volumes: 14, expected: 5000, charged: 4000, diff: -1000 })
    expect(city(NO_CITY)).toMatchObject({ orders: 1, expected: 3000 })
  })

  it('הסה"כ הוא סכום הערים', () => {
    const sum = (k: 'orders' | 'volumes' | 'expected' | 'charged') => cities.reduce((n, c) => n + c[k], 0)
    expect(total).toMatchObject({ orders: sum('orders'), volumes: sum('volumes'), expected: sum('expected'), charged: sum('charged') })
    expect(total.diff).toBe(total.charged - total.expected)
  })
})
