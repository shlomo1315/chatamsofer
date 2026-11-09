// התפריט הראשי של המערכת הראשית. חסר-מצב: הצעד נקבע לפי הפרמטרים שחזרו.
// בחירה 1 = חגים, 2 = יולדות: מטפלים פנימיים באותה כתובת, בלי שלוחות בטכנוליין.
// מוקד מורשה (לפי טלפון) שומע בנוסף את המקש 3 לטעינה החודשית (centerLoad).
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
const NOT_CENTER = 'המספר שממנו התקשרתם אינו רשום כמוקד מורשה לטעינה. לרישום המספר פנו למזכירות'

/** המתקשר הוא מוקד פעיל עם טלפון מורשה? תקלה במסד = לא (ממשיכים לתפריט הרגיל). */
async function isCenterCaller(raw: string): Promise<boolean> {
  const phone = normalizeCallerPhone(raw)
  const db = phone ? getServiceClient() : null
  if (!db) return false
  try { return !!(await findCenterByPhone(db, phone)) } catch { return false }
}

export const mainMenu: TlHandler = async (ctx) => {
  const choice = ctx.params.menuChoice
  const midLoad = CENTER_PARAMS.some((k) => ctx.params[k] != null)
  // מקש 3 (או באמצע טעינה) מיועד רק למוקד מורשה; מי שאינו כזה שומע שהמספר אינו רשום
  const isCenter = midLoad || !choice || choice === 'ERROR' || choice === '3' ? midLoad || await isCenterCaller(ctx.phone) : false
  if (isCenter && (midLoad || choice === '3')) return centerLoad(ctx)

  const m = await getMainMenuMessages()
  const text = (k: string) => m[k]?.text ?? ''
  // מקש 3 פתוח לכולם (גם אם לא מושמע): בעל מוקד שמתקשר ממספר לא רשום שומע הסבר
  // ולא "הקשה שגויה", והניסיון נרשם בלוג כדי שאפשר יהיה לרשום את המספר.
  const keys = ['1', '2', '3', '9']
  const menuFiles = (...head: string[]) => say(...head, text('menu'), ...(isCenter ? [text('centerMenu')] : []))
  if (!choice || choice === 'ERROR') return menu('menuChoice', keys, menuFiles(text('welcome')))
  if (choice === '9') return goodbye(text('notice'))
  if (choice === '1') return holidays(ctx)
  if (choice === '2') return maternity(ctx)
  if (choice === '3') {
    console.warn('[telephony:main/center-load] מקש 3 ממספר שאינו רשום כמוקד:', normalizeCallerPhone(ctx.phone) || ctx.phone)
    return [message(NOT_CENTER), menu('menuChoice', keys, menuFiles())]
  }
  return [message(text('invalid')), menu('menuChoice', keys, menuFiles())]
}
