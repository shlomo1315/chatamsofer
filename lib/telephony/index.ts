// רישום כל המטפלים לפי מערכת ושלוחה. מערכת חדשה/שלוחה חדשה נרשמות כאן בלבד.
import { register, dispatch } from './dispatcher'
import { mainMenu } from './main/menu'
import { otp } from './main/otp'
import { maternity } from './main/maternity'
import { holidays } from './main/holidays'
import { distributors } from './distributors'
import { yeridMenu } from './yerid/menu'
import { credits } from './yerid/credits'
import { kvitel } from './main/kvitel'
import { centerLoad } from './main/centerLoad'

register('main', 'menu', mainMenu)
register('main', 'otp', otp)
register('main', 'maternity', maternity)
register('main', 'holidays', holidays)
register('main', 'kvitel', kvitel)
register('main', 'center-load', centerLoad)
register('yerid', 'menu', yeridMenu)
register('yerid', 'credits', credits)
register('distributors', 'menu', distributors)

export { dispatch }
