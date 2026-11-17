'use client'
import { useEffect, useState } from 'react'
import ComposeDialog from '@/app/admin/mail/gmail/ComposeDialog'
import { accountOption, sendableAccounts, sendRecordMail, type MailAccount } from '@/lib/recordMail'

// חלונית שליחת מייל מתוך כרטסת. משתמשת בחלון הכתיבה ובתיבות של מערכת הדואר
// הקיימת, ולכן אפשר לשלוח מכל מחלקה. החלון עצמו באמצע המסך עם טשטוש מאחור.
export default function RecordMailDialog({ to, subject, onClose }: { to: string; subject?: string; onClose: () => void }) {
  const [accounts, setAccounts] = useState<MailAccount[] | null>(null)
  const [fromId, setFromId] = useState('')

  useEffect(() => {
    let alive = true
    fetch('/api/admin/gmail/accounts', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return
        const list = sendableAccounts((j.accounts ?? []) as MailAccount[])
        setAccounts(list)
        setFromId(list[0]?.id ?? '')
      })
      .catch(() => alive && setAccounts([]))
    return () => { alive = false }
  }, [])

  if (!accounts) return null
  const current = accounts.find((a) => a.id === fromId)

  return (
    <ComposeDialog
      mode="new"
      initialTo={to}
      initialSubject={subject}
      accountEmail={current ? accountOption(current).email : null}
      accounts={accounts.map(accountOption)}
      fromId={fromId}
      onFromChange={setFromId}
      onClose={onClose}
      onSent={async (p) => {
        const r = await sendRecordMail(p, fromId || undefined)
        if (r.ok) onClose()
        else window.alert(r.error)
        return r.ok
      }}
    />
  )
}
