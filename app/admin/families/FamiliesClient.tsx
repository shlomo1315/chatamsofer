'use client'
import { useState, useMemo } from 'react'
import { Family } from '@/types'
import { SearchBar } from '@/components/admin/system/SearchBar'
import { ListTable } from '@/components/admin/system/ListTable'
import SortButtons, { SortMode, applySortMode } from '@/components/ui/SortButtons'
import { useTablePagination } from '@/lib/useTablePagination'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'
import FamilyCardModal from './FamilyCardModal'

type FamilyWithCount = Family & { member_count: number }
type ColKey = 'name' | 'notes' | 'members'

const COLUMNS: ColDef<ColKey, FamilyWithCount>[] = [
  { key: 'name', label: 'שם משפחה', def: true, value: f => f.family_name },
  { key: 'notes', label: 'הערות', def: true, value: f => f.notes || null },
  { key: 'members', label: 'בני משפחה', def: true, align: 'center', kind: 'number', value: f => f.member_count },
]

export default function FamiliesClient({ families }: { families: FamilyWithCount[] }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('alpha')
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = !q ? families : families.filter(f =>
      [f.family_name, f.notes].filter(Boolean).join(' ').toLowerCase().includes(q))
    return applySortMode(filtered, sort, f => f.family_name ?? '', f => f.created_at)
  }, [families, query, sort])

  const tc = useTableColumns<ColKey, FamilyWithCount>('families', COLUMNS, { sortFilter: { mode: 'client', rows: visible } })
  const pg = useTablePagination(tc.rows)

  const cell = (c: ColDef<ColKey, FamilyWithCount>, f: FamilyWithCount) => {
    switch (c.key) {
      case 'name': return <span className="font-semibold text-ink">{f.family_name}</span>
      case 'notes': return <span className="line-clamp-2 text-ink-soft">{f.notes || '—'}</span>
      case 'members': return <span className="tabular-nums text-ink-soft">{f.member_count}</span>
    }
  }

  return (
    <>
      <ListTable tc={tc} rows={pg.rows} pg={pg} renderCell={cell}
        empty={query ? 'לא נמצאו משפחות לחיפוש זה' : 'לא נמצאו משפחות. הוסף משפחה חדשה להתחלה'}
        onOpen={f => setOpenIdx(tc.rows.findIndex(x => x.id === f.id))}
        toolbar={<>
          <SortButtons value={sort} onChange={setSort} />
          <SearchBar value={query} onChange={setQuery} placeholder="חיפוש לפי שם משפחה…" />
        </>} />
      {openIdx !== null && tc.rows[openIdx] && (
        <FamilyCardModal rows={tc.rows} index={openIdx} onIndex={setOpenIdx} onClose={() => setOpenIdx(null)} />
      )}
    </>
  )
}
