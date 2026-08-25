'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { readListParams, encodeColFilters, type ListParams, DEFAULT_PAGE_SIZE } from './listParams'

// Hook לניהול מצב רשימה דרך ה-URL (page/size/q/status/sort), כדי ש:
//  • החיפוש/סינון/עמוד ירוצו בצד ה-DB (ה-server component קורא את ה-params),
//  • רענון/חזרה-אחורה/שיתוף-קישור ישמרו את המצב,
//  • realtime/refresh לא יאבדו את העמוד והפילטרים.
//
// החיפוש עובר עם debounce כדי לא לנווט על כל הקשה. שאר השינויים מיידיים.
// הפונקציות הטהורות (readListParams/PAGE_SIZES) יושבות ב-listParams.ts כדי
// שגם ה-server component יוכל לייבא אותן (קובץ זה הוא 'use client').

export { PAGE_SIZES, DEFAULT_PAGE_SIZE, readListParams, type ListParams } from './listParams'

export function useListParams(opts?: {
  defaultStatus?: string
  defaultSort?: string
  /** 🔴 העמודות שמותר למיין/לסנן לפיהן — fail-closed. ראו readListParams. */
  sortCols?: readonly string[]
}) {
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
    if ('marital' in next) apply('marital', next.marital, 'all')
    if ('email' in next) apply('email', next.email, 'all')
    // ── מיון וסינון מהכותרת ──
    // ⚠️ col ריק מסיר גם את dir: כיוון בלי עמודה הוא פרמטר יתום ב-URL.
    if ('col' in next) {
      apply('col', next.col, '')
      if (!next.col) sp.delete('dir')
    }
    if ('dir' in next) apply('dir', next.dir, 'asc')
    if ('colFilters' in next) apply('f', encodeColFilters(next.colFilters ?? {}), '')
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
    setMarital: (marital: string) => pushParams({ marital }),
    setEmail: (email: string) => pushParams({ email }),
    // ⚠️ מיון וסינון מאפסים לעמוד 1: אחרת המשתמש נשאר בעמוד 7 של
    // תוצאה שיש בה שני עמודים, ורואה מסך ריק.
    setColSort: (col: string, dir: 'asc' | 'desc') => pushParams({ col, dir }),
    setColFilters: (colFilters: Record<string, string[]>) => pushParams({ colFilters }),
    setSize: (size: number) => pushParams({ size }),
    setPage: (page: number) => pushParams({ page }, false),
  }
}
