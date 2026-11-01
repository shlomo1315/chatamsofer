'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Users } from 'lucide-react'
import { Family } from '@/types'
import { SearchBar } from '@/components/admin/system/SearchBar'
import { EmptyState } from '@/components/admin/system/EmptyState'
import Card from '@/components/ui/Card'
import SortButtons, { SortMode, applySortMode } from '@/components/ui/SortButtons'

type FamilyWithCount = Family & { member_count: number }

export default function FamiliesClient({ families }: { families: FamilyWithCount[] }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('alpha')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return families
    return families.filter(f =>
      [f.family_name, f.notes].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [families, query])

  const visible = useMemo(() =>
    applySortMode(filtered, sort,
      f => f.family_name ?? '',
      f => f.created_at,
    ), [filtered, sort])

  return (
    <>
      <SearchBar card value={query} onChange={setQuery} placeholder="חיפוש לפי שם משפחה…">
        <SortButtons value={sort} onChange={setSort} />
      </SearchBar>

      {visible.length === 0 ? (
        <EmptyState>{query ? 'לא נמצאו משפחות לחיפוש זה' : 'לא נמצאו משפחות. הוסף משפחה חדשה להתחלה'}</EmptyState>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map(family => (
            <Link key={family.id} href={`/admin/families/${family.id}`}>
              <Card className="hover:border-gold transition-all cursor-pointer group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 group-hover:text-navy transition-colors">
                      {family.family_name}
                    </h3>
                    {family.notes && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{family.notes}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-1 bg-sand text-navy rounded-lg px-2 py-1 text-xs font-medium">
                    <Users size={12} />
                    {family.member_count}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
