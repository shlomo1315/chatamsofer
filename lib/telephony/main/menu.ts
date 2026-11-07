// התפריט הראשי של המערכת הראשית. חסר-מצב: הצעד נקבע לפי הפרמטרים שחזרו.
// בחירה 1 = חגים, 2 = יולדות: מטפלים פנימיים באותה כתובת, בלי שלוחות בטכנוליין.
// טלפון של מוקד מורשה עובר ישר לטעינה החודשית (centerLoad), בלי תפריט.
// הפרמטרים מצטברים בשיחה, ולכן menuChoice ממשיך לנתב לאותו מטפל בבקשות הבאות.
// ההודעות נערכות במסך הניהול (app_settings, אותו מפתח של התפריט הקיים).
import { getServiceClient } from '@/lib/apiAuth'
import { findCenterByPhone, normalizeCallerPhone } from '@/lib/centerMonthlyLoad'
import { getMainMenuMessages } from '@/lib/mainMenuPhone'
import { say, menu, goodbye, message } from '../modules'
import type { TlHandler } from '../types'
import { CL_CARD, CL_CONFIRM, CL_GO, centerLoad } from './centerLoad'
import { holidays } from './holidays'
import { maternity } from './maternity'

const CENTER_PARAMS = [CL_CARD, CL_CONFIRM, CL_GO]

/** המתקשר הוא מוקד פעיל עם טלפון מורשה? תקלה במסד = לא (ממשיכים לתפריט הרגיל). */
async function isCenterCaller(raw: string): Promise<boolean> {
  const phone = normalizeCallerPhone(raw)
  const db = phone ? getServiceClient() : null
  if (!db) return false
  try { return !!(await findCenterByPhone(db, phone)) } catch { return false }
}

export const mainMenu: TlHandler = async (ctx) => {
  const choice = ctx.params.menuChoice
  // שיחה של מוקד: כבר באמצע הטעינה, או טלפון מורשה שעוד לא בחר בתפריט
  if (!choice && (CENTER_PARAMS.some((k) => ctx.params[k] != null) || await isCenterCaller(ctx.phone))) {
    console.log(`[telephony:main/menu] callId=${ctx.callId} מוקד מזוהה, מעבר לטעינה החודשית`)
    return centerLoad(ctx)
  }

  const m = await getMainMenuMessages()
  const text = (k: string) => m[k]?.text ?? ''
  if (!choice || choice === 'ERROR') {
    return menu('menuChoice', ['1', '2', '9'], say(text('welcome'), text('menu')))
  }
  if (choice === '9') return goodbye(text('notice'))
  if (choice === '1') return holidays(ctx)
  if (choice === '2') return maternity(ctx)
  return [message(text('invalid')), menu('menuChoice', ['1', '2', '9'], say(text('menu')))]
}
