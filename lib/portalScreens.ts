// מסכי האזור האישי: נתיב קבוע לכל מסך (/my/...) ומיפויו למצב בדשבורד.
// מקור אמת יחיד לנתיבים — משמש את הניתוב, את הקישורים החתומים במיילים ואת המסך עצמו.

export type PortalScreen =
  | 'home' | 'requests' | 'lineage' | 'lineage-add' | 'details' | 'details-children'
  | 'documents' | 'documents-upload' | 'new-request' | 'new-holiday'

export interface ScreenTarget {
  action?: 'birth' | 'loan' | 'docs' | 'aid' | 'details' | 'holiday'
  openLineageFix?: boolean
}

export const SCREEN_TARGETS: Record<PortalScreen, ScreenTarget> = {
  'home':             {},
  'requests':         {},
  'lineage':          {},
  'lineage-add':      { openLineageFix: true },
  'details':          {},
  'details-children': {},
  'documents':        {},
  'documents-upload': { action: 'docs' },
  'new-request':      {},
  'new-holiday':      { action: 'holiday' },
}

const PATHS: Array<[string, PortalScreen]> = [
  ['/my/requests', 'requests'],
  ['/my/lineage/add', 'lineage-add'],
  ['/my/lineage', 'lineage'],
  ['/my/details/children', 'details-children'],
  ['/my/details', 'details'],
  ['/my/documents/upload', 'documents-upload'],
  ['/my/documents', 'documents'],
  ['/my/new', 'new-request'],
]

/** נתיב `/my/...` → מסך. כולל `/my/requests/<id>` (מוצג כרשימת הבקשות) ו-`/my/new?type=holiday`. */
export function screenFromPath(pathname: string, type?: string | null): PortalScreen {
  const p = pathname.replace(/\/+$/, '') || '/my'
  if (p === '/my/new' && type === 'holiday') return 'new-holiday'
  if (/^\/my\/requests\/[^/]+$/.test(p)) return 'requests'
  for (const [prefix, screen] of PATHS) if (p === prefix) return screen
  return 'home'
}

export function pathForScreen(screen: PortalScreen): string {
  if (screen === 'home') return '/my'
  if (screen === 'new-holiday') return '/my/new?type=holiday'
  return PATHS.find(([, s]) => s === screen)?.[0] ?? '/my'
}

export function isPortalScreen(v: unknown): v is PortalScreen {
  return typeof v === 'string' && v in SCREEN_TARGETS
}
