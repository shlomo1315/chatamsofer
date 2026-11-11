// התפריט הראשי של המערכת הראשית. חסר-מצב: הצעד נקבע לפי הפרמטרים שחזרו.
// בחירה 1 = חגים, 2 = יולדות: מטפלים פנימיים באותה כתובת, בלי שלוחות בטכנוליין.
// הטעינה החודשית למוקדים כבר לא בטלפון: היא רצה אוטומטית ב-cron (center-monthly-load).
// ההודעות נערכות במסך הניהול (app_settings, אותו מפתח של התפריט הקיים).
import { getMainMenuMessages } from '@/lib/mainMenuPhone'
import { say, menu, goodbye, message } from '../modules'
import type { TlHandler } from '../types'
import { holidays } from './holidays'
import { maternity } from './maternity'

export const mainMenu: TlHandler = async (ctx) => {
  const choice = ctx.params.menuChoice
  const m = await getMainMenuMessages()
  const text = (k: string) => m[k]?.text ?? ''
  const keys = ['1', '2', '9']
  const menuFiles = () => say(text('menu'))
  if (!choice || choice === 'ERROR') return menu('menuChoice', keys, say(text('welcome'), text('menu')))
  if (choice === '9') return goodbye(text('notice'))
  if (choice === '1') return holidays(ctx)
  if (choice === '2') return maternity(ctx)
  return [message(text('invalid')), menu('menuChoice', keys, menuFiles())]
}
