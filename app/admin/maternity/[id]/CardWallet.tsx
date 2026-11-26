'use client'
import { useState } from 'react'
import CardActivity from './CardActivity'
import { getCardWalletView, type CardWalletInput } from '@/lib/cardUnloadView'

const money = (n: number) => `${n.toLocaleString('he-IL', { maximumFractionDigits: 2 })} ₪`

// כרטיס טעון: סכום הטעינה, נוצלו ונותרו בארנק — ומתחת התנועות מנדרים.
// ⚠️ שני החלקים מציגים אותה יתרה: כשהיתרה החיה מגיעה מנדרים היא מעדכנת גם את
// התיבות. עד אז (ולמי שאינו מנהל) — live_balance מהרענון השעתי.
export default function CardWallet({ aidId, aid, showActivity }: { aidId: string; aid: CardWalletInput; showActivity: boolean }) {
  const [fresh, setFresh] = useState<number | null>(null)
  const v = getCardWalletView(aid, fresh)
  return (
    <>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-2">
          <p className="text-xs text-slate-500">סכום הטעינה</p>
          <p className="text-sm font-semibold text-slate-800 ltr-num">{v.loadedAmount != null ? money(v.loadedAmount) : '—'}</p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-100 px-2 py-2">
          <p className="text-xs text-slate-500">נוצלו</p>
          <p className="text-sm font-semibold text-slate-800 ltr-num">{v.used != null ? money(v.used) : '—'}</p>
        </div>
        <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-2 py-2">
          <p className="text-xs text-slate-500">נותרו בארנק</p>
          <p className="text-sm font-semibold text-emerald-700 ltr-num">{v.balance != null ? money(v.balance) : '—'}</p>
        </div>
      </div>
      {showActivity && <CardActivity aidId={aidId} onBalance={setFresh} />}
    </>
  )
}
