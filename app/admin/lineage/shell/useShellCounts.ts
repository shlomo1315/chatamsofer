'use client'

import { useEffect, useState } from 'react'
import type { ShellCounts } from './types'

/** מונים אמיתיים לפס העליון: אותו API של מרכז הבקרה ושל בקשות המשפחות, בקריאה בלבד. */
export function useShellCounts(reloadSignal: number): ShellCounts {
  const [state, setState] = useState<ShellCounts>({ summary: null, parallelGroups: [], requests: null, loading: true })

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [cc, rq] = await Promise.all([
        fetch('/api/admin/lineage/control-center', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/admin/lineage/requests?scope=pending', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null),
      ])
      if (!alive) return
      const s = rq?.summary
      setState({
        summary: cc?.summary ?? null,
        parallelGroups: cc?.parallelGroups ?? [],
        requests: s ? (s.open ?? 0) + (s.inProgress ?? 0) + (s.waitingFamily ?? 0) + (s.later ?? 0) : null,
        loading: false,
      })
    })()
    return () => { alive = false }
  }, [reloadSignal])

  return state
}
