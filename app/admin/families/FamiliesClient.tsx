'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Search, Users } from 'lucide-react'
import { Family } from '@/types'
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
      <div className="flex items-center gap-3 flex-wrap">
        <SortButtons value={sort} onChange={setSort} />
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="חיפוש לפי שם משפחה…"
            className="w-full pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition-colors shadow-sm" />
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">{query ? 'לא נמצאו משפחות לחיפוש זה' : 'לא נמצאו משפחות'}</p>
          {!query && <p className="text-slate-400 text-sm mt-1">הוסף משפחה חדשה להתחלה</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map(family => (
            <Link key={family.id} href={`/admin/families/${family.id}`}>
              <Card className="hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors">
                      {family.family_name}
                    </h3>
                    {family.notes && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{family.notes}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-1 bg-indigo-50 text-indigo-700 rounded-lg px-2 py-1 text-xs font-medium">
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
