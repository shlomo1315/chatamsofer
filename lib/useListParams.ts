'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

// Hook לניהול מצב רשימה דרך ה-URL (page/size/q/status/sort), כדי ש:
//  • החיפוש/סינון/עמוד ירוצו בצד ה-DB (ה-server component קורא את ה-params),
//  • רענון/חזרה-אחורה/שיתוף-קישור ישמרו את המצב,
//  • realtime/refresh לא יאבדו את העמוד והפילטרים.
//
// החיפוש עובר עם debounce כדי לא לנווט על כל הקשה. שאר השינויים מיידיים.

export const PAGE_SIZES = [20, 50, 100, 200] as const
export const DEFAULT_PAGE_SIZE = 50

export interface ListParams {
  page: number
  size: number
  q: string
  status: string
  sort: string
}

export function readListParams(
  sp: URLSearchParams | { get(k: string): string | null },
  opts?: { defaultStatus?: string; defaultSort?: string },
): ListParams {
  const rawSize = parseInt(sp.get('size') ?? '', 10)
  const size = (PAGE_SIZES as readonly number[]).includes(rawSize) ? rawSize : DEFAULT_PAGE_SIZE
  const rawPage = parseInt(sp.get('page') ?? '', 10)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
  return {
    page,
    size,
    q: (sp.get('q') ?? '').trim(),
    status: sp.get('status') ?? opts?.defaultStatus ?? 'all',
    sort: sp.get('sort') ?? opts?.defaultSort ?? 'newest',
  }
}

export function useListParams(opts?: { defaultStatus?: string; defaultSort?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const current = readListParams(searchParams, opts)

  // ערך תיבת החיפוש מוחזק מקומית לתגובה מיידית; ה-URL מתעדכן עם debounce.
  const [qInput, setQInput] = useState(current.q)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  // מסנכרן את תיבת החיפוש אם ה-URL השתנה חיצונית (למשל ניווט אחורה).
  const lastUrlQ = useRef(current.q)
  useEffect(() => {
    if (current.q !== lastUrlQ.current) {
      lastUrlQ.current = current.q
      setQInput(current.q)
    }
  }, [current.q])

  const pushParams = useCallback((next: Partial<ListParams>, resetPage = true) => {
    const sp = new URLSearchParams(searchParams.toString())
    const apply = (key: string, val: string | number | undefined, def?: string | number) => {
      if (val === undefined || val === '' || val === def) sp.delete(key)
      else sp.set(key, String(val))
    }
    if ('q' in next) apply('q', next.q, '')
    if ('status' in next) apply('status', next.status, opts?.defaultStatus ?? 'all')
    if ('sort' in next) apply('sort', next.sort, opts?.defaultSort ?? 'newest')
    if ('size' in next) apply('size', next.size, DEFAULT_PAGE_SIZE)
    if ('page' in next) apply('page', next.page, 1)
    // כל שינוי של חיפוש/סינון/מיון/גודל מאפס לעמוד 1 (אלא אם משנים page עצמו)
    if (resetPage && !('page' in next)) sp.delete('page')
    const qs = sp.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname, searchParams, opts?.defaultStatus, opts?.defaultSort])

  const setSearch = useCallback((value: string) => {
    setQInput(value)
    lastUrlQ.current = value.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => pushParams({ q: value.trim() }), 300)
  }, [pushParams])

  return {
    params: current,
    qInput,
    setSearch,
    setStatus: (status: string) => pushParams({ status }),
    setSort: (sort: string) => pushParams({ sort }),
    setSize: (size: number) => pushParams({ size }),
    setPage: (page: number) => pushParams({ page }, false),
  }
}
