// התפריט הראשי של המערכת הראשית. חסר-מצב: הצעד נקבע לפי הפרמטרים שחזרו.
// בחירה 1 = חגים, 2 = יולדות: מטפלים פנימיים באותה כתובת, בלי שלוחות בטכנוליין.
// הפרמטרים מצטברים בשיחה, ולכן menuChoice ממשיך לנתב לאותו מטפל בבקשות הבאות.
// ההודעות נערכות במסך הניהול (app_settings, אותו מפתח של התפריט הקיים).
import { getMainMenuMessages } from '@/lib/yemotMainMenu'
import { say, menu, goodbye, message } from '../modules'
import type { TlHandler } from '../types'
import { holidays } from './holidays'
import { maternity } from './maternity'

export const mainMenu: TlHandler = async (ctx) => {
  const m = await getMainMenuMessages()
  const text = (k: string) => m[k]?.text ?? ''
  const choice = ctx.params.menuChoice

  if (!choice || choice === 'ERROR') {
    return menu('menuChoice', ['1', '2', '9'], say(text('welcome'), text('menu')))
  }
  if (choice === '9') return goodbye(text('notice'))
  if (choice === '1') return holidays(ctx)
  if (choice === '2') return maternity(ctx)
  return [message(text('invalid')), menu('menuChoice', ['1', '2', '9'], say(text('menu')))]
}
