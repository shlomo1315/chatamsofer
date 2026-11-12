import Link from 'next/link'
import { LayoutDashboard, ListChecks, Mail, Landmark } from 'lucide-react'
import { KVITEL_TABS, type KvitelTabKey } from './kvitelTabs'

const ICONS = { overview: LayoutDashboard, requests: ListChecks, mail: Mail, nedarim: Landmark } as const

// תפריט צד נייבי (בצד ימין ב-RTL). בנייד הוא שורה עוטפת מעל התוכן.
export default function KvitelNav({ tab }: { tab: KvitelTabKey }) {
  return (
    <nav aria-label="לשוניות קוויטלאך" className="flex flex-wrap gap-1 rounded-xl bg-navy p-2 md:sticky md:top-4 md:w-56 md:shrink-0 md:flex-col md:flex-nowrap md:p-3">
      {KVITEL_TABS.map(t => {
        const Icon = ICONS[t.key]
        const on = tab === t.key
        return (
          <Link key={t.key} href={t.key === 'overview' ? '/admin/kvitel' : `/admin/kvitel?tab=${t.key}`} aria-current={on ? 'page' : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-semibold transition-colors ${on ? 'bg-white/15 text-white' : 'text-[#C9D0E2] hover:bg-white/10 hover:text-white'}`}>
            <Icon className={`h-4 w-4 ${on ? 'text-gold' : ''}`} aria-hidden />
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
