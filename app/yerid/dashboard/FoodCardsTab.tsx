'use client'
import { Loader2 } from 'lucide-react'
import { Card, Kpi, SplitBar } from '@/components/bookFair/StatCharts'
import { useLiveData } from '@/components/bookFair/useLiveData'
import {
  CARD_STATUS_KEYS, CARD_STATUS_LABELS, type CardStatusKey, type FoodCardSummary,
} from '@/lib/maternityFoodCards'

// טאב "כרטיסי מזון": סיכום כרטיסי המזון של מחלקת היולדות, מפולח לפי בית החלמה,
// סטטוס וחודש. מספרים מסוכמים בלבד (בלי פרטי יולדות), מהמסד ולא מנדרים.

type Payload = FoodCardSummary & { at: string }

const COLORS: Record<CardStatusKey, string> = {
  loaded: '#22663A', pending: '#B8862B', failed: '#9A2F24', unloaded: '#34477A', idle: '#9A917B',
}
const money = (n: number) => `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`
const monthLabel = (m: string) => {
  const [y, mo] = m.split('-')
  return `${mo}/${y}`
}
const th = 'px-3 py-2.5 text-right text-xs font-semibold text-[#5B6475] border-b border-[#E6E1D6] whitespace-nowrap'
const td = 'px-3 py-3 tabular-nums border-b border-[#EFE9DC]'

export default function FoodCardsTab() {
  const { data, error, status } = useLiveData<Payload>('/api/yerid/dashboard/food-cards', 60 * 1000)

  if (!data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        {error && status !== null
          ? <p className="px-6 text-center text-[#6B2737]">{error}</p>
          : <Loader2 className="animate-spin text-[#14213D]" />}
      </div>
    )
  }

  const { total, byStatus, byHome, byMonth } = data
  const loaded = byStatus.loaded

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi highlight label="סך הכול נטען בכרטיסים" value={money(loaded.loaded)} sub={`${loaded.count} כרטיסים נטענו`} />
        <Kpi label="יולדות מאושרות" value={total.count.toLocaleString('he-IL')} sub="פעילות והושלמו" />
        <Kpi label="הטעינה נכשלה" value={byStatus.failed.count.toLocaleString('he-IL')} sub="דורשות טיפול" />
        <Kpi label="יתרה שמורה בתיקים" value={money(total.balance)} sub="ערך אחרון שנשמר, לא חי" />
      </div>

      <Card title="פילוח לפי סטטוס כרטיס" subtitle="כל יולדת מאושרת נספרת פעם אחת">
        <SplitBar parts={CARD_STATUS_KEYS.map(k => ({
          label: CARD_STATUS_LABELS[k], value: byStatus[k].count, color: COLORS[k],
          sub: k === 'loaded' ? money(byStatus[k].loaded) : undefined,
        }))} />
      </Card>

      <Card title="לפי בית החלמה">
        <div>
          <table className="w-full text-[15px]">
            <thead>
              <tr>
                <th className={th}>בית החלמה</th>
                <th className={th}>יולדות</th>
                {CARD_STATUS_KEYS.map(k => <th key={k} className={th}>{CARD_STATUS_LABELS[k]}</th>)}
                <th className={th}>סכום שנטען</th>
              </tr>
            </thead>
            <tbody>
              {byHome.map(h => (
                <tr key={h.home}>
                  <td className={`${td} font-semibold`}>{h.home}</td>
                  <td className={td}>{h.total.count}</td>
                  {CARD_STATUS_KEYS.map(k => <td key={k} className={td}>{h.byStatus[k] || '—'}</td>)}
                  <td className={`${td} font-semibold`}>{money(h.total.loaded)}</td>
                </tr>
              ))}
              <tr className="bg-[#F4F1EA] font-bold">
                <td className={td}>סך הכול</td>
                <td className={td}>{total.count}</td>
                {CARD_STATUS_KEYS.map(k => <td key={k} className={td}>{byStatus[k].count}</td>)}
                <td className={td}>{money(loaded.loaded)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="טעינות לפי חודש">
        {byMonth.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#5B6475]">אין טעינות</p>
        ) : (
          <div>
            <table className="w-full text-[15px]">
              <thead><tr><th className={th}>חודש</th><th className={th}>כרטיסים שנטענו</th><th className={th}>סכום</th></tr></thead>
              <tbody>
                {byMonth.map(m => (
                  <tr key={m.month}>
                    <td className={td}>{monthLabel(m.month)}</td>
                    <td className={td}>{m.count}</td>
                    <td className={`${td} font-semibold`}>{money(m.loaded)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-center text-[13px] text-[#5B6475]">
        מחלקת יולדות · הנתונים מהמסד, מתעדכנים כל דקה · סכום הטעינה נספר רק לכרטיסים שנטענו
      </p>
    </div>
  )
}
