'use client'
import { useState } from 'react'
import { MapPin, Wallet, FileText, Receipt, Phone } from 'lucide-react'
import CenterBreakdown from './CenterBreakdown'
import LoadCardsPanel from './LoadCardsPanel'
import SendVouchersPanel from './SendVouchersPanel'
import TransactionsPanel from './TransactionsPanel'
import IvrSimulator from './IvrSimulator'

// ─────────────────────────────────────────────────────────────────────────────
// כלי החלוקה — טאבים, באותו דפוס של מסך כרטיסי המזון (CardsTabs).
//
// 🔴 ערימת כרטיסים צבעוניים אחד מתחת לשני הייתה עמוסה, וכל פאנל תפס
// מקום גם כשלא נזקקו לו. טאבים מציגים אחד בכל רגע.
//
// ⚡ וזה גם פותר את האיטיות: תוכן הטאב מרונדר רק כשהוא נבחר, כך שאף
// קריאה לשרת אינה יוצאת עד שמישהו נכנס אליו.
// ─────────────────────────────────────────────────────────────────────────────

type TabId = 'centers' | 'load' | 'vouchers' | 'tx' | 'ivr'

const TABS: { id: TabId; label: string; icon: typeof MapPin }[] = [
  { id: 'centers', label: 'מוקדי חלוקה', icon: MapPin },
  { id: 'load', label: 'טעינת כרטיסים', icon: Wallet },
  { id: 'vouchers', label: 'שוברים', icon: FileText },
  { id: 'tx', label: 'עסקאות ואיפוס', icon: Receipt },
  { id: 'ivr', label: 'בדיקת שלוחה', icon: Phone },
]

export default function HolidayToolsTabs({ distributionId }: { distributionId: string }) {
  const [tab, setTab] = useState<TabId>('centers')

  return (
    <div className="flex flex-col gap-5">
      {/* ⚠️ flex-wrap ולא overflow-x-auto: גלילה לרוחב אסורה במערכת
          (eslint-rules/no-horizontal-scroll). בנייד הטאבים יורדים לשורה
          שנייה במקום להיחתך מחוץ למסך. */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 border-b-2 -mb-px px-4 py-2.5 text-sm font-medium transition-colors
                ${active ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
              <Icon size={16} /> {t.label}
            </button>
          )
        })}
      </div>

      {/* ⚠️ רינדור מותנה ולא hidden: פאנל מוסתר עדיין רץ ויורה קריאות. */}
      {tab === 'centers' && <CenterBreakdown distributionId={distributionId} />}
      {tab === 'load' && <LoadCardsPanel distributionId={distributionId} />}
      {tab === 'vouchers' && <SendVouchersPanel distributionId={distributionId} />}
      {tab === 'tx' && <TransactionsPanel distributionId={distributionId} />}
      {tab === 'ivr' && <IvrSimulator distributionId={distributionId} />}
    </div>
  )
}
