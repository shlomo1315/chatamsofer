import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// שיחה מלאה לשלוחת היולדות מול מסד מדומה: יולדת שלא נוכה לה כרטיס מהמלאי
// לא מתבקשת להקיש מספר כרטיס, ולא משייכים לה כרטיס גם אם הקישה.
// ─────────────────────────────────────────────────────────────────────────────

const PHONE = '0527000000'
let aid: Record<string, unknown>
const updates: { table: string; values: unknown }[] = []
const inserts: { table: string; values: Record<string, unknown> }[] = []
const setMagneticCard = vi.fn()

function builder(table: string) {
  const rows = () => {
    if (table === 'beneficiaries') return [{ id: 'b1', family_name: 'כהן', spouse_name: 'שרה', full_name: null, id_number: '1', spouse_id_number: null, phone: PHONE, phone2: null, spouse_phone: null, nedarim_id: 'N1' }]
    if (table === 'maternity_aids') return [aid]
    return []
  }
  const b: Record<string, unknown> = {}
  for (const k of ['select', 'eq', 'or', 'order', 'limit']) b[k] = () => b
  b.update = (values: unknown) => { updates.push({ table, values }); return b }
  b.insert = (values: Record<string, unknown>) => { inserts.push({ table, values }); return b }
  b.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null })
  b.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok, bad)
  return b
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: builder, rpc: () => Promise.resolve({}) }) }))
vi.mock('@/lib/nedarim', () => ({
  getNedarimCreds: () => Promise.resolve({}),
  setMagneticCard: (...a: unknown[]) => setMagneticCard(...a),
  findClientByZeout: () => Promise.resolve(null),
  getClientCardFull: () => Promise.resolve(null),
}))
vi.mock('@/lib/yemotMaternityMessages', async (orig) => {
  const mod = await orig<typeof import('./yemotMaternityMessages')>()
  return { ...mod, getMaternityMessages: () => Promise.resolve(mod.defaultMessages()) }
})

const BLOCK_TEXT = 'עדיין לא הוקצה לך כרטיס נדרים'
const baseAid = { id: 'a1', birth_date: new Date().toISOString(), six_weeks_end: null, card_number: null, status: 'active', card_center_id: null }

async function call(extra: Record<string, string> = {}) {
  const { handleMaternityCall } = await import('@/app/api/webhooks/yemot-maternity/route')
  const res = await handleMaternityCall({ ApiToken: 'secret', ApiPhone: PHONE, ApiCallId: `c${Math.random()}`, ...extra })
  return res.text()
}

beforeEach(() => {
  process.env.YEMOT_WEBHOOK_SECRET = 'secret'
  updates.length = 0; inserts.length = 0; setMagneticCard.mockReset()
})

describe('שלוחת היולדות — חסימת שיוך למי שלא נוכה לה כרטיס', () => {
  it('ממתינה למלאי — שומעת שלא הוקצה כרטיס, ולא מתבקשת להקיש', async () => {
    aid = { ...baseAid, card_status: 'awaiting_stock', card_load_status: 'idle', card_tlush_id: null }
    const body = await call()
    expect(body).toContain(BLOCK_TEXT)
    expect(body).not.toContain('read=')
    expect(body).toContain('go_to_folder=hangup')
    expect(inserts.some((i) => i.values.action === 'yemot_card_not_allocated')).toBe(true)
  })

  it('אושרה בלי ניכוי (pending) — חסומה גם כשהקישה כרטיס ואישרה', async () => {
    aid = { ...baseAid, card_status: 'pending', card_load_status: 'idle', card_tlush_id: null }
    const body = await call({ collect_card: '7018265001295431', collect_confirm: '1' })
    expect(body).toContain(BLOCK_TEXT)
    expect(setMagneticCard).not.toHaveBeenCalled()
    expect(updates.filter((u) => u.table === 'maternity_aids')).toHaveLength(0)
  })

  it('נוכה כרטיס ונטען — מתבקשת להקיש מספר כרטיס', async () => {
    aid = { ...baseAid, card_status: 'loaded', card_load_status: 'loaded', card_tlush_id: 'T1' }
    const body = await call()
    expect(body).not.toContain(BLOCK_TEXT)
    expect(body).toContain('read=')
    expect(body).toContain('collect_card')
  })

  it('נוכה כרטיס — אישור הכרטיס משייך אותו בנדרים', async () => {
    aid = { ...baseAid, card_status: 'loaded', card_load_status: 'loaded', card_tlush_id: 'T1' }
    setMagneticCard.mockResolvedValue({ ok: true, message: '' })
    const body = await call({ collect_card: '7018265001295431', collect_confirm: '1' })
    expect(setMagneticCard).toHaveBeenCalledOnce()
    expect(body).not.toContain(BLOCK_TEXT)
  })
})
