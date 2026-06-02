'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, RefreshCw, Loader2, ChevronRight, ChevronDown, Pencil, Trash2, X, Users } from 'lucide-react'

// ─── Types ───

interface LineageNode {
  id: string
  name: string
  generation: number
  parent_id: string | null
}

interface TreeNode extends LineageNode {
  children: TreeNode[]
}

interface Positioned {
  node: TreeNode
  x: number; y: number; cx: number; cy: number
}

// ─── Tree layout ───

const NW = 172, NH = 58, HGAP = 48, VGAP = 96, PAD = 72

function buildTree(flat: LineageNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  flat.forEach(n => map.set(n.id, { ...n, children: [] }))
  const roots: TreeNode[] = []
  flat.forEach(n => {
    const node = map.get(n.id)!
    if (n.parent_id && map.has(n.parent_id)) map.get(n.parent_id)!.children.push(node)
    else roots.push(node)
  })
  return roots
}

function subtreeW(n: TreeNode): number {
  return n.children.length ? n.children.reduce((s, c) => s + subtreeW(c), 0) : NW + HGAP
}

function layoutTree(roots: TreeNode[]): Positioned[] {
  const result: Positioned[] = []
  function place(n: TreeNode, x: number, y: number) {
    const sw = subtreeW(n), cx = x + sw / 2
    result.push({ node: n, x: cx - NW / 2, y, cx, cy: y + NH / 2 })
    let cx2 = x
    n.children.forEach(c => { place(c, cx2, y + NH + VGAP); cx2 += subtreeW(c) })
  }
  let sx = PAD
  roots.forEach(r => { place(r, sx, PAD); sx += subtreeW(r) })
  return result
}

function canvasSize(pos: Positioned[]) {
  if (!pos.length) return { w: 800, h: 400 }
  return { w: Math.max(...pos.map(p => p.x + NW)) + PAD, h: Math.max(...pos.map(p => p.y + NH)) + PAD }
}

function collectEdges(positions: Positioned[]) {
  const byId = new Map(positions.map(p => [p.node.id, p]))
  return positions.flatMap(p =>
    p.node.children.map(c => { const cp = byId.get(c.id); return cp ? { from: p, to: cp } : null })
      .filter(Boolean) as { from: Positioned; to: Positioned }[]
  )
}

// ─── Colors ───

const PALETTE = [
  { bg: 'linear-gradient(135deg,#7C3AED 0%,#5B21B6 100%)', ring: '#7C3AED', shadow: 'rgba(124,58,237,0.38)', light: '#F5F0FF', text: '#5B21B6' },
  { bg: 'linear-gradient(135deg,#2563EB 0%,#1E40AF 100%)', ring: '#2563EB', shadow: 'rgba(37,99,235,0.32)',  light: '#EFF6FF', text: '#1E40AF' },
  { bg: 'linear-gradient(135deg,#0891B2 0%,#0E7490 100%)', ring: '#0891B2', shadow: 'rgba(8,145,178,0.32)',  light: '#ECFEFF', text: '#0E7490' },
  { bg: 'linear-gradient(135deg,#059669 0%,#047857 100%)', ring: '#059669', shadow: 'rgba(5,150,105,0.32)',  light: '#ECFDF5', text: '#047857' },
  { bg: 'linear-gradient(135deg,#D97706 0%,#B45309 100%)', ring: '#D97706', shadow: 'rgba(217,119,6,0.32)',  light: '#FFFBEB', text: '#B45309' },
  { bg: 'linear-gradient(135deg,#DB2777 0%,#BE185D 100%)', ring: '#DB2777', shadow: 'rgba(219,39,119,0.32)', light: '#FDF2F8', text: '#BE185D' },
]
const pal = (g: number) => PALETTE[g % PALETTE.length]

// ─── Modal ───

type ModalState =
  | { type: 'edit';   node: LineageNode }
  | { type: 'add';    parentId: string | null; parentName: string }
  | { type: 'delete'; node: TreeNode }
  | null

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,5,25,0.55)', backdropFilter: 'blur(6px)', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 22, width: '100%', maxWidth: 400, boxShadow: '0 32px 72px rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.8)' }} dir="rtl" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 16px', borderBottom: '1px solid #F1F5F9' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0F172A' }}>{title}</h2>
          <button onClick={onClose} style={{ background: '#F1F5F9', border: 'none', cursor: 'pointer', color: '#64748B', width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={15} /></button>
        </div>
        <div style={{ padding: '18px 22px 22px' }}>{children}</div>
      </div>
    </div>
  )
}

function MBtn({ label, color, onClick, loading }: { label: string; color: string; onClick: () => void; loading?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, background: color, color: '#fff', border: 'none', borderRadius: 11, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.65 : 1, fontFamily: 'inherit', transition: 'opacity .15s' }}>
      {loading && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
      {label}
    </button>
  )
}

// ─── Tree view ───

function TreeView({ nodes, onRefresh }: { nodes: LineageNode[]; onRefresh: () => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  const positions = useMemo(() => layoutTree(buildTree(nodes)), [nodes])
  const edges = useMemo(() => collectEdges(positions), [positions])
  const { w, h } = useMemo(() => canvasSize(positions), [positions])

  function close() { setModal(null); setSaveErr('') }

  async function handleSave() {
    if (!formName.trim()) { setSaveErr('נא להזין שם'); return }
    setSaving(true); setSaveErr('')
    try {
      if (modal?.type === 'edit') {
        await fetch('/api/admin/lineage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: modal.node.id, name: formName }) })
      } else if (modal?.type === 'add') {
        await fetch('/api/admin/lineage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formName, parent_id: modal.parentId }) })
      }
      onRefresh(); close()
    } catch { setSaveErr('שגיאה בשמירה') }
    setSaving(false)
  }

  async function handleDelete() {
    if (modal?.type !== 'delete') return
    setSaving(true)
    try {
      await fetch(`/api/admin/lineage?id=${modal.node.id}`, { method: 'DELETE' })
      if (selected === modal.node.id) setSelected(null)
      onRefresh(); close()
    } catch { setSaveErr('שגיאה במחיקה') }
    setSaving(false)
  }

  const selPos = selected ? positions.find(p => p.node.id === selected) ?? null : null

  if (!nodes.length) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 320, gap: 18, color: '#94A3B8' }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg,#F5F0FF,#EFF6FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #C4B5FD' }}>
        <Users size={30} style={{ color: '#7C3AED', opacity: 0.5 }} />
      </div>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#64748B' }}>אין צמתים בעץ עדיין</p>
      <button onClick={() => { setFormName(''); setModal({ type: 'add', parentId: null, parentName: '' }) }} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'linear-gradient(135deg,#7C3AED,#5B21B6)', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(124,58,237,0.4)' }}>
        <Plus size={16} /> הוסף שורש ראשון
      </button>
    </div>
  )

  return (
    <>
      {/* canvas */}
      <div style={{ overflowX: 'auto', overflowY: 'auto', borderRadius: 18, background: '#FAFBFF', border: '1.5px solid #E8E0F5', boxShadow: '0 4px 32px rgba(109,40,217,0.07)', backgroundImage: 'radial-gradient(circle,#D8D0EE 1px,transparent 1px)', backgroundSize: '26px 26px', backgroundPosition: '13px 13px', minHeight: 280 }}>
        <div style={{ position: 'relative', width: w, height: h + 60, minWidth: '100%' }}>
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} width={w} height={h + 60}>
            <defs>
              {PALETTE.map((p, i) => (
                <linearGradient key={i} id={`edge-grad-${i}`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={p.ring} stopOpacity="0.5" />
                  <stop offset="100%" stopColor={PALETTE[(i + 1) % PALETTE.length].ring} stopOpacity="0.3" />
                </linearGradient>
              ))}
            </defs>
            {edges.map((e, i) => {
              const x1 = e.from.cx, y1 = e.from.y + NH, x2 = e.to.cx, y2 = e.to.y
              const mid = (y1 + y2) / 2
              const gradId = `edge-grad-${e.from.node.generation % PALETTE.length}`
              return (
                <path key={i}
                  d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`}
                  fill="none"
                  stroke={`url(#${gradId})`}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              )
            })}
          </svg>

          {positions.map(pos => {
            const p = pal(pos.node.generation)
            const isSel = selected === pos.node.id
            return (
              <div
                key={pos.node.id}
                onClick={() => setSelected(prev => prev === pos.node.id ? null : pos.node.id)}
                style={{
                  position: 'absolute', left: pos.x, top: pos.y,
                  width: NW, height: NH, borderRadius: 16,
                  background: p.bg,
                  boxShadow: isSel
                    ? `0 0 0 3px #fff, 0 0 0 5.5px ${p.ring}, 0 12px 32px ${p.shadow}`
                    : `0 4px 18px ${p.shadow}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  transform: isSel ? 'scale(1.07) translateY(-2px)' : 'scale(1)',
                  transition: 'box-shadow .2s, transform .2s',
                  zIndex: isSel ? 20 : 2, userSelect: 'none',
                }}>
                {/* generation badge */}
                <div style={{
                  position: 'absolute', top: -10, right: 6,
                  background: '#fff', color: p.ring,
                  fontSize: 10, fontWeight: 900,
                  width: 22, height: 22, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 2px 8px ${p.shadow}`,
                  border: `2px solid ${p.ring}`,
                }}>{pos.node.generation + 1}</div>

                {/* name */}
                <span style={{
                  color: '#fff', fontWeight: 700,
                  fontSize: pos.node.name.length > 14 ? 11 : pos.node.name.length > 10 ? 13 : 14,
                  textAlign: 'center', direction: 'rtl',
                  padding: '0 16px', lineHeight: 1.35,
                  textShadow: '0 1px 4px rgba(0,0,0,0.3)',
                  maxWidth: NW - 16,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical' as const,
                }}>{pos.node.name}</span>

                {/* children count chip */}
                {pos.node.children.length > 0 && (
                  <div style={{
                    position: 'absolute', bottom: -10, left: 6,
                    background: 'rgba(255,255,255,0.2)',
                    border: '1.5px solid rgba(255,255,255,0.5)',
                    color: '#fff', fontSize: 9, fontWeight: 800,
                    padding: '1px 7px', borderRadius: 20,
                    backdropFilter: 'blur(4px)',
                  }}>{pos.node.children.length} ילדים</div>
                )}

                {/* actions strip */}
                {isSel && (
                  <div onClick={e => e.stopPropagation()} style={{
                    position: 'absolute', bottom: -50,
                    display: 'flex', gap: 6,
                    background: '#fff', borderRadius: 22,
                    padding: '6px 10px',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.14)',
                    border: '1px solid #E2E8F0', zIndex: 30,
                  }}>
                    {[
                      { icon: <Pencil size={12} />, color: p.ring, bg: p.light, fn: () => { setFormName(pos.node.name); setModal({ type: 'edit', node: pos.node }) } },
                      { icon: <Plus size={13} />, color: '#059669', bg: '#ECFDF5', fn: () => { setFormName(''); setModal({ type: 'add', parentId: pos.node.id, parentName: pos.node.name }) } },
                      { icon: <X size={12} />, color: '#DC2626', bg: '#FEF2F2', fn: () => setModal({ type: 'delete', node: pos.node }) },
                    ].map((b, i) => (
                      <button key={i} onClick={b.fn} style={{ width: 30, height: 30, borderRadius: '50%', background: b.bg, color: b.color, border: `1.5px solid ${b.color}33`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .1s' }}>{b.icon}</button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* selected info panel */}
      {selPos && (
        <div style={{ marginTop: 16, background: '#fff', borderRadius: 16, border: `2px solid ${pal(selPos.node.generation).ring}22`, padding: '16px 20px', boxShadow: `0 4px 24px ${pal(selPos.node.generation).shadow}`, direction: 'rtl', borderTop: `4px solid ${pal(selPos.node.generation).ring}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>צומת נבחר</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>{selPos.node.name}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4, display: 'flex', gap: 10 }}>
                <span style={{ background: pal(selPos.node.generation).light, color: pal(selPos.node.generation).text, padding: '2px 10px', borderRadius: 20, fontWeight: 700 }}>דור {selPos.node.generation + 1}</span>
                <span>{selPos.node.children.length} ילדים</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { label: 'עריכה',     fn: () => { setFormName(selPos.node.name); setModal({ type: 'edit', node: selPos.node }) }, color: pal(selPos.node.generation).ring, bg: pal(selPos.node.generation).light },
                { label: 'הוסף ילד', fn: () => { setFormName(''); setModal({ type: 'add', parentId: selPos.node.id, parentName: selPos.node.name }) }, color: '#059669', bg: '#ECFDF5' },
                { label: 'מחיקה',     fn: () => setModal({ type: 'delete', node: selPos.node }), color: '#DC2626', bg: '#FEF2F2' },
              ].map(b => (
                <button key={b.label} onClick={b.fn} style={{ background: b.bg, color: b.color, border: `1.5px solid ${b.color}22`, borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity .15s' }}>{b.label}</button>
              ))}
            </div>
          </div>
          {selPos.node.children.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, marginBottom: 7, letterSpacing: '0.05em' }}>ילדים:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selPos.node.children.map(c => (
                  <button key={c.id} onClick={() => setSelected(c.id)} style={{ padding: '5px 14px', borderRadius: 20, border: 'none', background: pal(c.generation).bg, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', direction: 'rtl', boxShadow: `0 2px 8px ${pal(c.generation).shadow}`, transition: 'opacity .15s' }}>{c.name}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* floating add root */}
      <button onClick={() => { setFormName(''); setModal({ type: 'add', parentId: null, parentName: '' }) }} title="הוסף שורש" style={{ position: 'fixed', bottom: 28, left: 28, width: 50, height: 50, borderRadius: '50%', background: 'linear-gradient(135deg,#7C3AED,#5B21B6)', color: '#fff', border: 'none', fontSize: 26, fontWeight: 700, cursor: 'pointer', zIndex: 50, boxShadow: '0 6px 24px rgba(124,58,237,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>

      {/* modals */}
      {modal?.type === 'edit' && (
        <Modal title={`עריכת: ${modal.node.name}`} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} style={{ border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit', background: '#FAFBFF' }} />
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="שמור" color="#7C3AED" onClick={handleSave} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'add' && (
        <Modal title={modal.parentId ? `הוסף ילד ל: ${modal.parentName}` : 'הוסף שורש חדש'} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="הכנס שם..." style={{ border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit', background: '#FAFBFF' }} />
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="הוסף" color="#059669" onClick={handleSave} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'delete' && (
        <Modal title="מחיקת צומת" onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.6 }}>האם למחוק את <strong style={{ color: '#0F172A' }}>{modal.node.name}</strong>?</p>
            {(modal.node.children?.length ?? 0) > 0 && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 11, padding: '11px 14px', fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
                שים לב: {modal.node.children.length} ילדים יאבדו את הקישור להורה זה.
              </div>
            )}
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="מחק" color="#DC2626" onClick={handleDelete} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

// ─── Table view ───

function TableView({ nodes, onAdd, onEdit, onDelete }: {
  nodes: LineageNode[]
  onAdd: (parentId: string | null, parentName: string) => void
  onEdit: (node: LineageNode) => void
  onDelete: (node: LineageNode) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const roots = useMemo(() => buildTree(nodes), [nodes])
  const childCount = useMemo(() => {
    const map = new Map<string, number>()
    nodes.forEach(n => { if (n.parent_id) map.set(n.parent_id, (map.get(n.parent_id) ?? 0) + 1) })
    return map
  }, [nodes])

  function toggle(id: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function renderRows(node: TreeNode, depth: number): React.ReactNode {
    const p = pal(node.generation)
    const hasChildren = node.children.length > 0
    const isExpanded = expanded.has(node.id)
    return (
      <div key={node.id}>
        <div
          style={{ display: 'flex', alignItems: 'center', padding: '11px 18px', borderBottom: '1px solid #F1F5F9', direction: 'rtl', gap: 10, background: '#fff', transition: 'background .12s' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#FAFAFE')}
          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
          <div style={{ width: depth * 26, flexShrink: 0 }} />
          <button onClick={() => toggle(node.id)} style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hasChildren ? p.light : 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default', color: p.ring, flexShrink: 0, borderRadius: 6 }}>
            {hasChildren ? (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span style={{ width: 13 }} />}
          </button>
          <div style={{ width: 9, height: 9, borderRadius: '50%', background: p.ring, flexShrink: 0, boxShadow: `0 0 0 3px ${p.light}` }} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{node.name}</span>
          <div style={{ padding: '3px 12px', borderRadius: 20, background: p.light, color: p.text, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>דור {node.generation + 1}</div>
          <div style={{ minWidth: 64, textAlign: 'center', fontSize: 12, color: '#94A3B8', flexShrink: 0 }}>
            {childCount.get(node.id) ? `${childCount.get(node.id)} ילדים` : '—'}
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button onClick={() => onAdd(node.id, node.name)} title="הוסף ילד" style={{ width: 30, height: 30, borderRadius: 8, background: '#ECFDF5', border: '1.5px solid #BBF7D0', color: '#059669', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={13} /></button>
            <button onClick={() => onEdit(node)} title="עריכה" style={{ width: 30, height: 30, borderRadius: 8, background: p.light, border: `1.5px solid ${p.ring}33`, color: p.ring, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={12} /></button>
            <button onClick={() => onDelete(node)} title="מחיקה" style={{ width: 30, height: 30, borderRadius: 8, background: '#FEF2F2', border: '1.5px solid #FECACA', color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={12} /></button>
          </div>
        </div>
        {isExpanded && node.children.map(c => renderRows(c, depth + 1))}
      </div>
    )
  }

  return (
    <div style={{ borderRadius: 18, border: '1.5px solid #E8E0F5', overflow: 'hidden', background: '#fff', boxShadow: '0 4px 24px rgba(109,40,217,0.06)' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '11px 18px', background: 'linear-gradient(135deg,#F8F6FF,#F0EDFF)', borderBottom: '1px solid #E8E0F5', direction: 'rtl', gap: 10 }}>
        <div style={{ width: 48, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 800, color: '#7C3AED', letterSpacing: '0.04em' }}>שם</span>
        <span style={{ minWidth: 80, textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#7C3AED', flexShrink: 0 }}>דור</span>
        <span style={{ minWidth: 64, textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#7C3AED', flexShrink: 0 }}>ילדים</span>
        <span style={{ width: 104, flexShrink: 0 }} />
      </div>
      {roots.length === 0
        ? <div style={{ padding: 48, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>אין נתונים</div>
        : roots.map(r => renderRows(r, 0))
      }
    </div>
  )
}

// ─── Main page ───

type View = 'tree' | 'table'

export default function LineagePage() {
  const [nodes, setNodes] = useState<LineageNode[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('tree')
  const [modal, setModal] = useState<ModalState>(null)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/lineage')
      setNodes((await r.json()).nodes ?? [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const maxGen = nodes.length ? Math.max(...nodes.map(n => n.generation)) : -1
  const genCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    nodes.forEach(n => { counts[n.generation] = (counts[n.generation] ?? 0) + 1 })
    return counts
  }, [nodes])

  function close() { setModal(null); setSaveErr('') }

  async function handleSave() {
    if (!formName.trim()) { setSaveErr('נא להזין שם'); return }
    setSaving(true); setSaveErr('')
    try {
      if (modal?.type === 'edit') {
        await fetch('/api/admin/lineage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: modal.node.id, name: formName }) })
      } else if (modal?.type === 'add') {
        await fetch('/api/admin/lineage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formName, parent_id: modal.parentId }) })
      }
      await loadAll(); close()
    } catch { setSaveErr('שגיאה') }
    setSaving(false)
  }

  async function handleDelete() {
    if (modal?.type !== 'delete') return
    setSaving(true)
    try {
      await fetch(`/api/admin/lineage?id=${modal.node.id}`, { method: 'DELETE' })
      await loadAll(); close()
    } catch { setSaveErr('שגיאה') }
    setSaving(false)
  }

  return (
    <div dir="rtl">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">עץ הדורות</h1>
          {!loading && (
            <span className="text-sm text-gray-400 font-medium">{nodes.length} רשומות · {maxGen + 1} דורות</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {(['tree', 'table'] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${view === v ? 'bg-white shadow-sm text-violet-700' : 'text-gray-400 hover:text-gray-600'}`}>
                {v === 'tree' ? '🌳 עץ' : '📋 טבלה'}
              </button>
            ))}
          </div>
          <button onClick={loadAll} disabled={loading} title="רענן"
            className="w-9 h-9 rounded-xl bg-white border border-gray-200 text-violet-600 flex items-center justify-center hover:bg-violet-50 transition-colors disabled:opacity-50">
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <button
            onClick={() => { setFormName(''); setModal({ type: 'add', parentId: null, parentName: '' }) }}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm">
            <Plus size={14} /> הוסף רשומה
          </button>
        </div>
      </div>

      {/* generation legend */}
      {nodes.length > 0 && !loading && (
        <div className="flex gap-2 flex-wrap mb-4">
          {Array.from({ length: maxGen + 1 }, (_, i) => i).map(g => (
            <div key={g} className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border"
              style={{ background: pal(g).light, borderColor: `${pal(g).ring}33`, color: pal(g).text }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: pal(g).ring }} />
              דור {g + 1} · {genCounts[g] ?? 0}
            </div>
          ))}
        </div>
      )}

      {/* content */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, gap: 12, color: '#7C3AED' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>טוען נתונים…</span>
        </div>
      ) : view === 'tree' ? (
        <TreeView nodes={nodes} onRefresh={loadAll} />
      ) : (
        <TableView
          nodes={nodes}
          onAdd={(parentId, parentName) => { setFormName(''); setModal({ type: 'add', parentId, parentName }) }}
          onEdit={node => { setFormName(node.name); setModal({ type: 'edit', node }) }}
          onDelete={node => setModal({ type: 'delete', node: { ...node, children: buildTree(nodes).find(n => n.id === node.id)?.children ?? [] } })}
        />
      )}

      {/* page-level modals (table view) */}
      {modal?.type === 'edit' && (
        <Modal title={`עריכת: ${modal.node.name}`} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} style={{ border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit', background: '#FAFBFF' }} />
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="שמור" color="#7C3AED" onClick={handleSave} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'add' && (
        <Modal title={modal.parentId ? `הוסף ילד ל: ${modal.parentName}` : 'הוסף שורש חדש'} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="הכנס שם..." style={{ border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit', background: '#FAFBFF' }} />
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="הוסף" color="#059669" onClick={handleSave} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'delete' && (
        <Modal title="מחיקת צומת" onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.6 }}>האם למחוק את <strong style={{ color: '#0F172A' }}>{modal.node.name}</strong>?</p>
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="מחק" color="#DC2626" onClick={handleDelete} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
