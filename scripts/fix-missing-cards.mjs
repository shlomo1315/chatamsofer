import { ProxyAgent, fetch as uf } from 'undici'
// שיוך וסריקת כרטיסים חסרים בנדרים. ברירת מחדל: קריאה בלבד. תיקון רק עם --fix.
const FIX = process.argv.includes('--fix')
const base = (process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/$/, '')
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }
const sb = async (path, init = {}) => { const r = await fetch(base + '/rest/v1/' + path, { ...init, headers: { ...H, ...(init.headers || {}) } }); const t = await r.text(); if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + t.slice(0, 200)); return t ? JSON.parse(t) : null }
let mosad = process.env.NEDARIM_MOSAD_ID, pass = process.env.NEDARIM_API_PASSWORD
try { const s = await sb('app_settings?key=eq.nedarim_card&select=value'); const v = s[0] && JSON.parse(s[0].value); if (v?.mosadId && v?.apiPassword) { mosad = String(v.mosadId); pass = String(v.apiPassword) } } catch {}
const agent = new ProxyAgent(process.env.NEDARIM_PROXY_URL.trim())
const URL_ = 'https://www.matara.pro/nedarimplus/Mechubad/Reports/ManageReports.aspx'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const call = async (action, params = {}) => {
  const f = new URLSearchParams({ Action: action, MosadId: mosad, MosadNumber: mosad, ApiPassword: pass })
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') f.set(k, String(v))
  const r = await uf(URL_, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: f.toString(), dispatcher: agent, signal: AbortSignal.timeout(30000) })
  const t = await r.text(); try { return JSON.parse(t) } catch { return { Result: /^ok/i.test(t.trim()) ? 'OK' : 'Error', Message: t.trim() } }
}
const digits = v => String(v ?? '').replace(/\D/g, '')
const norm = v => { const s = String(v ?? '').trim(); if (!s) return ''; if (/[^\d\s-]/.test(s)) return s.replace(/[\s-]/g, '').toUpperCase(); const d = s.replace(/\D/g, ''); return d ? d.padStart(9, '0') : '' }
const has = (full, card) => (Array.isArray(full?.Cards) ? full.Cards : []).filter(c => !c.RemovedDate).some(c => [c.MagneticCard, c.CardNumber].some(v => digits(v) === card))
const ok = r => String(r?.Result ?? '').toUpperCase() === 'OK'
const cardOf = async id => { const r = await call('GetClientCard', { ClientId: id }); return ok(r) ? r : null }
const rows = await sb('maternity_aids?select=id,card_number,status,beneficiary:beneficiaries(id,id_number,spouse_id_number,family_name,spouse_name,nedarim_id)&card_number=not.is.null&order=created_at.asc&limit=1000')
const R = { checked: 0, missing: 0, fixed: [], manual: [], ok: 0 }
let table = null
for (const a of rows) {
  const b = Array.isArray(a.beneficiary) ? a.beneficiary[0] : a.beneficiary
  const card = digits(a.card_number); R.checked++
  const name = [b?.family_name, b?.spouse_name].filter(Boolean).join(' ')
  const l4 = card.slice(-4)
  let full = null
  if (b?.nedarim_id) { try { full = await cardOf(String(b.nedarim_id)) } catch {} ; await sleep(250) }
  if (full && has(full, card)) { R.ok++; continue }
  R.missing++
  if (!FIX) { R.manual.push({ name, l4, aid: a.id, reason: 'חסר (סריקה בלבד)' }); continue }
  try {
    if (!table) { const t = await call('GetClient_Table'); table = Array.isArray(t.data) ? t.data : [] }
    let target = null
    for (const z of [b?.id_number, b?.spouse_id_number].filter(Boolean)) {
      const w = norm(z); const m = table.find(row => Object.entries(row).some(([k, v]) => /zeout|tz\b|teudat|tsad3/i.test(k) && norm(v) === w))
      if (m) { target = String(m.ClientId); break }
    }
    if (!target) { R.manual.push({ name, l4, aid: a.id, reason: 'לא נמצא לקוח לפי ת"ז' }); continue }
    const before = b.nedarim_id ? String(b.nedarim_id) : null
    const r = await call('SetClientMagneticCard', { ClientId: target, MagneticCard: card, Remove: '0' })
    await sleep(250)
    const ver = has(await cardOf(target), card)
    if (!ver) { R.manual.push({ name, l4, aid: a.id, reason: 'לא מופיע אחרי שיוך (תפוס?): ' + String(r.Message ?? '').slice(0, 120) }); continue }
    if (target !== before) await sb('beneficiaries?id=eq.' + b.id, { method: 'PATCH', body: JSON.stringify({ nedarim_id: target }) })
    await sb('maternity_aids?id=eq.' + a.id, { method: 'PATCH', body: JSON.stringify({ card_load_error: null }) })
    await sb('activity_log', { method: 'POST', body: JSON.stringify({ action: 'maternity_card_relinked', entity_type: 'maternity_aid', entity_id: a.id, details: { old_nedarim_id: before, new_nedarim_id: target, card_last4: l4, via: 'ecs-one-off' } }) })
    R.fixed.push({ name, l4, aid: a.id, moved: target !== before })
  } catch (e) { R.manual.push({ name, l4, aid: a.id, reason: 'שגיאה: ' + String(e.message).slice(0, 120) }) }
}
console.log('REPORT ' + JSON.stringify(R))
