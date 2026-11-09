// שלוחת טעינה חודשית למוקדי חלוקת כרטיסים בטכנוליין (מערכת ראשית).
// המוקד מזוהה לפי הטלפון: בפעם הראשונה מקיש כרטיס (נשמר פעם אחת), ובכל חודש מקיש 1 לטעינה.
// מספר הכרטיס רגיש: maskLog + post, והוא מוסר מהפרמטרים אחרי שנשמר או נדחה.
import { getServiceClient } from '@/lib/apiAuth'
import {
  findCenterByPhone, isLoadedThisMonth, israelMonth, linkCenterCard, normalizeCallerPhone, runMonthlyLoad, type CenterAccount,
} from '@/lib/centerMonthlyLoad'
import { askDigits, digits, fill, goodbye, menu, say } from '../modules'
import type { TlFile, TlHandler, TlResult } from '../types'

export const CARD_DIGITS = 16
export const CL_CARD = 'center_card'
export const CL_CONFIRM = 'center_confirm'
export const CL_GO = 'center_go'

const hello = (name?: string) => (name?.trim() ? `שלום ${name.trim()}` : 'שלום')

const askCard = (lead = '', name?: string): TlResult => ({
  ...askDigits(CL_CARD, CARD_DIGITS, say(lead, `${hello(name)}. הטלפון שלך מזוהה. הקש את מספר הכרטיס בן 16 ספרות`), { min: 1, maskLog: true, post: true }),
  removeParams: [CL_CONFIRM],
})

const cardFiles = (pre: string, card: string, post: string): TlFile[] => fill(`${pre} {card} ${post}`, { card: digits(card) })

export type CenterTurn = { result: TlResult; link?: string; load?: boolean }

/** לוגיקה טהורה: מה לומר והאם לשייך כרטיס / לבצע טעינה, לפי הפרמטרים והמצב. */
export function centerTurn(p: Record<string, string>, state: { cardNumber: string | null; loadedThisMonth: boolean; name?: string }): CenterTurn {
  let card = state.cardNumber
  let lead = ''
  let link: string | undefined
  if (!card) {
    const typed = (p[CL_CARD] ?? '').replace(/\D/g, '')
    if (!typed) return { result: askCard('', state.name) }
    if (typed.length !== CARD_DIGITS) return { result: { ...askCard('מספר הכרטיס חייב להכיל 16 ספרות', state.name), removeParams: [CL_CARD, CL_CONFIRM] } }
    const confirm = (p[CL_CONFIRM] ?? '').trim()
    if (!confirm) {
      return { result: menu(CL_CONFIRM, ['1', '2'], cardFiles('הכרטיס שהקשת הוא', typed, 'לאישור הקישו 1, לתיקון הקישו 2'), { times: 2 }) }
    }
    if (confirm !== '1') return { result: { ...askCard('', state.name), removeParams: [CL_CARD, CL_CONFIRM] } }
    card = typed
    link = typed
    lead = 'הכרטיס נשמר'
  }
  if (state.loadedThisMonth) return { result: goodbye('שים לב, החודש הזה כבר הועברה לך הטעינה'), link }
  if ((p[CL_GO] ?? '').trim() !== '1') {
    return { result: menu(CL_GO, ['1'], [...say(lead || hello(state.name)), ...cardFiles('מספר הכרטיס שלך הוא', card, 'לביצוע טעינה של החודש הנוכחי הקישו 1')], { timeout: 7 }), link }
  }
  return { result: goodbye(), link, load: true }
}

export const centerLoad: TlHandler = async ({ phone: raw, params, callId }) => {
  const phone = normalizeCallerPhone(raw)
  if (!phone) return goodbye('שגיאה במספר המתקשר')
  const db = getServiceClient()
  if (!db) return goodbye('שגיאת שרת')
  let acc: CenterAccount | null
  try { acc = await findCenterByPhone(db, phone) } catch { return goodbye('שגיאה במערכת. נסו שוב מאוחר יותר') }
  if (!acc) return goodbye('המספר שממנו התקשרת אינו מורשה לטעינה')

  console.log('[telephony:main/center-load] callId=' + (callId ?? '') + ' center=' + acc.center_id + ' card=' + (acc.card_number ? 'linked' : 'none') + ' params=' + Object.keys(params).join(','))
  const month = israelMonth()
  // הכרטיס שנשמר עכשיו עוד לא ב-acc, ולכן בודקים מצב חודש רק אחרי השיוך
  const first = centerTurn(params, { cardNumber: acc.card_number, loadedThisMonth: false, name: acc.center_name })
  if (first.link) {
    const linked = await linkCenterCard(db, acc, first.link)
    if (!linked.ok) { console.error('[telephony:main/center-load] שיוך כרטיס נכשל:', linked.error); return goodbye('לא הצלחנו לשייך את הכרטיס. פנו למזכירות') }
    acc = { ...acc, card_number: first.link }
  }
  const loaded = await isLoadedThisMonth(db, acc.center_id, month)
  const turn = loaded ? centerTurn(params, { cardNumber: acc.card_number, loadedThisMonth: true, name: acc.center_name }) : first
  if (!turn.load) {
    // אחרי שיוך: מסירים את הכרטיס מהפרמטרים (לא נשאר ב-REQUEST)
    return first.link && !Array.isArray(turn.result) ? { ...turn.result, removeParams: [CL_CARD, CL_CONFIRM] } : turn.result
  }

  const { result, error } = await runMonthlyLoad(db, acc)
  if (result === 'loaded') return goodbye('הטעינה בוצעה בהצלחה. תודה')
  if (result === 'already') return goodbye('שים לב, החודש הזה כבר הועברה לך הטעינה')
  if (result === 'no_stock') return goodbye('אין כרגע מלאי במערכת, אין אפשרות להטעין את הכרטיס')
  if (result === 'busy') return goodbye('הטעינה שלך כבר בטיפול. נסו שוב בעוד כמה דקות')
  console.error('[telephony:main/center-load] טעינה נכשלה:', error)
  return goodbye('אירעה שגיאה בטעינה. נסו שוב מאוחר יותר')
}
