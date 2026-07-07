'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { readListParams, type ListParams, DEFAULT_PAGE_SIZE } from './listParams'

// Hook לניהול מצב רשימה דרך ה-URL (page/size/q/status/sort), כדי ש:
//  • החיפוש/סינון/עמוד ירוצו בצד ה-DB (ה-server component קורא את ה-params),
//  • רענון/חזרה-אחורה/שיתוף-קישור ישמרו את המצב,
//  • realtime/refresh לא יאבדו את העמוד והפילטרים.
//
// החיפוש עובר עם debounce כדי לא לנווט על כל הקשה. שאר השינויים מיידיים.
// הפונקציות הטהורות (readListParams/PAGE_SIZES) יושבות ב-listParams.ts כדי
// שגם ה-server component יוכל לייבא אותן (קובץ זה הוא 'use client').

export { PAGE_SIZES, DEFAULT_PAGE_SIZE, readListParams, type ListParams } from './listParams'

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
