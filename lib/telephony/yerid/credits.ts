// שלוחת זיכויי היריד בטכנוליין (מערכת יריד, נפרדת מהראשית). הלקוח מזוהה לפי הטלפון,
// ופרטי בנק נקלטים רק לזיכוי שכבר יצאה אליו פנייה. פרטי הבנק אף פעם לא נרשמים בלוג.
import { getServiceClient } from '@/lib/apiAuth'
import { normalizePhone } from '@/lib/kvitel'
import {
  CR_ACCT, CR_BANK, CR_BRANCH, CR_CONFIRM, CR_HOLDER, CR_OK, PHONE_OPEN_STATUSES, amountSpoken, mergePhoneCredits, validateBank,
  type CreditCallContext, type CreditPhoneAction,
} from '@/lib/bookFairCredits'
import { askDigits, digits, fill, goodbye, menu, say } from '../modules'
import type { TlHandler, TlParams, TlResult } from '../types'

export type CreditTurn = { result: TlResult; action: CreditPhoneAction }
const done = (result: TlResult, action: CreditPhoneAction = null): CreditTurn => ({ result, action })
const num = (v: string | undefined) => (v ?? '').replace(/\D/g, '')
const sensitive = { maskLog: true, post: true }

export function creditTurn(p: TlParams, ctx: CreditCallContext): CreditTurn {
  if (ctx.alreadyDone) {
    return done(goodbye(
      `שלום${ctx.name ? ` ${ctx.name}` : ''}, כאן היכל החתם סופר. בגין הספרים שלא סופקו: ${ctx.books}, אנו מזכים אתכם בסכום של ${amountSpoken(ctx.amountAgorot)}.`,
      'פרטי החשבון שלכם כבר התקבלו, והזיכוי יועבר אליו. תודה ושלום',
    ))
  }
  const ok = p[CR_OK] ?? ''
  if (!ok) {
    return done(menu(CR_OK, ['1', '2'], say(
      `${ctx.name ? `שלום ${ctx.name}` : 'שלום'}, כאן היכל החתם סופר. לא סיפקנו לכם את הספרים הבאים: ${ctx.books}.`,
      `אנחנו מזכים אתכם בסכום של ${amountSpoken(ctx.amountAgorot)}, והזיכוי יועבר לחשבון הבנק שלכם.`,
      'כדי להעביר את הזיכוי נצטרך את פרטי החשבון. להמשך הקישו 1. לסיום הקישו 2',
    )), { kind: 'answered' })
  }
  if (ok !== '1') return done(goodbye('תודה ושלום'))

  const holder = (p[`PATH_${CR_HOLDER}`] ?? p[CR_HOLDER] ?? '').trim()
  if (!holder) {
    return done({ type: 'record', name: CR_HOLDER, max: 15, min: 1, confirm: 'no', maskLog: true, files: say('אחרי הצליל אמרו את שם בעל החשבון, ובסיום הקישו סולמית') })
  }
  const bank = num(p[CR_BANK])
  if (!bank) return done(askDigits(CR_BANK, 2, say('הקישו את מספר הבנק, ובסיום סולמית'), { min: 1, ...sensitive }))
  const branch = num(p[CR_BRANCH])
  if (!branch) return done(askDigits(CR_BRANCH, 4, say('הקישו את מספר הסניף, ובסיום סולמית'), { min: 1, ...sensitive }))
  const account = num(p[CR_ACCT])
  if (!account) return done(askDigits(CR_ACCT, 9, say('הקישו את מספר החשבון, ובסיום סולמית'), { min: 1, ...sensitive }))

  const bad = validateBank({ bank, branch, account })
  if (bad) return done(goodbye(`${bad}. הפרטים לא נשמרו. נחזור אליכם בשיחה נוספת`))

  const confirm = p[CR_CONFIRM] ?? ''
  if (!confirm) {
    return done(menu(CR_CONFIRM, ['1', '2'], fill('הקשתם: מספר בנק {b} מספר סניף {r} מספר חשבון {a} לאישור הפרטים הקישו 1. לביטול הקישו 2',
      { b: digits(bank), r: digits(branch), a: digits(account) })))
  }
  if (confirm !== '1') return done(goodbye('הפרטים לא נשמרו. נחזור אליכם בשיחה נוספת. שלום'))
  return done(goodbye('הפרטים התקבלו. הזיכוי יועבר לחשבון שמסרתם. תודה רבה ושלום'), { kind: 'save', holderRecording: holder, bank, branch, account })
}

export const credits: TlHandler = async ({ phone: raw, params }) => {
  const db = getServiceClient()
  if (!db) return goodbye('שגיאת שרת')
  const phone = normalizePhone(raw)
  if (!phone) return goodbye('לא זוהה מספר המתקשר. נא להתקשר ממספר מזוהה')
  const { data } = await db.from('book_fair_credits')
    .select('id, customer_name, books, amount_agorot, status')
    .eq('phone', phone).order('created_at', { ascending: false }).limit(20)
  const picked = mergePhoneCredits(data ?? [])
  if (!picked) return goodbye('לא נמצא זיכוי פתוח למספר שממנו התקשרתם. לפרטים פנו למשרד')

  const open = picked.rows.some((r) => (PHONE_OPEN_STATUSES as readonly string[]).includes(r.status))
  const turn = creditTurn(params, { ...picked.ctx, alreadyDone: !open })
  const ids = picked.rows.map((r) => r.id)
  const a = turn.action
  const now = new Date().toISOString()
  if (a?.kind === 'answered') {
    await db.from('book_fair_credits').update({ status: 'answered', answered_at: now, updated_at: now }).in('id', ids).eq('status', 'sent')
  } else if (a?.kind === 'save') {
    const { data: saved, error } = await db.from('book_fair_credits').update({
      status: 'details_entered', details_at: now, updated_at: now,
      bank_holder_recording: a.holderRecording.slice(0, 300), bank_number: a.bank, bank_branch: a.branch, bank_account: a.account,
    }).in('id', ids).in('status', [...PHONE_OPEN_STATUSES]).select('id')
    if (error || !saved?.length) {
      console.error('[telephony:yerid/credits] שמירה נכשלה', ids, error?.code ?? 'status')
      return goodbye('אירעה תקלה בשמירה. נחזור אליכם בשיחה נוספת')
    }
  }
  return turn.result
}
