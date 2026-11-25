// התלויות האמיתיות של lib/lineageChainSave (מסד, יומן, מטמון) — נפרד כדי
// שהבדיקות יוכלו להזריק תחליפים.
import { NODE_SELECT, invalidateLineageCache, resyncSubtree, type TreeNodeRow } from './lineageSync'
import { earlyLineageGate } from './earlyLineageGate'
import { fetchAllRows } from './fetchAllRows'
import { logActivity } from './activityLog'
import type { SaveDeps } from './lineageChainSave'

export const lineageSaveDeps: SaveDeps = {
  applyChain: async (admin, id, chain) => {
    const { applyChain } = await import('@/app/api/admin/lineage/requests/route')
    return applyChain(admin, id, chain)
  },
  loadNodes: async admin => (await fetchAllRows<TreeNodeRow>((from, to) =>
    admin.from('lineage_nodes').select(NODE_SELECT).range(from, to))).rows as never,
  logActivity: (admin, entry) => logActivity(admin, entry as never),
  invalidate: invalidateLineageCache,
  gate: (admin, ben, approved) => earlyLineageGate(admin, ben, approved),
  resyncSubtree: (admin, nodes, nodeId) => resyncSubtree(admin, nodes as TreeNodeRow[], nodeId),
}
