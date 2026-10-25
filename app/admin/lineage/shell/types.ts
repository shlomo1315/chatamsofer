import type { ControlSummary, ParallelGroup } from '@/lib/lineageControlCenter'

export type ShellTab = 'tree' | 'fan' | 'work' | 'set'

export type QueueId =
<<<<<<< HEAD
  | 'generation' | 'safe' | 'likely' | 'parallel' | 'self' | 'kids'
=======
  | 'safe' | 'likely' | 'parallel' | 'self' | 'kids'
>>>>>>> origin/main
  | 'approve' | 'requests' | 'sugg' | 'fam'
  | 'unlinked' | 'ghost' | 'audit' | 'cases'

export interface ShellCounts {
  summary: ControlSummary | null
  parallelGroups: ParallelGroup[]
  /** בקשות משפחות שעדיין פתוחות (פתוחות + בטיפול + מחכות למשפחה + לאחר כך) */
  requests: number | null
  loading: boolean
}

export interface ShellSettings {
  sens: 'exact' | 'near'
  autoSafe: boolean
  nameOnly: boolean
  orderWarn: boolean
  hideEdit: boolean
  open: ShellTab
  markPending: boolean
  printDesc: boolean
}

export const DEFAULT_SETTINGS: ShellSettings = {
  sens: 'exact', autoSafe: false, nameOnly: false, orderWarn: true,
  hideEdit: true, open: 'tree', markPending: true, printDesc: false,
}

export const SETTINGS_KEY = 'lineage.shell.settings.v1'

export function loadSettings(): ShellSettings {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(SETTINGS_KEY) : null
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ShellSettings>) } : DEFAULT_SETTINGS
  } catch { return DEFAULT_SETTINGS }
}

export function saveSettings(s: ShellSettings) {
  try { window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch { /* אחסון חסום: ההגדרה תחזיק עד הרענון */ }
}
