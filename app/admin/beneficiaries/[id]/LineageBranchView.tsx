'use client'
import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import { Loader2, Pencil, Plus, Trash2, ExternalLink, ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { ancestorChain } from '@/lib/lineageChain'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { genTone } from '@/lib/lineagePalette'
import { useCan } from '@/components/StaffPermissions'
import { genColor, asGenStatus } from '@/lib/lineageDeviation'

interface LineageNode {
  id: string
  name: string
  generation: number
  parent_id: string | null
  relation?: 'son' | 'son_in_law' | null
  status?: 'verified' | 'pending' | 'rejected'
}

// צבעי סטטוס — זהים לעץ הניהול: מאומת=ירוק, ממתין=כתום, נדחה=אדום
const STATUS_NODE = {
  pending:  { bg: 'linear-gradient(135deg,#FB923C 0%,#EA580C 100%)', ring: '#EA580C', shadow: 'rgba(234,88,12,0.40)' },
  rejected: { bg: 'linear-gradient(135deg,#EF4444 0%,#DC2626 100%)', ring: '#DC2626', shadow: 'rgba(220,38,38,0.40)' },
}
function statusBadge(s?: string) {
  if (s === 'rejected') return { glyph: '✕', bg: '#DC2626' }
  if (s === 'pending' || s === 'review') return { glyph: '!', bg: '#F59E0B' }
  return { glyph: '✓', bg: '#22C55E' } // verified
}
interface TNode extends LineageNode { children: TNode[] }
interface Pos { node: TNode; x: number; y: number; cx: number; cy: number }

const NW = 172, NH = 58, HGAP = 48, VGAP = 96, PAD = 72

// ⚠️ הפלטה מגיעה מ-lib/lineagePalette ואינה מוגדרת כאן — ראה שם למה.
const pal = genTone

function buildTree(flat: LineageNode[]): TNode[] {
  const map = new Map<string, TNode>()
  flat.forEach(n => map.set(n.id, { ...n, children: [] }))
  const roots: TNode[] = []
  flat.forEach(n => {
    const node = map.get(n.id)!
    if (n.parent_id && map.has(n.parent_id)) map.get(n.parent_id)!.children.push(node)
    else roots.push(node)
  })
  return roots
}
function subtreeW(n: TNode): number {
  return n.children.length ? n.children.reduce((s, c) => s + subtreeW(c), 0) : NW + HGAP
}
function layoutTree(roots: TNode[]): Pos[] {
  const result: Pos[] = []
  function place(n: TNode, x: number, y: number) {
    const sw = subtreeW(n), cx = x + sw / 2
    result.push({ node: n, x: cx - NW / 2, y, cx, cy: y + NH / 2 })
    let cx2 = x
    n.children.forEach(c => { place(c, cx2, y + NH + VGAP); cx2 += subtreeW(c) })
  }
  let sx = PAD
  roots.forEach(r => { place(r, sx, PAD); sx += subtreeW(r) })
  return result
}
function canvasSize(pos: Pos[]) {
  if (!pos.length) return { w: 800, h: 400 }
  return { w: Math.max(...pos.map(p => p.x + NW)) + PAD, h: Math.max(...pos.map(p => p.y + NH)) + PAD }
}
function collectEdges(positions: Pos[]) {
  const byId = new Map(positions.map(p => [p.node.id, p]))
  return positions.flatMap(p =>
    p.node.children.map(c => { const cp = byId.get(c.id); return cp ? { from: p, to: cp } : null })
      .filter(Boolean) as { from: Pos; to: Pos }[]
  )
}

const normName = (s: string) => s.trim().replace(/\s+/g, ' ')

type ModalState =
  | { type: 'edit'; node: LineageNode }
  | { type: 'add'; parentId: string; parentName: string }
  | { type: 'delete'; node: LineageNode }
  | { type: 'merge'; keep: LineageNode; others: LineageNode[] }
  | null

// ─────────────────────────────────────────────────────────────────────────────
// עץ הדורות שבתוך כרטסת הצאצא.
//
// ⚠️ ברירת המחדל היא *סדר הדורות של הצאצא בלבד* — טור אנכי אחד, שורש למעלה
// והצאצא למטה. עד כה הוצג כאן העץ המלא כשהשרשרת מודגשת ושאר מאות הצמתים
// מעומעמים מסביב; בכרטסת של אדם מסוים זה רעש בלבד — מסתיר את מה שבאמת רוצים
// לראות ומקשה על הקריאה.
//
// מה שהיה שימושי בעץ המלא לא אבד: ריחוף על דור מהשרשרת פותח חלונית פעולות —
// פתיחת אילן היוחסין של אותו ענף (הצומת וכל צאצאיו) בתוך אותו חלון, מיזוג
// כפילים, עריכה/הוספה/אימות/דחייה/מחיקה, סימון בן/חתן, וקפיצה לכרטסת המקושרת.
// ─────────────────────────────────────────────────────────────────────────────
export default function LineageBranchView({ nodeId, self }: {
  nodeId: string | null
  // ⚠️ הצאצא עצמו (הנרשם) אינו צומת בעץ הדורות — lineage_node_id שלו מצביע
  // לאב האחרון. כדי שיופיע בסוף העץ מזריקים אותו כצומת וירטואלי (status pending
  // = כתום, כי טרם אושר) שההורה שלו הוא nodeId. נטו-תצוגה: לא נשמר ולא נערך.
  self?: { name: string } | null
}) {
  const router = useRouter()
  const toast = useToast()
  const canAdd = useCan('lineage', 'add')
  const canEdit = useCan('lineage', 'edit')
  const canDelete = useCan('lineage', 'delete')

  const [allNodes, setAllNodes] = useState<LineageNode[]>([])
  const [linked, setLinked] = useState<Record<string, { id: string; name: string }[]>>({})
  const [loading, setLoading] = useState(true)
  // ⚠️ מזהה הצומת של הצאצא נשמר במצב ולא נקרא ישירות מה-prop: מיזוג עשוי למחוק
  // את הצומת הזה (הוא מתמזג לתוך אחר), והכרטסת עוברת אוטומטית לצומת שנשאר.
  // בלי זה השרשרת הייתה נעלמת מהמסך עד לרענון הדף.
  // ההפניה נשמרת ביחס ל-prop המקורי, כך שהיא מתאפסת מעצמה כשהכרטסת מצביעה
  // לצומת אחר — בלי אפקט סנכרון.
  const [selfMoved, setSelfMoved] = useState<{ from: string | null; to: string } | null>(null)
  const selfId = selfMoved && selfMoved.from === nodeId ? selfMoved.to : nodeId

  // ── מצב תצוגה ──
  // branchStack ריק = תצוגת סדר הדורות. אחרת — אילן היוחסין של הצומת האחרון
  // במחסנית (הצומת + כל צאצאיו), עם אפשרות לצלול פנימה ולחזור אחורה.
  const [branchStack, setBranchStack] = useState<string[]>([])
  const branchRootId = branchStack.length ? branchStack[branchStack.length - 1] : null

  const [zoom, setZoom] = useState(0.8)
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [openCardFor, setOpenCardFor] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  // צומת שממתין לאישור דחייה — דחייה מפילה במפל גם צאצאים וגם כרטסות
  const [rejectNode, setRejectNode] = useState<LineageNode | null>(null)
  const [formName, setFormName] = useState('')
  const [formRelation, setFormRelation] = useState<'son' | 'son_in_law' | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  // מיזוג ידני (בתוך אילן הענף) — סימון שני צמתים או יותר שהם אותו אדם
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeSel, setMergeSel] = useState<Set<string>>(new Set())
  const [keepId, setKeepId] = useState<string | null>(null)
  // מיזוג אחורנית גם כשהניסוח שונה — אם אלו אותו אדם, גם אבותיהם אותו אדם
  const [mergeUpApprox, setMergeUpApprox] = useState(true)

  const canvasRef = useRef<HTMLDivElement>(null)
  const [viewW, setViewW] = useState(760)
  const didCenter = useRef(false)
  const dragRef = useRef<{ startX: number; startY: number; scrollX: number; scrollY: number } | null>(null)
  const draggedRef = useRef(false)
  const zoomAnchor = useRef<{ px: number; py: number; offX: number; offY: number } | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showHover = useCallback((id: string) => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
    setHovered(id)
  }, [])
  const scheduleHideHover = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHovered(null), 280)
  }, [])
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current) }, [])

  // ── טעינת הנתונים ──
  // מקור אחיד עם עץ הניהול — כולל כל הסטטוסים (מאומת/ממתין/נדחה) והמשפחות
  // המקושרות לכל צומת. הדורות מנורמלים כך שהחתם סופר הוא דור 1, בדיוק כמו שם.
  const load = useCallback(async (spinner: boolean) => {
    if (spinner) setLoading(true)
    try {
      const r = await fetch('/api/admin/lineage', { cache: 'no-store' })
      const d = await r.json()
      const raw: LineageNode[] = d.nodes ?? []
      const minGen = raw.length ? Math.min(...raw.map(n => n.generation)) : 0
      const normalized = raw.map(n => ({ ...n, generation: n.generation - minGen + 1 }))
      // ── הזרקת הצאצא עצמו כצומת וירטואלי בקצה (כתום — טרם אושר) ──
      if (self?.name && nodeId) {
        const parent = normalized.find(n => n.id === nodeId)
        if (parent && !normalized.some(n => n.id === `self:${nodeId}`)) {
          normalized.push({
            id: `self:${nodeId}`, name: self.name, parent_id: nodeId,
            generation: parent.generation + 1, status: 'pending', relation: null,
          } as LineageNode)
        }
      }
      setAllNodes(normalized)
      setLinked(d.linked ?? {})
    } catch {}
    if (spinner) setLoading(false)
  }, [self?.name, nodeId])
  // נדחית בטיק אחד כדי לא לקרוא ל-setState סינכרונית בתוך אפקט (אותו דפוס
  // שנעשה בו שימוש במסך הייחוס המלא).
  useEffect(() => { const t = setTimeout(() => { void load(true) }, 0); return () => clearTimeout(t) }, [load])
  // ⚠️ load() מרענן רק את העץ עצמו (state מקומי). הצ'יפים בראש הדף (LineageChainChips)
  // מקבלים את הסטטוס כ-prop שמחושב פעם אחת ב-server component בזמן הרינדור — בלי
  // router.refresh() הם נשארים קפואים גם אחרי ששינוי נשמר, וסותרים את העץ שכבר
  // התעדכן. שני המקורות חייבים להסתנכרן יחד בכל שינוי.
  const refresh = useCallback(() => { void load(false); router.refresh() }, [load, router])

  const byId = useMemo(() => new Map(allNodes.map(n => [n.id, n])), [allNodes])
  const kidCount = useMemo(() => {
    const m = new Map<string, number>()
    allNodes.forEach(n => { if (n.parent_id) m.set(n.parent_id, (m.get(n.parent_id) ?? 0) + 1) })
    return m
  }, [allNodes])

  // שרשרת הייחוס של הצאצא — שורש → הצאצא
  //
  // 🔴 דרך ancestorChain ולא לולאה מקומית. הלולאה הקודמת ספרה צעדים
  // (guard < 80) בלי לזכור צמתים שכבר נראו, וכשנוצר מעגל בנתונים
  // (25.08 — מיזוג cascade שמיזג אב לתוך צאצא) היא רצה 80 פעם והציגה
  // את אותם שני שמות עד "דור 50".
  const chainResult = useMemo(() => ancestorChain(selfId, byId), [selfId, byId])
  const chainIds = useMemo(() => chainResult.chain.map(n => n.id), [chainResult])
  const chainSet = useMemo(() => new Set(chainIds), [chainIds])

  /** כל צאצאי הצומת בעץ המלא — להצגת היקף הדחייה לפני שמאשרים אותה. */
  const descendantIds = useCallback((rootId: string): string[] => {
    const childrenBy = new Map<string, string[]>()
    allNodes.forEach(n => { if (n.parent_id) { const a = childrenBy.get(n.parent_id) ?? []; a.push(n.id); childrenBy.set(n.parent_id, a) } })
    const out: string[] = []
    const stack = [...(childrenBy.get(rootId) ?? [])]
    let guard = 0
    while (stack.length && guard++ < 20_000) {
      const id = stack.pop()!
      out.push(id)
      for (const c of childrenBy.get(id) ?? []) stack.push(c)
    }
    return out
  }, [allNodes])

  // קבוצות כפילות — אותו אב, אותו דור, אותו שם מנורמל. בדיוק ההגדרה של מסך
  // הניהול: בני דודים באותו שם אינם כפילות; רק אותו אדם שנרשם פעמיים.
  const dupGroupOf = useCallback((id: string): LineageNode[] => {
    const n = byId.get(id)
    if (!n) return []
    const key = normName(n.name)
    if (!key) return []
    return allNodes.filter(x => x.parent_id === n.parent_id && x.generation === n.generation && normName(x.name) === key)
  }, [allNodes, byId])

  // ── פריסה ──
  // תצוגת שרשרת: טור אנכי אחד ממורכז ברוחב החלון. תצוגת ענף: פריסת עץ רגילה.
  const { positions, edges, w, h } = useMemo(() => {
    if (branchRootId && byId.has(branchRootId)) {
      // הצומת + כל צאצאיו. buildTree מזהה שורש לפי "האב אינו ברשימה",
      // ולכן די בסינון כדי שהצומת שבמוקד יהפוך לשורש התצוגה.
      const keep = new Set<string>([branchRootId])
      let grew = true
      while (grew) {
        grew = false
        for (const n of allNodes) if (n.parent_id && keep.has(n.parent_id) && !keep.has(n.id)) { keep.add(n.id); grew = true }
      }
      const pos = layoutTree(buildTree(allNodes.filter(n => keep.has(n.id))))
      const size = canvasSize(pos)
      return { positions: pos, edges: collectEdges(pos), w: size.w, h: size.h }
    }
    const chain = chainIds.map(id => byId.get(id)).filter(Boolean) as LineageNode[]
    const colW = Math.max(viewW / zoom, NW + PAD * 2)
    const cx = colW / 2
    const pos: Pos[] = chain.map((n, i) => {
      const y = PAD + i * (NH + VGAP)
      return { node: { ...n, children: [] }, x: cx - NW / 2, y, cx, cy: y + NH / 2 }
    })
    const eg = pos.slice(1).map((p, i) => ({ from: pos[i], to: p }))
    return { positions: pos, edges: eg, w: colW, h: pos.length ? PAD + pos.length * (NH + VGAP) : 400 }
  }, [branchRootId, allNodes, byId, chainIds, viewW, zoom])

  // רוחב אזור התצוגה — לצורך מרכוז הטור בתצוגת השרשרת
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const update = () => setViewW(el.clientWidth || 760)
    update()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [loading])

  // wheel zoom toward cursor
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault(); e.stopPropagation()
      setZoom(prev => {
        const next = Math.min(2.5, Math.max(0.35, +(prev - e.deltaY * 0.0015).toFixed(3)))
        if (next === prev) return prev
        const rect = el.getBoundingClientRect()
        const offX = e.clientX - rect.left, offY = e.clientY - rect.top
        zoomAnchor.current = { px: (el.scrollLeft + offX) / prev, py: (el.scrollTop + offY) / prev, offX, offY }
        return next
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [loading])

  useLayoutEffect(() => {
    const el = canvasRef.current, a = zoomAnchor.current
    if (!el || !a) return
    el.scrollLeft = a.px * zoom - a.offX
    el.scrollTop = a.py * zoom - a.offY
    zoomAnchor.current = null
  }, [zoom])

  // drag to pan
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      draggedRef.current = false
      dragRef.current = { startX: e.clientX, startY: e.clientY, scrollX: el.scrollLeft, scrollY: el.scrollTop }
      el.style.cursor = 'grabbing'
    }
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startX, dy = e.clientY - dragRef.current.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        draggedRef.current = true
        e.preventDefault()
        el.scrollLeft = dragRef.current.scrollX - dx
        el.scrollTop = dragRef.current.scrollY - dy
      }
    }
    const onUp = () => { dragRef.current = null; el.style.cursor = 'grab' }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [loading])

  // מרכוז ראשוני — ובכל מעבר בין תצוגת שרשרת לתצוגת ענף
  useEffect(() => { didCenter.current = false }, [branchRootId])
  useEffect(() => {
    if (!positions.length || didCenter.current) return
    const el = canvasRef.current
    if (!el) return
    didCenter.current = true
    requestAnimationFrame(() => {
      const c = canvasRef.current
      if (!c) return
      if (!branchRootId) { c.scrollLeft = Math.max(0, (w * zoom - c.clientWidth) / 2); c.scrollTop = 0; return }
      const root = positions.find(p => p.node.id === branchRootId)
      if (root) {
        c.scrollLeft = Math.max(0, root.cx * zoom - c.clientWidth / 2)
        c.scrollTop = 0
      }
    })
  }, [positions, w, zoom, branchRootId])

  // ── פעולות על צומת ──
  function closeModal() { setModal(null); setSaveErr(''); setFormName(''); setFormRelation(null) }

  async function patchStatus(node: LineageNode, status: 'verified' | 'pending' | 'rejected') {
    setAllNodes(prev => prev.map(n => n.id === node.id ? { ...n, status } : n))
    const res = await fetch('/api/admin/lineage', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ id: node.id, status }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      setAllNodes(prev => prev.map(n => n.id === node.id ? { ...n, status: node.status ?? 'pending' } : n))
      toast.error(`שגיאה בשמירה: ${err.error ?? res.status}`)
      return
    }
    void refresh()
  }

  async function patchRelation(node: LineageNode, relation: 'son' | 'son_in_law') {
    const next = node.relation === relation ? null : relation
    setAllNodes(prev => prev.map(n => n.id === node.id ? { ...n, relation: next } : n))
    const res = await fetch('/api/admin/lineage', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ id: node.id, relation: next }),
    })
    if (!res.ok) {
      setAllNodes(prev => prev.map(n => n.id === node.id ? { ...n, relation: node.relation ?? null } : n))
      toast.error('שגיאה בשמירת בן/חתן')
      return
    }
    void refresh()
  }

  async function saveEdit() {
    if (modal?.type !== 'edit' || !formName.trim()) return
    setSaving(true); setSaveErr('')
    try {
      const res = await fetch('/api/admin/lineage', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ id: modal.node.id, name: formName.trim(), relation: formRelation }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setSaveErr(d.error ?? 'שגיאה בשמירה'); setSaving(false); return }
      await refresh(); closeModal()
    } catch { setSaveErr('שגיאת רשת') }
    setSaving(false)
  }

  async function saveAdd() {
    if (modal?.type !== 'add' || !formName.trim()) return
    setSaving(true); setSaveErr('')
    try {
      const res = await fetch('/api/admin/lineage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name: formName.trim(), parent_id: modal.parentId, relation: formRelation }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setSaveErr(d.error ?? 'שגיאה בהוספה'); setSaving(false); return }
      await refresh(); closeModal()
    } catch { setSaveErr('שגיאת רשת') }
    setSaving(false)
  }

  async function doDelete() {
    if (modal?.type !== 'delete') return
    setSaving(true); setSaveErr('')
    try {
      const res = await fetch(`/api/admin/lineage?id=${modal.node.id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setSaveErr(d.error ?? 'שגיאה במחיקה'); setSaving(false); return }
      // הצומת שבמוקד נמחק — חוזרים לתצוגת השרשרת כדי לא להישאר על ענף שאינו קיים
      if (branchStack.includes(modal.node.id)) setBranchStack(s => s.slice(0, s.indexOf(modal.node.id)))
      await refresh(); closeModal()
    } catch { setSaveErr('שגיאת רשת') }
    setSaving(false)
  }

  // מיזוג — הכפילים מתמזגים אל הצומת שנשאר; ילדיהם והמשפחות המקושרות עוברים אליו
  async function doMerge() {
    if (modal?.type !== 'merge') return
    const keep = modal.keep, mergeIds = modal.others.map(n => n.id)
    if (!mergeIds.length) return
    setSaving(true); setSaveErr('')
    try {
      const res = await fetch('/api/admin/lineage/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ keepId: keep.id, mergeIds, cascadeUpApprox: mergeUpApprox }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setSaveErr(d.error ?? 'שגיאה במיזוג'); setSaving(false); return }
      toast.success(`מוזגו ${d.mergedCount ?? mergeIds.length} צמתים · ${d.reassignedChildren ?? 0} ילדים · ${d.reassignedBeneficiaries ?? 0} נרשמים`)
      // אם דווקא הצומת של הכרטסת הזו נמזג — הכרטסת עוברת לצומת שנשאר
      if (selfId && mergeIds.includes(selfId)) setSelfMoved({ from: nodeId, to: keep.id })
      setBranchStack(s => s.filter(id => !mergeIds.includes(id)))
      setMergeMode(false); setMergeSel(new Set()); setKeepId(null)
      await refresh(); closeModal()
    } catch { setSaveErr('שגיאת רשת') }
    setSaving(false)
  }

  function openBranch(id: string) {
    setBranchStack(s => (s[s.length - 1] === id ? s : [...s, id]))
    setHovered(null); setPinned(null); setMergeMode(false); setMergeSel(new Set()); setKeepId(null)
  }
  function backBranch() {
    setBranchStack(s => s.slice(0, -1))
    setHovered(null); setPinned(null); setMergeMode(false); setMergeSel(new Set()); setKeepId(null)
  }

  function toggleMergeSel(id: string) {
    setMergeSel(prev => {
      const s = new Set(prev)
      if (s.has(id)) { s.delete(id); setKeepId(k => (k === id ? null : k)) }
      else { s.add(id); setKeepId(k => k ?? id) }
      return s
    })
  }

  const mergeSelNodes = useMemo(() => allNodes.filter(n => mergeSel.has(n.id)), [allNodes, mergeSel])
  const effectiveKeepId = keepId && mergeSel.has(keepId)
    ? keepId
    : (mergeSelNodes.find(n => (n.status ?? 'verified') === 'verified')?.id ?? mergeSelNodes[0]?.id ?? null)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '20px 0', color: '#7C3AED' }}>
      <Loader2 size={16} className="animate-spin" /><span style={{ fontSize: 13 }}>טוען עץ דורות...</span>
    </div>
  )
  if (!allNodes.length) return (
    <div style={{ padding: 16, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>לא נמצאו נתוני שושלת</div>
  )
  if (!branchRootId && !chainIds.length) return (
    <div style={{ padding: 16, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
      לצאצא זה עדיין לא שויך צומת בעץ הדורות
    </div>
  )

  const branchRoot = branchRootId ? byId.get(branchRootId) : null

  return (
    <div style={{ direction: 'rtl' }}>
      {/* 🔴 אזהרת מעגל.
          התצוגה נעצרת בנקודת המעגל ומציגה שרשרת חלקית. בלי האזהרה היא
          נראית שלמה — וזו הטעיה גרועה מהצגת שגיאה: מי שמסתכל מסיק
          שהייחוס קצר מכפי שהוא, במקום לדעת שיש תקלה בנתונים. */}
      {chainResult.cycle && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8,
                      padding: '10px 12px', borderRadius: 10, background: '#FEF2F2',
                      border: '1.5px solid #FECACA', color: '#991B1B', fontSize: 12.5, lineHeight: 1.6 }}>
          <span style={{ fontSize: 15, lineHeight: 1 }}>⚠️</span>
          <span>
            <strong>נמצאה לולאה בשרשרת הדורות.</strong> השרשרת המוצגת חלקית ונעצרה
            בנקודת הלולאה. סביר שמיזוג שגוי חיבר אב-קדמון כצאצא של עצמו —
            ניתן לבטלו במסך עץ הדורות תחת "ביטול מיזוגים אחרונים".
          </span>
        </div>
      )}
      {/* סרגל עליון — מצב התצוגה + זום */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {branchRoot ? (
          <>
            <button type="button" onClick={backBranch}
              style={{ display: 'flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', borderRadius: 9, border: '1.5px solid #DDD6FE', background: '#F5F3FF', color: '#6D28D9', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              <ArrowRight size={13} /> {branchStack.length > 1 ? 'חזרה לענף הקודם' : 'חזרה לסדר הדורות'}
            </button>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#4C1D95', background: '#EDE9FE', borderRadius: 20, padding: '4px 12px' }}>
              🌳 אילן היוחסין של {branchRoot.name} · דור {branchRoot.generation}
            </span>
            {canEdit && (
              <button type="button"
                onClick={() => { setMergeMode(m => !m); setMergeSel(new Set()); setKeepId(null) }}
                style={{ height: 28, padding: '0 10px', borderRadius: 9, border: `1.5px solid ${mergeMode ? '#9333EA' : '#E2E8F0'}`, background: mergeMode ? '#9333EA' : '#fff', color: mergeMode ? '#fff' : '#7C3AED', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                {mergeMode ? 'סיום מיזוג' : '⚯ מזג ידנית'}
              </button>
            )}
            <button type="button" onClick={() => window.open(`/admin/lineage?focus=${branchRoot.id}`, '_blank', 'noopener')}
              style={{ display: 'flex', alignItems: 'center', gap: 5, height: 28, padding: '0 10px', borderRadius: 9, border: '1.5px solid #BAE6FD', background: '#fff', color: '#0369A1', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              <ExternalLink size={12} /> פתיחה במסך הייחוס
            </button>
          </>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700, color: '#64748B' }}>
            סדר הדורות של הצאצא · ריחוף על דור פותח את פעולותיו
          </span>
        )}
        <div style={{ display: 'flex', gap: 5, marginRight: 'auto' }}>
          <button type="button" onClick={() => setZoom(z => Math.min(2.5, z + 0.1))} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1', fontWeight: 700 }}>+</button>
          <button type="button" onClick={() => { setZoom(0.8); didCenter.current = false }} style={{ height: 26, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', fontSize: 10, cursor: 'pointer', padding: '0 7px', color: '#64748B', fontWeight: 600 }}>{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => setZoom(z => Math.max(0.35, z - 0.1))} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1', fontWeight: 700 }}>−</button>
        </div>
      </div>

      {mergeMode && (
        <div style={{ background: '#FAF5FF', border: '1.5px solid #E9D5FF', color: '#6B21A8', borderRadius: 12, padding: '7px 12px', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
          מצב מיזוג: סמנו 2 צמתים או יותר שהם אותו אדם · הצומת המסומן כ״נשאר״ יקלוט את הילדים והמשפחות
        </div>
      )}

      <div
        ref={canvasRef}
        dir="ltr"
        style={{
          overflow: 'auto', overflowAnchor: 'none', borderRadius: 14,
          // רקע קלף עדין — עקבי עם מסך הניהול
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(198,158,45,0.05), transparent 70%),' +
            'linear-gradient(170deg,#fdfbf5 0%,#f6f1e4 100%)',
          border: '1.5px solid #e6ddc8', height: 460, cursor: 'grab',
        }}
      >
        <div style={{ position: 'relative', width: w * zoom, height: (h + 120) * zoom, minWidth: '100%' }}>
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} width={w * zoom} height={(h + 120) * zoom}>
            {edges.map((e, i) => {
              const x1 = e.from.cx * zoom, y1 = (e.from.y + NH) * zoom
              const x2 = e.to.cx * zoom, y2 = e.to.y * zoom
              const mid = (y1 + y2) / 2
              const col = pal(e.from.node.generation).ring
              // חיבור אורתוגונלי מסודר (יורד→אופקי→יורד, פינות מעוגלות) — זהה למסך הניהול
              const r = Math.min(10 * zoom, Math.abs(x2 - x1) / 2, Math.abs(mid - y1))
              const dir = x2 >= x1 ? 1 : -1
              const d = Math.abs(x2 - x1) < 1
                ? `M${x1},${y1} L${x2},${y2}`
                : `M${x1},${y1} L${x1},${mid - r} Q${x1},${mid} ${x1 + dir * r},${mid} L${x2 - dir * r},${mid} Q${x2},${mid} ${x2},${mid + r} L${x2},${y2}`
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke="#fff" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
                  <path d={d} fill="none" stroke={col} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
                </g>
              )
            })}
          </svg>

          {positions.map(pos => {
            const node = pos.node
            const genPal = pal(node.generation)
            const st = node.status ?? 'verified'
            // ⚠️ צבע הצומת נגזר מ-genColor (lib/lineageDeviation) — אותו כלל בדיוק
            // כמו הצ'יפים בכרטסת: צומת pending בדורות 2–5 הוא *חריגה* וצבעו אדום,
            // לא כתום. קודם העץ צבע לפי status בלבד ולכן הראה כתום בעוד הצ'יפ אדום —
            // אותו צומת בשני צבעים. עכשיו מקור אמת אחד לצבע.
            const gColor = genColor(node.generation, asGenStatus(node.status))
            const p = st === 'rejected' || gColor === 'red'
              ? STATUS_NODE.rejected
              : gColor === 'orange'
                ? STATUS_NODE.pending
                : genPal
            // התג: חריגה (אדום) מקבל ⚠ כמו בצ'יפים; שאר המצבים לפי הסטטוס
            const badge = gColor === 'red' && st !== 'rejected'
              ? { glyph: '⚠', bg: '#DC2626' }
              : statusBadge(st)
            const isTarget = node.id === selfId
            const onChain = chainSet.has(node.id)
            // אותו עיקרון כמו בעץ הניהול: בן = צבע הדור המלא · חתן = אותו גוון, כהה יותר
            const relOverlay = node.relation === 'son_in_law' ? 'linear-gradient(rgba(0,0,0,0.30),rgba(0,0,0,0.30)), ' : ''
            const dupGroup = dupGroupOf(node.id)
            const isDup = dupGroup.length > 1
            const kids = kidCount.get(node.id) ?? 0
            const selForMerge = mergeSel.has(node.id)
            const open = !mergeMode && (pinned === node.id || hovered === node.id)
            const cards = linked[node.id] ?? []
            return (
              <div key={node.id}
                onMouseEnter={() => showHover(node.id)}
                onMouseLeave={scheduleHideHover}
                onClick={e => {
                  e.stopPropagation()
                  if (draggedRef.current) return
                  if (mergeMode) { toggleMergeSel(node.id); return }
                  setPinned(cur => (cur === node.id ? null : node.id))
                }}
                style={{
                  position: 'absolute', left: pos.x * zoom, top: pos.y * zoom,
                  width: NW * zoom, height: NH * zoom, borderRadius: 16 * zoom,
                  background: relOverlay + p.bg,
                  border: st === 'verified' ? 'none' : `${Math.max(1.5, 2 * zoom)}px dashed #fff`,
                  boxShadow: selForMerge
                    ? '0 0 0 3px #fff, 0 0 0 6px #9333EA, 0 12px 32px rgba(147,51,234,0.4)'
                    : isTarget
                      ? `0 0 0 3px #fff, 0 0 0 5.5px ${p.ring}, 0 12px 32px ${p.shadow}`
                      : branchRootId && onChain
                        ? `0 0 0 2px #fff, 0 0 0 4px ${p.ring}88, 0 4px 16px ${p.shadow}`
                        : `0 4px 16px ${p.shadow}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transform: isTarget ? 'scale(1.07)' : 'scale(1)',
                  zIndex: open ? 50 : isTarget ? 20 : 2, userSelect: 'none', cursor: 'pointer',
                }}>
                {/* תג סטטוס: ✓ ירוק=מאושר · ! כתום=ממתין לאימות · ✕ אדום=נדחה — גודל קבוע כדי שיהיה ברור בכל זום */}
                <div style={{
                  position: 'absolute', top: -9, left: -6,
                  background: badge.bg, color: '#fff', fontSize: 13, fontWeight: 900,
                  width: 20, height: 20, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff',
                  boxShadow: '0 1px 5px rgba(0,0,0,0.3)', zIndex: 25,
                }}>{badge.glyph}</div>
                <div style={{
                  position: 'absolute', top: -10 * zoom, right: 6 * zoom,
                  background: '#fff', color: p.ring, fontSize: Math.max(7, 9 * zoom), fontWeight: 900,
                  width: 20 * zoom, height: 20 * zoom, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${p.ring}`,
                }}>{node.generation}</div>
                {isDup && (
                  <div style={{
                    position: 'absolute', top: -11 * zoom, left: 20 * zoom,
                    background: '#F3E8FF', color: '#7E22CE', border: '1.5px solid #D8B4FE',
                    fontSize: Math.max(7, 8.5 * zoom), fontWeight: 900, padding: `${1 * zoom}px ${6 * zoom}px`,
                    borderRadius: 20, whiteSpace: 'nowrap', zIndex: 24,
                  }}>כפול ×{dupGroup.length}</div>
                )}
                {node.relation && (
                  <div style={{
                    position: 'absolute', bottom: -9 * zoom, right: 6 * zoom,
                    background: node.relation === 'son' ? '#DBEAFE' : '#FEF3C7',
                    color: node.relation === 'son' ? '#1E40AF' : '#92400E',
                    fontSize: Math.max(7, 8 * zoom), fontWeight: 800,
                    padding: `${0.5 * zoom}px ${7 * zoom}px`, borderRadius: 20,
                    border: `1px solid ${node.relation === 'son' ? '#93C5FD' : '#FCD34D'}`,
                  }}>{node.relation === 'son' ? 'בן' : 'חתן'}</div>
                )}
                <span style={{
                  color: '#fff', fontWeight: 700,
                  fontSize: Math.max(8, (node.name.length > 14 ? 10 : node.name.length > 10 ? 12 : 13) * zoom),
                  textAlign: 'center', direction: 'rtl', padding: `0 ${12 * zoom}px`, lineHeight: 1.3,
                  textShadow: '0 1px 3px rgba(0,0,0,0.3)', maxWidth: (NW - 14) * zoom, overflow: 'hidden',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                }}>{node.name}</span>

                {/* ── חלונית הפעולות של הדור ──
                    נפתחת בריחוף (ובלחיצה, כדי שתישאר פתוחה). padding-top שקוף
                    משמש "גשר" — מעבר העכבר מהקובייה לחלונית אינו מאבד את ה-hover. */}
                {open && (
                  <div onClick={e => e.stopPropagation()}
                    onMouseEnter={() => showHover(node.id)}
                    onMouseLeave={scheduleHideHover}
                    dir="rtl"
                    style={{
                      position: 'absolute', top: '100%', paddingTop: 12, left: '50%', transform: 'translateX(-50%)',
                      display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', zIndex: 60,
                    }}>
                    <div style={{
                      display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', width: 216,
                      background: '#fff', borderRadius: 16, padding: '9px 10px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.16)', border: '1px solid #E2E8F0',
                    }}>
                      <div style={{ fontSize: 11.5, fontWeight: 900, color: '#0F172A', textAlign: 'center', lineHeight: 1.3 }}>
                        {node.name}
                        <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#94A3B8', marginTop: 2 }}>
                          דור {node.generation} · {kids} ילדים
                        </span>
                      </div>

                      {/* אילן היוחסין של הענף — הצומת וכל צאצאיו, באותו חלון */}
                      {kids > 0 && node.id !== branchRootId && (
                        <button type="button" onClick={() => openBranch(node.id)}
                          title="הצג את הצומת הזה וכל צאצאיו"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', padding: '7px 10px', borderRadius: 10, background: '#7C3AED', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                          🌳 הצג אילן יוחסין של ענף זה
                        </button>
                      )}

                      {/* מיזוג כפילים — רק לצומת ששמו חוזר תחת אותו אב */}
                      {canEdit && isDup && (
                        <button type="button"
                          onClick={() => { setSaveErr(''); setModal({ type: 'merge', keep: node, others: dupGroup.filter(n => n.id !== node.id) }) }}
                          title="מזג את הכפילויות של שם זה תחת אותו אב"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', padding: '7px 10px', borderRadius: 10, background: '#9333EA', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: 'inherit' }}>
                          ⚯ מזג כפילים ({dupGroup.length})
                        </button>
                      )}

                      {/* מיזוג ידני — בתוך אילן הענף, שם רואים גם את שאר האחים */}
                      {canEdit && branchRootId && (
                        <button type="button"
                          onClick={() => { setMergeMode(true); setMergeSel(new Set([node.id])); setKeepId(node.id); setPinned(null); setHovered(null) }}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', padding: '6px 10px', borderRadius: 10, background: '#FAF5FF', color: '#7E22CE', border: '1.5px solid #E9D5FF', cursor: 'pointer', fontSize: 11.5, fontWeight: 800, fontFamily: 'inherit' }}>
                          ⚯ מיזוג ידני מצומת זה
                        </button>
                      )}

                      {/* הכרטסות המקושרות לצומת */}
                      {cards.length > 0 ? (
                        <div style={{ position: 'relative', width: '100%' }}
                          onMouseEnter={() => setOpenCardFor(node.id)}
                          onMouseLeave={() => setOpenCardFor(null)}>
                          <button type="button"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', padding: '7px 10px', borderRadius: 10, background: '#0EA5E9', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            <ExternalLink size={12} /> פתיחת הכרטסת{cards.length > 1 ? ` (${cards.length})` : ''}
                          </button>
                          {openCardFor === node.id && (
                            <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', paddingTop: 6, zIndex: 70 }}>
                              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,42,0.18)', overflow: 'hidden', width: 224 }}>
                                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                                  {cards.map((b, i) => (
                                    <div key={b.id} style={{ padding: '9px 10px', borderTop: i ? '1px solid #F1F5F9' : 'none' }}>
                                      <div style={{ fontSize: 11.5, fontWeight: 800, color: '#0F172A', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        <button type="button" onClick={() => router.push(`/admin/beneficiaries/${b.id}`)}
                                          style={{ width: '100%', background: '#0EA5E9', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 9px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                                          פתיחה בכרטיסייה זו
                                        </button>
                                        <button type="button" onClick={() => window.open(`/admin/beneficiaries/${b.id}`, '_blank', 'noopener')}
                                          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: '#fff', color: '#0369A1', border: '1.5px solid #BAE6FD', borderRadius: 8, padding: '7px 9px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                                          <ExternalLink size={12} /> כרטיסייה חדשה
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ width: '100%', textAlign: 'center', padding: '6px 10px', borderRadius: 10, background: '#F8FAFC', border: '1px dashed #CBD5E1', color: '#94A3B8', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                          אינו רשום עדיין בצאצאים
                        </div>
                      )}

                      {/* ── סטטוס הדור — עריכה ישירות מכאן ──
                          שלושת המצבים גלויים תמיד והנוכחי מסומן. הסטטוס קובע גם
                          את סטטוס הכרטסת המקושרת וגם אם הדור יוצג לנרשמים הבאים
                          (בבורר סדר הדורות מוצגים מאומתים בלבד). */}
                      {canEdit && (
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', gap: 4, width: '100%' }}>
                            {([
                              ['verified', '✓ מאושר', '#16A34A', '#DCFCE7'],
                              ['pending', '⏳ ממתין', '#B45309', '#FEF3C7'],
                              ['rejected', '✕ נדחה', '#DC2626', '#FEE2E2'],
                            ] as const).map(([v, l, fg, bg]) => {
                              const on = st === v
                              return (
                                <button key={v} type="button"
                                  onClick={() => {
                                    if (on) return
                                    if (v === 'rejected') { setRejectNode(node); return }
                                    void patchStatus(node, v)
                                  }}
                                  style={{ flex: 1, padding: '5px 0', borderRadius: 9, background: on ? fg : bg, color: on ? '#fff' : fg, border: `1.5px solid ${on ? fg : fg + '33'}`, cursor: on ? 'default' : 'pointer', fontSize: 10.5, fontWeight: 800, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                  {l}
                                </button>
                              )
                            })}
                          </div>
                          <div style={{ fontSize: 9.5, color: '#94A3B8', textAlign: 'center', fontWeight: 600, lineHeight: 1.4 }}>
                            משפיע על הכרטסת המקושרת ועל הצגת הדור לנרשמים
                          </div>
                        </div>
                      )}

                      {/* שורת אייקונים — עריכה · הוספת ילד · מחיקה */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[
                          ...(canEdit ? [{ icon: <Pencil size={13} />, color: p.ring, bg: '#F8FAFC', fn: () => { setFormName(node.name); setFormRelation(node.relation ?? null); setSaveErr(''); setModal({ type: 'edit', node }) }, title: 'ערוך' }] : []),
                          ...(canAdd ? [{ icon: <Plus size={14} />, color: '#059669', bg: '#ECFDF5', fn: () => { setFormName(''); setFormRelation(null); setSaveErr(''); setModal({ type: 'add', parentId: node.id, parentName: node.name }) }, title: 'הוסף ילד' }] : []),
                          ...(canDelete ? [{ icon: <Trash2 size={13} />, color: '#64748B', bg: '#F1F5F9', fn: () => { setSaveErr(''); setModal({ type: 'delete', node }) }, title: 'מחק' }] : []),
                        ].map((b, i) => (
                          <button key={i} type="button" onClick={b.fn} title={b.title}
                            style={{ width: 32, height: 32, borderRadius: '50%', background: b.bg, color: b.color, border: `1.5px solid ${b.color}33`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{b.icon}</button>
                        ))}
                      </div>

                      {/* בן/חתן — סימון מהיר (לכל צומת שאינו השורש) */}
                      {canEdit && node.parent_id && (
                        <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                          {([['son', 'בן', '#1E40AF', '#BFDBFE', '#EFF6FF'], ['son_in_law', 'חתן', '#92400E', '#FDE68A', '#FFFBEB']] as const).map(([v, l, fg, selBg, bg]) => (
                            <button key={v} type="button" onClick={() => { void patchRelation(node, v) }} title={`סמן ${l}`}
                              style={{ flex: 1, padding: '5px 0', borderRadius: 9, background: node.relation === v ? selBg : bg, color: fg, border: `1.5px solid ${node.relation === v ? fg : fg + '33'}`, cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: 'inherit' }}>{l}</button>
                          ))}
                        </div>
                      )}

                      <button type="button" onClick={() => window.open(`/admin/lineage?focus=${node.id}`, '_blank', 'noopener')}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', padding: '6px 10px', borderRadius: 10, background: '#fff', color: '#475569', border: '1.5px solid #E2E8F0', cursor: 'pointer', fontSize: 11, fontWeight: 800, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                        <ExternalLink size={11} /> פתיחה במסך הייחוס המלא
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* בר מיזוג צף — נבחרו צמתים */}
      {mergeMode && mergeSel.size > 0 && (
        <div style={{ marginTop: 8, background: '#fff', border: '1.5px solid #E9D5FF', borderRadius: 14, padding: '10px 12px', boxShadow: '0 6px 20px rgba(147,51,234,0.12)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#6B21A8', marginBottom: 7 }}>נבחרו {mergeSel.size} צמתים · מי נשאר?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {mergeSelNodes.map(n => (
              <button key={n.id} type="button" onClick={() => setKeepId(n.id)}
                style={{ padding: '5px 10px', borderRadius: 9, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', border: `1.5px solid ${effectiveKeepId === n.id ? '#9333EA' : '#E2E8F0'}`, background: effectiveKeepId === n.id ? '#9333EA' : '#fff', color: effectiveKeepId === n.id ? '#fff' : '#475569' }}>
                {effectiveKeepId === n.id ? '★ ' : ''}{n.name}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={mergeSel.size < 2 || !effectiveKeepId}
              onClick={() => {
                const keep = mergeSelNodes.find(n => n.id === effectiveKeepId)
                if (!keep) return
                setSaveErr(''); setModal({ type: 'merge', keep, others: mergeSelNodes.filter(n => n.id !== keep.id) })
              }}
              style={{ background: mergeSel.size < 2 ? '#E9D5FF' : '#9333EA', color: '#fff', border: 'none', borderRadius: 10, padding: '7px 16px', fontSize: 12, fontWeight: 800, cursor: mergeSel.size < 2 ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              בצע מיזוג
            </button>
            <button type="button" onClick={() => { setMergeSel(new Set()); setKeepId(null) }}
              style={{ background: '#fff', color: '#64748B', border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              נקה בחירה
            </button>
          </div>
        </div>
      )}

      <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 5, textAlign: 'center' }}>
        {branchRootId
          ? 'אילן היוחסין של הענף · ריחוף על צומת פותח פעולות · גלגל עכבר להגדלה · גרירה להזזה'
          : 'סדר הדורות של הצאצא בלבד · ריחוף על דור פותח פעולות ואילן יוחסין של הענף'}
      </p>

      {/* ── מודאלים ── */}
      <Modal open={modal?.type === 'edit'} onClose={closeModal} title="עריכת דור" size="sm"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
            <button type="button" onClick={() => { void saveEdit() }} disabled={saving || !formName.trim()}
              style={{ background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 800, cursor: saving ? 'default' : 'pointer', opacity: saving || !formName.trim() ? 0.6 : 1, fontFamily: 'inherit' }}>שמירה</button>
            <button type="button" onClick={closeModal} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>ביטול</button>
          </div>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="שם"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 14, fontFamily: 'inherit' }} />
          <RelationRow value={formRelation} onChange={setFormRelation} />
          {saveErr && <p style={{ color: '#DC2626', fontSize: 12, fontWeight: 700, margin: 0 }}>{saveErr}</p>}
        </div>
      </Modal>

      <Modal open={modal?.type === 'add'} onClose={closeModal} title={modal?.type === 'add' ? `הוספת דור תחת ${modal.parentName}` : 'הוספת דור'} size="sm"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
            <button type="button" onClick={() => { void saveAdd() }} disabled={saving || !formName.trim()}
              style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 800, cursor: saving ? 'default' : 'pointer', opacity: saving || !formName.trim() ? 0.6 : 1, fontFamily: 'inherit' }}>הוספה</button>
            <button type="button" onClick={closeModal} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>ביטול</button>
          </div>
        }>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="שם הדור החדש"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 14, fontFamily: 'inherit' }} />
          <RelationRow value={formRelation} onChange={setFormRelation} />
          {saveErr && <p style={{ color: '#DC2626', fontSize: 12, fontWeight: 700, margin: 0 }}>{saveErr}</p>}
        </div>
      </Modal>

      <Modal open={modal?.type === 'delete'} onClose={closeModal} title="מחיקת דור" size="sm"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
            <button type="button" onClick={() => { void doDelete() }} disabled={saving}
              style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 800, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit' }}>מחיקה</button>
            <button type="button" onClick={closeModal} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>ביטול</button>
          </div>
        }>
        <p style={{ fontSize: 13, color: '#475569', margin: 0, lineHeight: 1.6 }}>
          למחוק את <strong>{modal?.type === 'delete' ? modal.node.name : ''}</strong> מעץ הדורות?
        </p>
        {saveErr && <p style={{ color: '#DC2626', fontSize: 12, fontWeight: 700, marginTop: 8 }}>{saveErr}</p>}
      </Modal>

      {/* אישור דחייה — ההיקף מוצג לפני הלחיצה ולא מתגלה אחריה */}
      <Modal open={!!rejectNode} onClose={() => setRejectNode(null)} title="דחיית דור" size="sm"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
            <button type="button" onClick={() => { const n = rejectNode; setRejectNode(null); if (n) void patchStatus(n, 'rejected') }}
              style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>דחה</button>
            <button type="button" onClick={() => setRejectNode(null)} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>ביטול</button>
          </div>
        }>
        {rejectNode && (() => {
          const kids = descendantIds(rejectNode.id)
          const families = [rejectNode.id, ...kids].reduce((s, nid) => s + (linked[nid]?.length ?? 0), 0)
          return (
            <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 8px' }}>
                לסמן את <strong style={{ color: '#0F172A' }}>{rejectNode.name}</strong> כ<strong style={{ color: '#DC2626' }}>נדחה</strong>?
              </p>
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 11, padding: '10px 13px', fontSize: 12.5, color: '#991B1B', lineHeight: 1.7 }}>
                {kids.length > 0 && <>· {kids.length} דורות שמתחתיו יידחו גם הם<br /></>}
                {families > 0 && <>· {families} כרטסות משפחה מקושרות יעברו לסטטוס &quot;נדחה&quot;<br /></>}
                · הדור לא יוצג יותר לנרשמים בבורר סדר הדורות
              </div>
            </div>
          )
        })()}
      </Modal>

      <Modal open={modal?.type === 'merge'} onClose={closeModal} title="אישור מיזוג צמתים" size="sm"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start' }}>
            <button type="button" onClick={() => { void doMerge() }} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#9333EA', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 18px', fontSize: 13, fontWeight: 800, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit' }}>
              {saving && <Loader2 size={13} className="animate-spin" />} מזג
            </button>
            <button type="button" onClick={closeModal} style={{ background: '#F1F5F9', color: '#475569', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>ביטול</button>
          </div>
        }>
        {modal?.type === 'merge' && (
          <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.7 }}>
            <p style={{ margin: '0 0 8px' }}>
              הצמתים הבאים ימוזגו אל <strong style={{ color: '#6B21A8' }}>{modal.keep.name}</strong>:
            </p>
            <ul style={{ margin: '0 0 10px', paddingRight: 18 }}>
              {modal.others.map(n => <li key={n.id} style={{ fontWeight: 700 }}>{n.name}</li>)}
            </ul>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#FAF5FF', border: '1.5px solid #E9D5FF', borderRadius: 11, padding: '9px 12px', cursor: 'pointer', margin: '0 0 10px' }}>
              <input type="checkbox" checked={mergeUpApprox} onChange={e => setMergeUpApprox(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: '#9333EA', cursor: 'pointer', marginTop: 2 }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#4C1D95' }}>
                למזג גם את הדורות שמעל כשהניסוח שונה
                <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#7C3AED', marginTop: 3, lineHeight: 1.5 }}>
                  אם אלו אותו אדם — גם אבותיהם אותו אדם. הניסוח המפורט הוא שיישאר.
                </span>
              </span>
            </label>
            <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>
              הילדים והמשפחות המשויכות יעברו לצומת שנשאר, והכפילים יימחקו. פעולה זו ניתנת לביטול ממרכז המיזוגים.
            </p>
            {saveErr && <p style={{ color: '#DC2626', fontSize: 12, fontWeight: 700, marginTop: 8 }}>{saveErr}</p>}
          </div>
        )}
      </Modal>
    </div>
  )
}

// בורר בן/חתן לשימוש במודאלים
function RelationRow({ value, onChange }: { value: 'son' | 'son_in_law' | null; onChange: (v: 'son' | 'son_in_law' | null) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B' }}>קשר להורה (הדור הקודם)</label>
      <div style={{ display: 'flex', gap: 8 }}>
        {([['son', 'בן', '#EFF6FF', '#1E40AF', '#93C5FD'], ['son_in_law', 'חתן', '#FFFBEB', '#92400E', '#FCD34D']] as const).map(([v, l, bg, fg, br]) => (
          <button key={v} type="button" onClick={() => onChange(value === v ? null : v)}
            style={{ flex: 1, padding: '8px 0', borderRadius: 10, background: value === v ? bg : '#fff', color: fg, border: `1.5px solid ${value === v ? br : '#E2E8F0'}`, fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{l}</button>
        ))}
      </div>
    </div>
  )
}
