'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ClipboardList, Mail, Landmark } from 'lucide-react'
import { KVITEL_TABS, type KvitelTabKey } from './kvitelTabs'

// שורת לשוניות בראש מסך הקוויטלאך (בקשות · מייל · נדרים). מונה "לא נקראו" ליד המייל.
// ⚠️ סינון המחלקה של המייל נעשה בשרת (MailClient lockDepartment), לא כאן.

const ICON = { requests: ClipboardList, mail: Mail, nedarim: Landmark }

export default function KvitelTabs({ active }: { active: KvitelTabKey }) {
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    const load = () => fetch('/api/admin/mail/unread-counts').then(r => r.json())
      .then(d => { if (!d.error) setUnread(d.byDepartment?.kvitel ?? 0) }).catch(() => {})
    load()
    const onRefresh = (e: Event) => {
      const d = (e as CustomEvent).detail as { byDepartment?: Record<string, number> } | undefined
      if (d?.byDepartment) setUnread(d.byDepartment.kvitel ?? 0)
      else load()
    }
    window.addEventListener('mail-unread-refresh', onRefresh)
    return () => window.removeEventListener('mail-unread-refresh', onRefresh)
  }, [])

  return (
    <nav aria-label="לשוניות קוויטלאך" className="flex flex-wrap gap-1 border-b border-line">
      {KVITEL_TABS.map(t => {
        const on = t.key === active
        const Icon = ICON[t.key]
        const badge = t.key === 'mail' ? unread : 0
        return (
          <Link key={t.key} href={`/admin/kvitel?tab=${t.key}`} aria-current={on ? 'page' : undefined}
            className={`-mb-px flex items-center gap-2 border-b-[3px] px-4 py-3 text-[15px] transition-colors ${on ? 'border-gold font-bold text-navy' : 'border-transparent font-medium text-ink-soft hover:text-navy'}`}>
            <Icon className="h-[18px] w-[18px]" aria-hidden />
            {t.label}
            {badge > 0 && <span className="min-w-[20px] rounded-full bg-gold px-1.5 py-0.5 text-center text-[11px] font-bold text-navy">{badge}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
