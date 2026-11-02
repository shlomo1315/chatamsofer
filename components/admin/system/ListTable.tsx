'use client'

import type { ReactNode } from 'react'
import Pagination from '@/components/ui/Pagination'
import type { ColDef, TableColumns } from '@/components/ui/TableColumns'

// טבלת רשימה אחידה לכל מחלקה: כרטיס, שורת כלים (SearchBar), בורר עמודות,
// כותרת עם מיון וסינון, שורות לחיצות, מצב ריק ודפדוף.
// שינוי מראה הטבלה בכל המערכת נעשה כאן ובשורה (ListRow) בלבד.

type Pg = { page: number; size: number; total: number; setPage: (p: number) => void; setSize: (s: number) => void }

export function ListTable<K extends string, R extends { id: string | number }>({
  tc,
  rows,
  pg,
  toolbar,
  renderCell,
  actions,
  actionsHead = 'פעולות',
  onOpen,
  stopCell,
  empty,
  leadHead,
  leadCell,
}: {
  tc: TableColumns<K, R>
  /** השורות של העמוד הנוכחי (אחרי דפדוף) */
  rows: R[]
  pg: Pg
  toolbar: ReactNode
  renderCell: (c: ColDef<K, R>, row: R) => ReactNode
  actions?: (row: R) => ReactNode
  actionsHead?: string
  onOpen?: (row: R) => void
  /** עמודות שהלחיצה בהן לא פותחת את הכרטסת (כפתורים בתוך התא) */
  stopCell?: (c: ColDef<K, R>) => boolean
  empty: string
  /** עמודה פותחת (למשל צ׳קבוקס בחירה): כותרת ותא. שניהם יחד או בלי */
  leadHead?: ReactNode
  leadCell?: (row: R) => ReactNode
}) {
  const lead = leadHead !== undefined && leadCell ? 1 : 0
  const extra = (actions ? 1 : 0) + lead
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-paper">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">{toolbar}</div>
      <div className="flex flex-col gap-2 border-b border-line px-5 py-3 empty:hidden">
        {tc.picker}
        {tc.activeFilters}
      </div>
      {/* בלי overflow-x: אין גלילה לרוחב בשום טבלה */}
      <div className="w-full">
        <table className="w-full text-right text-sm" style={tc.rt.tableStyle}>
          <colgroup>{tc.rt.cols}</colgroup>
          <thead>
            <tr className="border-b border-line bg-sand [&>th]:px-3 [&>th]:py-3.5 [&>th]:text-right [&>th]:align-middle [&>th]:text-[11px] [&>th]:font-bold [&>th]:tracking-wide [&>th]:text-ink-soft">
              {lead === 1 && <th className="w-10">{leadHead}</th>}
              {tc.shown.map((c, i) => tc.th(c, i + lead))}
              {actions && <th className="relative">{actionsHead}{tc.rt.handle(tc.shown.length + lead)}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {/* נמדד מול tc.rows: סינון הכותרת יכול לרוקן את הטבלה גם כשהחיפוש החזיר שורות */}
            {tc.rows.length === 0 ? (
              <tr><td colSpan={tc.shown.length + extra} className="px-4 py-12 text-center text-ink-faint">{empty}</td></tr>
            ) : (
              rows.map(row => (
                <ListRow key={row.id} onClick={onOpen ? () => onOpen(row) : undefined}>
                  {lead === 1 && <td className="align-top" onClick={e => e.stopPropagation()}>{leadCell!(row)}</td>}
                  {tc.shown.map(c => (
                    <td key={c.key} className={tc.cellClass(c)} onClick={stopCell?.(c) ? e => e.stopPropagation() : undefined}>{renderCell(c, row)}</td>
                  ))}
                  {actions && (
                    <td className="align-top" onClick={e => e.stopPropagation()}>{actions(row)}</td>
                  )}
                </ListRow>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-line px-4 py-3">
        <Pagination page={pg.page} size={pg.size} total={pg.total} onPage={pg.setPage} onSize={pg.setSize} />
      </div>
    </div>
  )
}

// שורה אחידה: ריחוף זהב עדין, סמן לחיצה כשיש פעולה.
export function ListRow({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={`transition-colors hover:bg-sand [&>td]:px-3 [&>td]:py-3 [&>td]:text-right ${onClick ? 'cursor-pointer' : ''}`}
    >
      {children}
    </tr>
  )
}

// כפתור פעולה קטן בשורה (צפייה וכד')
export const rowActionClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-gold hover:bg-sand hover:text-navy'
