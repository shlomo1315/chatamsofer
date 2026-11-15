import { ProxyAgent, fetch as uf } from 'undici'
// איתור מחזיק כרטיס בנדרים לפי מזהה בקשת יולדות. קריאה בלבד, בלי שום כתיבה.
const base = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: key, Authorization: 'Bearer ' + key }
const sb = async path => { const r = await fetch(base + '/rest/v1/' + path, { headers: H }); const t = await r.text(); if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + t.slice(0, 200)); return JSON.parse(t) }
let mosad = process.env.NEDARIM_MOSAD_ID, pass = process.env.NEDARIM_API_PASSWORD
try { const s = await sb('app_settings?key=eq.nedarim_card&select=value'); const v = s[0] && JSON.parse(s[0].value); if (v?.mosadId && v?.apiPassword) { mosad = String(v.mosadId); pass = String(v.apiPassword) } } catch {}
const agent = new ProxyAgent(process.env.NEDARIM_PROXY_URL.trim())
const URL_ = 'https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const call = async (action, params = {}) => {
  const f = new URLSearchParams({ Action: action, MosadId: mosad, MosadNumber: mosad, ApiPassword: pass })
  for (const [k, v] of Object.entries(params)) f.set(k, String(v))
  const r = await uf(URL_, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: f.toString(), dispatcher: agent, signal: AbortSignal.timeout(30000) })
  const t = await r.text(); try { return JSON.parse(t) } catch { return { Result: 'Error', Message: t.trim() } }
}
const digits = v => String(v ?? '').replace(/\D/g, '')
const cardsOf = f => (Array.isArray(f?.Cards) ? f.Cards : []).filter(c => !c.RemovedDate)
const has = (f, card) => cardsOf(f).some(c => [c.MagneticCard, c.CardNumber].some(v => digits(v) === card))

const aid = process.argv[2]
const [a] = await sb('maternity_aids?id=eq.' + aid + '&select=id,card_number,beneficiary:beneficiaries(family_name,spouse_name,nedarim_id)')
const b = Array.isArray(a.beneficiary) ? a.beneficiary[0] : a.beneficiary
const card = digits(a.card_number)
const out = { card, own: { name: [b?.family_name, b?.spouse_name].filter(Boolean).join(' '), nedarimId: b?.nedarim_id ?? null }, holders: [] }
const t = await call('GetClient_Table')
const table = Array.isArray(t.data) ? t.data : []
out.tableRows = table.length
out.tableKeys = Object.keys(table[0] || {})
const inRow = r => Object.values(r).some(v => (typeof v === 'string' || typeof v === 'number') && digits(v) === card)
for (const r of table.filter(inRow)) out.holders.push({ via: 'table', row: r })
if (!out.holders.length) {
  out.scanned = 0
  for (const r of table) {
    try {
      const f = await call('GetClientCard', { ClientId: r.ClientId })
      out.scanned++
      if (has(f, card)) out.holders.push({ via: 'card', row: r })
    } catch {}
    await sleep(150)
  }
}
console.log('LOOKUP ' + JSON.stringify(out))
