export const KVITEL_TABS = [
  { key: 'requests', label: 'בקשות' },
  { key: 'mail', label: 'מייל' },
  { key: 'nedarim', label: 'נדרים' },
] as const

export type KvitelTabKey = (typeof KVITEL_TABS)[number]['key']

export function parseKvitelTab(v: string | string[] | undefined): KvitelTabKey {
  const s = Array.isArray(v) ? v[0] : v
  return KVITEL_TABS.some(t => t.key === s) ? (s as KvitelTabKey) : 'requests'
}
