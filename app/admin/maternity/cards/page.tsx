import { UtensilsCrossed } from 'lucide-react'
import CardCentersManager from './CardCentersManager'
import StockManager from './StockManager'
import CardsTabs from './CardsTabs'

export default function FoodCardsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <UtensilsCrossed size={20} className="text-emerald-600" />
        <div>
          <h1 className="text-xl font-bold text-slate-900">כרטיסי מזון יולדות</h1>
          <p className="text-sm text-slate-500 mt-0.5">ניהול מלאי כרטיסים ואישור כרטיסים</p>
        </div>
      </div>

      <CardsTabs internal={
        <div className="flex flex-col gap-5">
          <StockManager />
          <CardCentersManager />
        </div>
      } />
    </div>
  )
}
