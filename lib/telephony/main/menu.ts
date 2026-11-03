// התפריט הראשי של המערכת הראשית. חסר-מצב: הצעד נקבע לפי הפרמטרים שחזרו.
// ההודעות נערכות במסך הניהול (app_settings, אותו מפתח של התפריט הקיים).
import { getMainMenuMessages } from '@/lib/yemotMainMenu'
import { say, menu, goTo, goodbye, message } from '../modules'
import type { TlHandler } from '../types'

/** יעדי מעבר לשלוחות (נתיב בטכנוליין). חסר = השלוחה עדיין לא הוקמה. */
function target(name: 'HOLIDAYS' | 'MATERNITY'): string | null {
  const v = process.env[`TECHNOLINE_MAIN_EXT_${name}`]
  return v && v.trim() ? v.trim() : null
}

export const mainMenu: TlHandler = async ({ params }) => {
  const m = await getMainMenuMessages()
  const text = (k: string) => m[k]?.text ?? ''
  const choice = params.menuChoice

  if (!choice || choice === 'ERROR') {
    return menu('menuChoice', ['1', '2', '9'], say(text('welcome'), text('menu')))
  }
  if (choice === '9') return goodbye(text('notice'))
  const dest = choice === '1' ? target('HOLIDAYS') : choice === '2' ? target('MATERNITY') : null
  if (dest) return goTo(dest)
  if (choice === '1' || choice === '2') return goodbye('השלוחה תהיה זמינה בקרוב')
  return [message(text('invalid')), menu('menuChoice', ['1', '2', '9'], say(text('menu')))]
}
