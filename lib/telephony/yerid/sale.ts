// שיחת יריד הספרים בטכנוליין: הזמנה, מעקב הזמנות, פנייה מוקלטת, משלוח/איסוף ותשלום בכרטיס.
// אותה זרימה בדיוק כמו בימות (lib/bookFairYemotIvr), עם מקור נתונים ונוסחים נפרדים לגמרי.
// 🔴 אין כאן שום קריאה לימות: הקלטות יורדות מטכנוליין במפתח של מערכת היריד בלבד.
import { getServiceClient } from '@/lib/apiAuth'
import { getBookFairMessages, TECHNOLINE_YERID_MSG_KEY } from '@/lib/yemotBookFairMessages'
import {
  addressVarBase, attemptVarName, confirmVarBase, initialState, msgToken, nameVarBase, nextTurn, seasonClosedTurn,
  type IvrInput,
} from '@/lib/bookFairYemotIvr'
import { totalVolumes } from '@/lib/bookFairShipping'
import { goodbye } from '../modules'
import type { TlHandler, TlParams, TlResponse } from '../types'
import { cleanParams, yemotToTl } from './yemotToTl'
import {
  createOrder, deleteSession, finalizeOrder, findBook, findBookById, findCity, listBooks, listCategories, listCities,
  listMyOrders, loadSession, pickupAvailable, reserveLastItem, reserveLastPreview, saveInquiry, saveSession,
  shippingFor, stashRecording, volumesByBook, yeridCallId, yeridTerminal, type TlIvrState, type TlRecording,
} from './saleData'

const PLACEHOLDER = '__CREDIT_CARD_PLACEHOLDER__'
const PAY_VAR = 'bf_pay'
const NEDARIM_CATEGORY = 'צאצאי מרן החתם סופר'

function paramFor(p: TlParams, base: string): string {
  for (let attempt = 0; attempt < 3; attempt++) {
    const v = p[attemptVarName(base, attempt)]
    if (v) return v
  }
  return ''
}

/** ההקלטה האחרונה בשם נתון: מזהה הקובץ, הנתיב והתמלול של טכנוליין. */
function recordingOf(p: TlParams, base: string): TlRecording {
  for (let attempt = 0; attempt < 3; attempt++) {
    const name = attemptVarName(base, attempt)
    const rec = { fileId: p[`FILEID_${name}`] || undefined, path: p[`PATH_${name}`] || p[name] || undefined, text: p[`TEXT_${name}`] || undefined }
    if (rec.fileId || rec.path || rec.text) return rec
  }
  return {}
}

/** הסכום בשקלים (2 ספרות), מהפריטים והמשלוח. */
export function totalShekels(state: TlIvrState): number {
  const agorot = state.items.reduce((s, i) => s + i.price_agorot * i.quantity, 0) + (state.shipping_agorot ?? 0)
  return Math.round(agorot) / 100
}

export function paymentModule(state: TlIvrState, seq: number, intro: TlResponse[]): TlResponse[] {
  return [
    ...intro,
    {
      type: 'creditCard', name: `${PAY_VAR}_q${seq}`, sum: totalShekels(state), sumChangeable: 'no',
      cvv: 'yes', tz: 'no', payments: 1, terminal: yeridTerminal(), category: NEDARIM_CATEGORY, post: true,
    },
  ]
}

export const isPaid = (code: string) => code === '000' || code.toUpperCase() === 'OK'

async function gates(supa: NonNullable<ReturnType<typeof getServiceClient>>) {
  const read = (key: string) => supa.from('app_settings').select('value').eq('key', key).maybeSingle()
  const [{ data: gate }, { data: phoneGate }, { data: season }] = await Promise.all([
    read('book_fair_open'), read('book_fair_phone_open'), read('book_fair_season_closed'),
  ])
  const seasonClosed = String(season?.value ?? '') === 'true'
  const open = String(gate?.value ?? '') === 'true' || String(phoneGate?.value ?? '') === 'true'
  return { seasonClosed, open }
}

export const yeridSale: TlHandler = async (ctx) => {
  if (!ctx.callId) return goodbye('שגיאה בזיהוי השיחה. נסו שוב מאוחר יותר')
  const supa = getServiceClient()
  if (!supa) return goodbye('שגיאת שרת. נסו שוב מאוחר יותר')
  const callId = yeridCallId(ctx.callId)
  const phone = ctx.phone

  const [messages, { seasonClosed, open }, session] = await Promise.all([
    getBookFairMessages(TECHNOLINE_YERID_MSG_KEY), gates(supa), loadSession(callId, phone),
  ])
  const state: TlIvrState = session.state ?? initialState()
  const seq = state.tl_seq ?? 0
  const next = seq + 1
  const p = cleanParams(ctx.params, seq)
  const reply = (response: string) => yemotToTl(response, next)

  if (seasonClosed && state.step !== 'record_inquiry') {
    const turn = seasonClosedTurn(state, { value: paramFor(p, 'bf_sc') }, messages)
    if (turn.state.step === 'done') await deleteSession(callId)
    else await saveSession(session.id, { ...turn.state, tl_seq: next })
    return reply(turn.response)
  }
  if (!open && !seasonClosed) return reply(`id_list_message=${msgToken(messages, 'closed')}&go_to_folder=hangup`)

  const input: IvrInput = {}
  switch (state.step) {
    case 'main_menu': {
      input.value = paramFor(p, 'bf_main') || paramFor(p, 'bf_main_r')
      if (input.value === '2') input.myOrders = await listMyOrders(phone)
      if (input.value === '1') input.categories = await listCategories()
      break
    }
    case 'order_menu': {
      input.value = paramFor(p, 'bf_omenu')
      if (input.value === '2') input.categories = await listCategories()
      if (input.value === '3') input.browseBooks = await listBooks(null)
      break
    }
    case 'category_menu': {
      input.value = paramFor(p, 'bf_cat')
      input.categories = await listCategories()
      const idx = Number(input.value) - 1
      if (Number.isInteger(idx) && idx >= 0 && idx < input.categories.length) {
        input.browseBooks = await listBooks(input.categories[idx])
      }
      break
    }
    case 'browse': {
      input.value = paramFor(p, `bf_br${state.browse_index ?? 0}`)
      input.browseBooks = await listBooks(state.browse_category ?? null)
      if (state.browse_category) input.categories = await listCategories()
      break
    }
    case 'confirm_book': {
      input.value = paramFor(p, 'bf_cbook')
      if (state.pending_book_id) input.book = await findBookById(state.pending_book_id)
      if (state.browse_category !== undefined) input.browseBooks = await listBooks(state.browse_category ?? null)
      break
    }
    case 'record_inquiry': {
      const rec = recordingOf(p, 'bf_inq')
      input.recording = rec.fileId || rec.path
      input.transcript = rec.text
      if (input.recording) input.inquirySaved = await saveInquiry(phone, rec, callId)
      break
    }
    case 'ask_sku': {
      const skuBase = state.items.length ? `bf_sku_next${state.items.length}` : 'bf_sku'
      const raw = p[`${skuBase}_r${state.sku_round ?? 1}`] || paramFor(p, skuBase)
      if (raw) {
        input.value = raw
        input.book = await findBook(raw)
      }
      break
    }
    case 'ask_qty': {
      const raw = paramFor(p, `bf_qty${state.items.length}`) || paramFor(p, 'bf_qty')
      if (raw) {
        input.value = raw
        input.book = state.pending_book_id ? await findBookById(state.pending_book_id) : null
        if (input.book && Number.isInteger(Number(raw)) && Number(raw) > 0) {
          input.reserved = await reserveLastPreview(state, input.book, Number(raw))
        }
      }
      break
    }
    case 'ask_more': {
      input.value = paramFor(p, `bf_more${state.items.length}`)
      if (input.value === '1' && state.browse_category !== undefined) input.browseBooks = await listBooks(state.browse_category ?? null)
      break
    }
    case 'ask_delivery': {
      input.value = paramFor(p, 'bf_deliv')
      if (input.value === '1' && !(await pickupAvailable())) input.value = '2'
      if (input.value === '2') input.cityList = await listCities()
      break
    }
    case 'ask_city': {
      input.cityList = await listCities()
      const raw = paramFor(p, 'bf_city')
      if (raw) {
        input.value = raw
        const city = await findCity(raw)
        input.city = city
        if (city) {
          const vols = await volumesByBook(state.items.map((i) => i.book_id))
          const volumes = totalVolumes(state.items.map((i) => ({ volumes: vols.get(i.book_id) ?? 1, quantity: i.quantity })))
          input.shipping_agorot = await shippingFor(volumes)
        }
      }
      break
    }
    case 'record_address': {
      const rec = recordingOf(p, addressVarBase(state.addr_take ?? 0))
      input.recording = rec.fileId || rec.path
      input.transcript = rec.text
      input.heard = await stashRecording(callId, 'address', rec)
      break
    }
    case 'confirm_address': {
      input.value = paramFor(p, confirmVarBase('addr', state.addr_take ?? 0))
      break
    }
    case 'ask_name': {
      const rec = recordingOf(p, nameVarBase(state.name_take ?? 0))
      input.recording = rec.fileId || rec.path
      input.transcript = rec.text
      input.heard = await stashRecording(callId, 'name', rec)
      break
    }
    case 'confirm_name': {
      input.value = paramFor(p, confirmVarBase('name', state.name_take ?? 0))
      break
    }
    case 'confirm_total': {
      input.value = paramFor(p, 'bf_conf')
      break
    }
    case 'payment': {
      // תוצאת הסליקה נקראת גולמית: ERROR כאן הוא כישלון, לא "לא הוקש".
      const code = (ctx.params[`${PAY_VAR}_q${seq}`] ?? '').trim()
      if (!code) console.warn(`[tl-yerid] אין תוצאת סליקה. call=${callId}`)
      input.payment = code ? (isPaid(code) ? 'success' : 'failed') : undefined
      break
    }
  }

  let turn = nextTurn(state, input, messages)
  if (turn.state.step === 'ask_delivery' && !(await pickupAvailable())) {
    turn = nextTurn(turn.state, { value: '2', cityList: await listCities() }, messages)
  }
  if (state.step === 'ask_qty' && input.reserved) await reserveLastItem(turn.state, session.cart_token)

  if (turn.response === PLACEHOLDER) {
    const order = await createOrder(turn.state, session.cart_token, phone, callId)
    if (!order) {
      await saveSession(session.id, { ...turn.state, step: 'done', tl_seq: next })
      return reply(`id_list_message=${msgToken(messages, 'order_error')}&go_to_folder=hangup`)
    }
    await saveSession(session.id, { ...turn.state, order_id: order.id, order_number: order.order_number, tl_seq: next }, order.id)
    const intro = msgToken(messages, 'payment_intro')
    return paymentModule(turn.state, next, intro ? reply(`id_list_message=${intro}`).filter((r) => r.type === 'simpleMessage') : [])
  }

  if (state.step === 'payment' && input.payment) {
    const code = ctx.params[`${PAY_VAR}_q${seq}`] ?? ''
    if (session.order_id) await finalizeOrder(session.order_id, session.cart_token, code, ctx.params[`CONFIRM_${PAY_VAR}_q${seq}`])
    await deleteSession(callId)
    return reply(turn.response)
  }

  if (turn.state.step === 'done') await deleteSession(callId)
  else await saveSession(session.id, { ...turn.state, tl_seq: next })
  return reply(turn.response)
}
