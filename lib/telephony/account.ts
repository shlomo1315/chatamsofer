// Account API: רכישת מספרים בכפוף לתקרה חודשית. בלי תקרה מוגדרת — אין רכישה.
// ⚠️ גם לטכנוליין יש תקרה בצד שלה (api_cap_not_set / api_cap_exceeded); כאן בדיקה נוספת לפני הקריאה.
import { accountApi } from './interaction'
import { accountConfig } from './systems'

export type CapState = { monthlyCap: number; spent: number; remaining: number }

export async function accountOverview() {
  const res = await accountApi('me')
  if (!res.ok) return res
  const d = res.data
  return { ok: true as const, data: { name: String(d.name ?? ''), monthlyCap: Number(d.monthly_cap ?? 0), monthSpent: Number(d.month_spent ?? 0) } }
}

const ERRORS: Record<string, string> = {
  api_cap_not_set: 'לא הוגדרה תקרה חודשית בטכנוליין',
  api_cap_exceeded: 'חרגת מהתקרה החודשית',
  api_purchase_disabled: 'רכישת מספרים ב-API לא מאושרת בחשבון',
  api_writes_disabled: 'כתיבה דרך API לא מאושרת בחשבון',
  number_not_available: 'המספר אינו זמין',
  card_required: 'נדרש כרטיס אשראי בחשבון',
}

/** תקרה מקומית: לא קונים אם התקרה לא הוגדרה, או אם כבר הוצא מעבר לה. */
export function withinCap(cap: number, spent: number, price: number): boolean {
  return cap > 0 && spent + price <= cap
}

export async function buyNumber(input: { systemId: string; groupId: string; number: string; price?: number }) {
  const { monthlyCap } = accountConfig()
  if (monthlyCap <= 0) return { ok: false as const, error: 'לא הוגדרה תקרה חודשית (TECHNOLINE_MONTHLY_CAP)' }
  const me = await accountOverview()
  if (!me.ok) return me
  if (!withinCap(monthlyCap, me.data.monthSpent, input.price ?? 0)) {
    return { ok: false as const, error: `התקרה החודשית (${monthlyCap}) מוצתה` }
  }
  const res = await accountApi('number_buy', { system_id: input.systemId, group_id: input.groupId, number: input.number })
  if (res.ok) return { ok: true as const, data: res.data }
  return { ok: false as const, error: (res.code && ERRORS[res.code]) || res.error }
}
