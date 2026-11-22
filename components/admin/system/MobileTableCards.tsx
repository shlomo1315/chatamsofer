'use client'

import { useEffect } from 'react'

// 🔴 22.11.2026: טבלאות רחבות נחתכו בנייד (טבלה של 16 עמודות ברוחב 1520px בתוך
// מסך של 390, והמסגרת הסתירה את רוב העמודות).
//
// ListTable ו-DataTable כבר מסמנים את עצמם (lt-cards + data-label). יש עוד כ-40
// טבלאות שנבנו ידנית; במקום לגעת בכל אחת, הרכיב הזה מסמן אותן אוטומטית:
// לכל תא נכתב שם העמודה מהכותרת, וה-CSS ב-globals.css (lt-cards) הופך כל שורה
// לכרטיס מתחת ל-640px. מעל 640px אין שום שינוי.
//
// ⚠️ מדלגים על טבלאות קטנות (פחות מ-4 עמודות — הן נכנסות ממילא) ועל כותרות עם
// colspan, שבהן אין התאמה חד-ערכית בין תא לעמודה.
export default function MobileTableCards() {
  useEffect(() => {
    let raf = 0
    const scan = () => {
      raf = 0
      document.querySelectorAll<HTMLTableElement>('main table').forEach(table => {
        if (table.dataset.lt === 'skip') return
        if (!table.dataset.lt) {
          if (table.classList.contains('lt-cards')) { table.dataset.lt = 'own'; return }
          const headRow = table.tHead?.rows[table.tHead.rows.length - 1]
          const ths = headRow ? Array.from(headRow.cells) : []
          if (ths.length < 4 || ths.some(th => th.colSpan > 1)) { table.dataset.lt = 'skip'; return }
          table.dataset.lt = 'auto'
          table.classList.add('lt-cards')
        }
        if (table.dataset.lt !== 'auto') return
        const labels = Array.from(table.tHead!.rows[table.tHead!.rows.length - 1].cells).map(th => th.innerText.trim())
        for (const body of Array.from(table.tBodies)) {
          for (const tr of Array.from(body.rows)) {
            if (tr.cells.length !== labels.length) continue
            Array.from(tr.cells).forEach((td, i) => {
              if (!td.hasAttribute('data-label') && labels[i]) td.setAttribute('data-label', labels[i])
            })
          }
        }
      })
    }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(scan) }
    schedule()
    const mo = new MutationObserver(schedule)
    mo.observe(document.body, { childList: true, subtree: true })
    return () => { mo.disconnect(); if (raf) cancelAnimationFrame(raf) }
  }, [])
  return null
}
