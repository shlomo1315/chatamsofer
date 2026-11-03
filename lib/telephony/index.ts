// רישום כל המטפלים לפי מערכת ושלוחה. מערכת חדשה/שלוחה חדשה נרשמות כאן בלבד.
import { register, dispatch } from './dispatcher'
import { mainMenu } from './main/menu'
import { otp } from './main/otp'
import { maternity } from './main/maternity'
import { holidays } from './main/holidays'
import { goodbye } from './modules'
import type { TlHandler } from './types'

// שלד: מערכות יריד ומפיצים עדיין בלי שלוחות (ראו מסמך המערכות).
const comingSoon: TlHandler = async () => goodbye('המערכת בהקמה אנא נסו שוב מאוחר יותר')

register('main', 'menu', mainMenu)
register('main', 'otp', otp)
register('main', 'maternity', maternity)
register('main', 'holidays', holidays)
register('yerid', 'menu', comingSoon)
register('distributors', 'menu', comingSoon)

export { dispatch }
