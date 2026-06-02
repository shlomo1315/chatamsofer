'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, X, Check, Loader2 } from 'lucide-react'

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
  x: number
  y: number
  cx: number
  cy: number
}

// ─── Layout ───

const NW = 164
const NH = 62
const HGAP = 56
const VGAP = 110
const PAD = 80

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

function subtreeW(node: TreeNode): number {
  if (!node.children.length) return NW + HGAP
  return node.children.reduce((s, c) => s + subtreeW(c), 0)
}

function layoutTree(roots: TreeNode[]): Positioned[] {
  const result: Positioned[] = []
  function place(node: TreeNode, x: number, y: number) {
    const sw = subtreeW(node)
    const cx = x + sw / 2
    result.push({ node, x: cx - NW / 2, y, cx, cy: y + NH / 2 })
    let childX = x
    node.children.forEach(child => { place(child, childX, y + NH + VGAP); childX += subtreeW(child) })
  }
  let sx = PAD
  roots.forEach(r => { place(r, sx, PAD); sx += subtreeW(r) })
  return result
}

function canvasSize(pos: Positioned[]) {
  if (!pos.length) return { w: 800, h: 400 }
  return {
    w: Math.max(...pos.map(p => p.x + NW)) + PAD,
    h: Math.max(...pos.map(p => p.y + NH)) + PAD,
  }
}

// ─── Colors ───

const PALETTE = [
  { bg: 'linear-gradient(140deg,#7C3AED,#4C1D95)', ring: '#7C3AED', shadow: 'rgba(109,40,217,0.40)' },
  { bg: 'linear-gradient(140deg,#1D4ED8,#1E3A8A)', ring: '#1D4ED8', shadow: 'rgba(29,78,216,0.35)'  },
  { bg: 'linear-gradient(140deg,#0369A1,#0C4A6E)', ring: '#0369A1', shadow: 'rgba(3,105,161,0.35)'   },
  { bg: 'linear-gradient(140deg,#047857,#064E3B)', ring: '#047857', shadow: 'rgba(4,120,87,0.35)'    },
  { bg: 'linear-gradient(140deg,#B45309,#78350F)', ring: '#B45309', shadow: 'rgba(180,83,9,0.35)'    },
  { bg: 'linear-gradient(140deg,#BE185D,#831843)', ring: '#BE185D', shadow: 'rgba(190,24,93,0.35)'   },
]
const pal = (gen: number) => PALETTE[gen % PALETTE.length]

// ─── Sub-components ───

function NodeEl({ pos, selected, onClick, onEdit, onAddChild, onDelete }: {
  pos: Positioned; selected: boolean
  onClick: () => void; onEdit: () => void; onAddChild: () => void; onDelete: () => void
}) {
  const p = pal(pos.node.generation)
  return (
    <div onClick={onClick} style={{
      position: 'absolute', left: pos.x, top: pos.y,
      width: NW, height: NH, borderRadius: '50%',
      background: p.bg,
      boxShadow: selected
        ? `0 0 0 3px #fff,0 0 0 6px ${p.ring},0 10px 30px ${p.shadow}`
        : `0 6px 22px ${p.shadow}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer',
      transform: selected ? 'scale(1.06)' : 'scale(1)',
      transition: 'box-shadow .2s,transform .2s',
      zIndex: selected ? 20 : 2,
      userSelect: 'none',
    }}>
      {/* generation badge */}
      <div style={{
        position: 'absolute', top: -9, right: 4,
        background: '#fff', color: p.ring,
        fontSize: 10, fontWeight: 800,
        width: 20, height: 20, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 2px 6px ${p.shadow}`, border: `1.5px solid ${p.ring}`,
      }}>
        {pos.node.generation + 1}
      </div>

      {/* name */}
      <span style={{
        color: '#fff', fontWeight: 700,
        fontSize: pos.node.name.length > 12 ? 12 : 14,
        textAlign: 'center', direction: 'rtl',
        padding: '0 14px', lineHeight: 1.35,
        textShadow: '0 1px 3px rgba(0,0,0,0.35)',
        maxWidth: NW - 20, overflow: 'hidden',
        display: '-webkit-box', WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical' as const,
      }}>
        {pos.node.name}
      </span>

      {/* action strip */}
      {selected && (
        <div onClick={e => e.stopPropagation()} style={{
          position: 'absolute', bottom: -44,
          display: 'flex', gap: 6,
          background: '#fff', borderRadius: 20,
          padding: '5px 10px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          border: '1px solid #E2E8F0', zIndex: 30,
        }}>
          <Btn icon="✎" color={p.ring}   onClick={onEdit}     title="עריכה"     />
          <Btn icon="+" color="#16a34a"  onClick={onAddChild}  title="הוסף ילד"  />
          <Btn icon="✕" color="#dc2626"  onClick={onDelete}    title="מחיקה"     />
        </div>
      )}
    </div>
  )
}

function Btn({ icon, color, title, onClick }: { icon: string; color: string; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 28, height: 28, borderRadius: '50%',
      background: color, color: '#fff', border: 'none',
      fontSize: 13, fontWeight: 700, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
    }}>{icon}</button>
  )
}

function Edge({ from, to }: { from: Positioned; to: Positioned }) {
  const x1 = from.cx, y1 = from.y + NH
  const x2 = to.cx,   y2 = to.y
  const mid = (y1 + y2) / 2
  return (
    <path d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`}
      fill="none" stroke="#C8B8D8" strokeWidth={2.5} strokeLinecap="round" />
  )
}

function collectEdges(positions: Positioned[]) {
  const byId = new Map(positions.map(p => [p.node.id, p]))
  return positions.flatMap(p =>
    p.node.children.map(c => { const cp = byId.get(c.id); return cp ? { from: p, to: cp } : null })
      .filter(Boolean) as { from: Positioned; to: Positioned }[]
  )
}

// ─── Modal ───

type ModalState =
  | { type: 'edit';   node: LineageNode }
  | { type: 'add';    parentId: string | null; parentName: string }
  | { type: 'delete'; node: TreeNode }
  | null

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(15,10,30,0.5)', backdropFilter: 'blur(4px)', padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 20, width: '100%', maxWidth: 380,
        boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
      }} dir="rtl" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid #F1F5F9' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1E293B' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '16px 20px 20px' }}>{children}</div>
      </div>
    </div>
  )
}

// ─── Main exported component ───

export function LineageTreeView() {
  const [nodes,    setNodes]    = useState<LineageNode[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [modal,    setModal]    = useState<ModalState>(null)
  const [formName, setFormName] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [saveErr,  setSaveErr]  = useState('')

  const loadAll = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/lineage?all=1')
      const d = await r.json()
      setNodes(d.nodes ?? [])
    } catch { setError('שגיאה בטעינת הנתונים') }
    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const positions = useMemo(() => layoutTree(buildTree(nodes)), [nodes])
  const edges     = useMemo(() => collectEdges(positions), [positions])
  const { w, h }  = useMemo(() => canvasSize(positions), [positions])

  function openEdit(node: LineageNode) { setFormName(node.name); setSaveErr(''); setModal({ type: 'edit', node }) }
  function openAdd(parentId: string | null, parentName: string) { setFormName(''); setSaveErr(''); setModal({ type: 'add', parentId, parentName }) }
  function openDelete(node: TreeNode) { setSaveErr(''); setModal({ type: 'delete', node }) }
  function close() { setModal(null); setSaveErr('') }

  async function handleSave() {
    if (!formName.trim()) { setSaveErr('נא להזין שם'); return }
    setSaving(true); setSaveErr('')
    try {
      if (modal?.type === 'edit') {
        const r = await fetch(`/api/lineage?id=${modal.node.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName }),
        })
        if ((await r.json()).error) { setSaveErr('שגיאה בשמירה'); setSaving(false); return }
      } else if (modal?.type === 'add') {
        const r = await fetch('/api/lineage', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName, parent_id: modal.parentId }),
        })
        if ((await r.json()).error) { setSaveErr('שגיאה בהוספה'); setSaving(false); return }
      }
      await loadAll(); close()
    } catch { setSaveErr('שגיאה') }
    setSaving(false)
  }

  async function handleDelete() {
    if (modal?.type !== 'delete') return
    setSaving(true)
    try {
      await fetch(`/api/lineage?id=${modal.node.id}`, { method: 'DELETE' })
      if (selected === modal.node.id) setSelected(null)
      await loadAll(); close()
    } catch { setSaveErr('שגיאה במחיקה') }
    setSaving(false)
  }

  const selPos = selected ? positions.find(p => p.node.id === selected) ?? null : null

  // ── loading / error states ──

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 10, color: '#7C3AED' }}>
      <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />
      <span style={{ fontSize: 15, fontWeight: 600 }}>טוען עץ דורות…</span>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
      <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 12, padding: '12px 20px', fontSize: 14 }}>
        {error}
      </div>
    </div>
  )

  if (!nodes.length) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 16, color: '#B8A8D8' }}>
      <p style={{ margin: 0, fontSize: 15 }}>אין צמתים בעץ עדיין</p>
      <button onClick={() => openAdd(null, '')} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'linear-gradient(140deg,#7C3AED,#4C1D95)', color: '#fff',
        border: 'none', borderRadius: 12, padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
      }}>
        <Plus size={16} /> הוסף שורש
      </button>
    </div>
  )

  return (
    <>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* canvas */}
      <div style={{
        overflowX: 'auto', overflowY: 'auto', borderRadius: 16,
        background: '#fff', border: '1px solid #E8E0F5',
        boxShadow: '0 4px 24px rgba(109,40,217,0.08)',
        backgroundImage: 'radial-gradient(circle,#D8CCF0 1px,transparent 1px)',
        backgroundSize: '28px 28px', backgroundPosition: '14px 14px',
        minHeight: 300,
      }}>
        <div style={{ position: 'relative', width: w, height: h + 60, minWidth: '100%' }}>
          {/* SVG edges */}
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} width={w} height={h + 60}>
            {edges.map((e, i) => <Edge key={i} from={e.from} to={e.to} />)}
          </svg>

          {/* HTML nodes */}
          {positions.map(pos => (
            <NodeEl
              key={pos.node.id} pos={pos}
              selected={selected === pos.node.id}
              onClick={() => setSelected(prev => prev === pos.node.id ? null : pos.node.id)}
              onEdit={() => openEdit(pos.node)}
              onAddChild={() => openAdd(pos.node.id, pos.node.name)}
              onDelete={() => openDelete(pos.node)}
            />
          ))}
        </div>
      </div>

      {/* selected node info */}
      {selPos && (
        <div style={{
          marginTop: 14, background: '#fff', borderRadius: 14,
          border: `2px solid ${pal(selPos.node.generation).ring}`,
          padding: '14px 18px',
          boxShadow: `0 4px 20px ${pal(selPos.node.generation).shadow}`,
          direction: 'rtl',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 3, fontWeight: 600 }}>צומת נבחר</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1E1035' }}>{selPos.node.name}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>
                דור {selPos.node.generation + 1} · {selPos.node.children.length} ילדים
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'עריכה',    icon: <Pencil size={12}/>, color: '#7C3AED', bg: '#F5F0FF', fn: () => openEdit(selPos.node)                         },
                { label: 'הוסף ילד', icon: <Plus size={12}/>,   color: '#16a34a', bg: '#F0FDF4', fn: () => openAdd(selPos.node.id, selPos.node.name)      },
                { label: 'מחיקה',   icon: <Trash2 size={12}/>, color: '#dc2626', bg: '#FEF2F2', fn: () => openDelete(selPos.node)                        },
              ].map(b => (
                <button key={b.label} onClick={b.fn} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: b.bg, color: b.color,
                  border: `1px solid ${b.color}33`, borderRadius: 8,
                  padding: '6px 12px', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>{b.icon}{b.label}</button>
              ))}
            </div>
          </div>
          {selPos.node.children.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, marginBottom: 6 }}>ילדים:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selPos.node.children.map(child => (
                  <button key={child.id} onClick={() => setSelected(child.id)} style={{
                    padding: '5px 12px', borderRadius: 16, border: 'none',
                    background: pal(child.generation).bg, color: '#fff',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', direction: 'rtl',
                    boxShadow: `0 2px 8px ${pal(child.generation).shadow}`,
                  }}>{child.name}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* add root button (floating) */}
      <button
        onClick={() => openAdd(null, '')}
        style={{
          position: 'fixed', bottom: 28, left: 28,
          width: 48, height: 48, borderRadius: '50%',
          background: 'linear-gradient(140deg,#7C3AED,#4C1D95)',
          color: '#fff', border: 'none', fontSize: 24, fontWeight: 700,
          cursor: 'pointer', zIndex: 50,
          boxShadow: '0 6px 20px rgba(109,40,217,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
        title="הוסף שורש"
      >+</button>

      {/* Modals */}
      {modal?.type === 'edit' && (
        <Modal title={`עריכת: ${modal.node.name}`} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              style={{ border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '10px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit' }} />
            {saveErr && <span style={{ color: '#dc2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="שמור"  color="#7C3AED" onClick={handleSave} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}

      {modal?.type === 'add' && (
        <Modal title={modal.parentId ? `הוספת ילד ל: ${modal.parentName}` : 'הוספת שורש'} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              placeholder="הכנס שם..."
              style={{ border: '1.5px solid #E2E8F0', borderRadius: 10, padding: '10px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit' }} />
            {saveErr && <span style={{ color: '#dc2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="הוסף"  color="#16a34a" onClick={handleSave} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}

      {modal?.type === 'delete' && (
        <Modal title="מחיקת צומת" onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#334155' }}>האם למחוק את <strong>{modal.node.name}</strong>?</p>
            {(modal.node.children?.length ?? 0) > 0 && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#92400E' }}>
                שים לב: {modal.node.children.length} ילדים יאבדו את ההורה
              </div>
            )}
            {saveErr && <span style={{ color: '#dc2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="מחק"   color="#dc2626" onClick={handleDelete} loading={saving} />
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}

function MBtn({ label, color, onClick, loading }: { label: string; color: string; onClick: () => void; loading?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: color, color: '#fff', border: 'none', borderRadius: 10,
      padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
      opacity: loading ? 0.6 : 1, fontFamily: 'inherit',
    }}>
      {loading && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
      {label}
    </button>
  )
}
