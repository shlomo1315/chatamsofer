// שליחת מייל מתוך כרטסת: בחירת תיבות השליחה ובניית הבקשה למנגנון הקיים
// (/api/admin/gmail/inbox/actions). אין כאן מנגנון שליחה חדש.
import { DEPARTMENTS, normalizeDepartmentKey, type DepartmentKey } from '@/lib/departments'

export interface MailAccount {
  id: string
  email: string
  label?: string | null
  department?: string | null
  is_active?: boolean | null
}

export interface MailDraft {
  to: string
  cc?: string
  bcc?: string
  subject: string
  html: string
  attachments: { name: string; type: string; data: string }[]
  scheduledAt?: string
}

// תיבות פעילות בלבד, ובראש הרשימה תיבת המשרד (ברירת המחדל לשליחה).
export function sendableAccounts(accounts: MailAccount[]): MailAccount[] {
  const active = accounts.filter((a) => a.is_active !== false)
  const rank = (a: MailAccount) => (/^office@/i.test(a.email) || a.department === 'main' ? 0 : 1)
  return [...active].sort((a, b) => rank(a) - rank(b))
}

// "מחלקה · כתובת" לבורר "מאת", כדי שברור מאיזו מחלקה יוצא המייל.
export function accountOption(a: MailAccount): { id: string; email: string } {
  const key = normalizeDepartmentKey(a.department ?? '') as DepartmentKey
  const dept = DEPARTMENTS[key]?.label ?? a.label ?? ''
  return { id: a.id, email: dept ? `${dept} · ${a.email}` : a.email }
}

export function buildSendBody(d: MailDraft, accountId?: string) {
  return {
    action: 'send' as const,
    to: d.to.trim(),
    cc: d.cc || undefined,
    bcc: d.bcc || undefined,
    subject: d.subject,
    html: d.html,
    attachments: d.attachments,
    ...(d.scheduledAt ? { scheduledAt: d.scheduledAt } : {}),
    accountId: accountId || undefined,
  }
}

export async function sendRecordMail(
  d: MailDraft,
  accountId: string | undefined,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetcher('/api/admin/gmail/inbox/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildSendBody(d, accountId)),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: (json as { error?: string }).error ?? 'השליחה נכשלה' }
    return { ok: true }
  } catch {
    return { ok: false, error: 'שגיאת רשת' }
  }
}
