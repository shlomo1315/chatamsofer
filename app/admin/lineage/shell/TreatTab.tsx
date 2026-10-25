'use client'

import type { ReactNode } from 'react'
import { fmt, type ShellData } from '@/lib/lineageShell'
import type { QueueId, ShellCounts } from './types'

interface Props {
  data: ShellData
  counts: ShellCounts
  queue: QueueId
  trunk: number
  onQueue: (q: QueueId) => void
  onClearTrunk: () => void
  children: ReactNode
}

interface Item { id: QueueId; label: string; count: number | null; warn?: boolean }

export const QUEUE_TITLES: Record<QueueId, { t: string; why: string }> = {
  safe: { t: 'מיזוג בטוח', why: 'כפילויות זהות לגמרי מרישום מקביל, בלי סיכון. אפשר למזג בבת אחת.' },
  likely: { t: 'כפילויות בסבירות', why: 'צמתים שנראים כפולים. בודקים כל קבוצה ומחליטים: מזג או לא כפול.' },
  parallel: { t: 'רישום מקביל', why: 'משפחות שונות שהוסיפו את אותם דורות. מרכז המיזוגים מציג את האשכולות ואת תוכנית המיזוג.' },
  self: { t: 'דור אחרון כפול', why: 'עותקים כפולים של אותו אדם בתוך אותו ענף.' },
  kids: { t: 'ילדים כפולים', why: 'ילדים עם אותו שם תחת אותו הורה.' },
  approve: { t: 'אישור ייחוס', why: 'מרכז האישורים: ייחוסים שממתינים להחלטה.' },
  requests: { t: 'בקשות משפחות', why: 'בקשות תיקון ששלחו משפחות, עם סטטוס והיסטוריה.' },
  sugg: { t: 'הצעות', why: 'הצעות שינוי שהתקבלו לעץ.' },
  fam: { t: 'סקירה משפחה-משפחה', why: 'עוברים משפחה אחרי משפחה, מסמנים "נבדקה, תקין" או מטפלים.' },
  unlinked: { t: 'לא מקושרים', why: 'משפחות שאינן מקושרות לצומת בעץ.' },
  ghost: { t: 'צמתי רפאים', why: 'צמתים ריקים או שבורים שאין להם תוכן אמיתי.' },
  audit: { t: 'ביקורת תקינות', why: 'בדיקת קשרים, דורות והורים חסרים, ובריאות העץ.' },
  cases: { t: 'תיקי טיפול', why: 'מרכז התיקים של העץ.' },
}

export default function TreatTab({ data, counts, queue, trunk, onQueue, onClearTrunk, children }: Props) {
  const s = counts.summary
  const groups: { g: string; items: Item[] }[] = [
    { g: 'מיזוגים', items: [
      { id: 'safe', label: 'מיזוג בטוח', count: counts.parallelGroups.filter(p => p.safe).length, warn: true },
      { id: 'likely', label: 'כפילויות בסבירות', count: s ? s.dup.groups : null, warn: true },
      { id: 'parallel', label: 'רישום מקביל', count: s ? s.parallel.groups : null, warn: true },
      { id: 'self', label: 'דור אחרון כפול', count: s ? s.selfDup : null, warn: true },
      { id: 'kids', label: 'ילדים כפולים', count: null },
    ] },
    { g: 'אישורים ומשפחות', items: [
      { id: 'approve', label: 'אישור ייחוס', count: data.pending, warn: true },
      { id: 'requests', label: 'בקשות משפחות', count: counts.requests, warn: true },
      { id: 'sugg', label: 'הצעות', count: null },
      { id: 'fam', label: 'סקירה משפחה-משפחה', count: s ? s.families : null },
    ] },
    { g: 'ניקיון העץ', items: [
      { id: 'unlinked', label: 'לא מקושרים', count: s ? s.unlinked : null, warn: true },
      { id: 'ghost', label: 'צמתי רפאים', count: s ? s.ghost.rows : null, warn: true },
      { id: 'audit', label: 'ביקורת תקינות', count: null },
      { id: 'cases', label: 'תיקי טיפול', count: null },
    ] },
  ]
  const meta = QUEUE_TITLES[queue]
  const tk = trunk >= 0 ? data.trunks[trunk] : null

  return (
    <div className="tr">
      <nav className="card q" aria-label="תורי טיפול">
        {groups.map(g => (
          <div key={g.g}>
            <div className="qg">{g.g}</div>
            {g.items.map(i => (
              <button key={i.id} className={`qi ${queue === i.id ? 'on' : ''}`} onClick={() => onQueue(i.id)}>
                {i.label}
                {i.count !== null && <span className={`c ${i.warn && i.count > 0 ? 'w' : ''}`}>{fmt(i.count)}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="card work">
        <div className="wh">
          <h3>{meta.t}</h3>
          <div className="why">{meta.why}</div>
          {tk && (
            <div className="why" style={{ color: 'var(--warn)' }}>
              נבחר הגזע {tk.node.name}. התורים מציגים את כל העץ, ומיקום פריט בגזע מופיע בכרטיס שלו.{' '}
              <button className="btn" style={{ minHeight: 28, padding: '0 10px' }} onClick={onClearTrunk}>הסר סינון</button>
            </div>
          )}
        </div>
        <div className="wbody">{children}</div>
      </div>
    </div>
  )
}
