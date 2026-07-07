// פונקציות טהורות לקריאת פרמטרי רשימה מ-URL — משותפות לשרת (page.tsx) ולקליינט
// (useListParams). אין כאן 'use client' בכוונה, כדי שהשרת יוכל לייבא בבטחה.

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
