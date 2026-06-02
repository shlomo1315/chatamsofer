'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, X, Check, Loader2, GitBranch, Users } from 'lucide-react'

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
  x: number   // top-left x
  y: number   // top-left y
  cx: number  // center x
  cy: number  // center y
}

// ─── Layout ───

const NW = 164   // node width
const NH = 62    // node height
const HGAP = 56  // horizontal gap between siblings
const VGAP = 110 // vertical gap between generations
const PAD = 80   // canvas padding

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

function layout(roots: TreeNode[]): Positioned[] {
  const result: Positioned[] = []
  function place(node: TreeNode, x: number, y: number) {
    const sw = subtreeW(node)
    const cx = x + sw / 2
    result.push({ node, x: cx - NW / 2, y, cx, cy: y + NH / 2 })
    let childX = x
    node.children.forEach(child => {
      place(child, childX, y + NH + VGAP)
      childX += subtreeW(child)
    })
  }
  let startX = PAD
  roots.forEach(r => { place(r, startX, PAD); startX += subtreeW(r) })
  return result
}

function canvasSize(pos: Positioned[]) {
  if (!pos.length) return { w: 800, h: 400 }
  return {
    w: Math.max(...pos.map(p => p.x + NW)) + PAD,
    h: Math.max(...pos.map(p => p.y + NH)) + PAD,
  }
}

// ─── Generation color palette ───

const PALETTE = [
  { bg: 'linear-gradient(140deg,#7C3AED,#4C1D95)', ring: '#7C3AED', shadow: 'rgba(109,40,217,0.45)' },
  { bg: 'linear-gradient(140deg,#1D4ED8,#1E3A8A)', ring: '#1D4ED8', shadow: 'rgba(29,78,216,0.40)' },
  { bg: 'linear-gradient(140deg,#0369A1,#0C4A6E)', ring: '#0369A1', shadow: 'rgba(3,105,161,0.40)' },
  { bg: 'linear-gradient(140deg,#047857,#064E3B)', ring: '#047857', shadow: 'rgba(4,120,87,0.40)'  },
  { bg: 'linear-gradient(140deg,#B45309,#78350F)', ring: '#B45309', shadow: 'rgba(180,83,9,0.40)'  },
  { bg: 'linear-gradient(140deg,#BE185D,#831843)', ring: '#BE185D', shadow: 'rgba(190,24,93,0.40)' },
]

function pal(gen: number) { return PALETTE[gen % PALETTE.length] }

// ─── Node (HTML div overlaid on SVG canvas) ───

function NodeEl({ pos, selected, onClick, onEdit, onAddChild, onDelete }: {
  pos: Positioned
  selected: boolean
  onClick: () => void
  onEdit: () => void
  onAddChild: () => void
  onDelete: () => void
}) {
  const p = pal(pos.node.generation)
  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: NW,
        height: NH,
        borderRadius: '50%',
        background: p.bg,
        boxShadow: selected
          ? `0 0 0 3px #fff, 0 0 0 6px ${p.ring}, 0 10px 30px ${p.shadow}`
          : `0 6px 22px ${p.shadow}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transform: selected ? 'scale(1.06)' : 'scale(1)',
        transition: 'box-shadow .2s, transform .2s',
        zIndex: selected ? 20 : 2,
        userSelect: 'none',
      }}
    >
      {/* generation badge */}
      <div style={{
        position: 'absolute', top: -9, right: 4,
        background: '#fff', color: p.ring,
        fontSize: 10, fontWeight: 800,
        width: 20, height: 20, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: `0 2px 6px ${p.shadow}`,
        border: `1.5px solid ${p.ring}`,
      }}>
        {pos.node.generation + 1}
      </div>

      {/* name */}
      <span style={{
        color: '#fff',
        fontWeight: 700,
        fontSize: pos.node.name.length > 12 ? 12 : 14,
        textAlign: 'center',
        direction: 'rtl',
        padding: '0 14px',
        lineHeight: 1.35,
        textShadow: '0 1px 3px rgba(0,0,0,0.35)',
        maxWidth: NW - 20,
        overflow: 'hidden',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical' as const,
      }}>
        {pos.node.name}
      </span>

      {/* action strip — appears below when selected */}
      {selected && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            bottom: -42,
            display: 'flex',
            gap: 6,
            background: '#fff',
            borderRadius: 20,
            padding: '5px 10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            border: '1px solid #E2E8F0',
            zIndex: 30,
          }}
        >
          <ActionBtn icon="✎" color={p.ring} title="עריכה" onClick={onEdit} />
          <ActionBtn icon="+" color="#16a34a" title="הוסף ילד" onClick={onAddChild} />
          <ActionBtn icon="✕" color="#dc2626" title="מחיקה" onClick={onDelete} />
        </div>
      )}
    </div>
  )
}

function ActionBtn({ icon, color, title, onClick }: {
  icon: string; color: string; title: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 28, height: 28, borderRadius: '50%',
        background: color, color: '#fff', border: 'none',
        fontSize: 13, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
      }}
    >
      {icon}
    </button>
  )
}

// ─── Edge (elbow connector) ───

function Edge({ from, to }: { from: Positioned; to: Positioned }) {
  const x1 = from.cx
  const y1 = from.y + NH
  const x2 = to.cx
  const y2 = to.y
  const mid = (y1 + y2) / 2

  return (
    <path
      d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`}
      fill="none"
      stroke="#C8B8D8"
      strokeWidth={2.5}
      strokeLinecap="round"
    />
  )
}

function collectEdges(positions: Positioned[]) {
  const byId = new Map(positions.map(p => [p.node.id, p]))
  return positions.flatMap(p =>
    p.node.children
      .map(c => { const cp = byId.get(c.id); return cp ? { from: p, to: cp } : null })
      .filter(Boolean) as { from: Positioned; to: Positioned }[]
  )
}

// ─── Modal ───

function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15,10,30,0.5)', backdropFilter: 'blur(4px)',
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff', borderRadius: 20, width: '100%', maxWidth: 380,
          boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
        }}
        dir="rtl"
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid #F1F5F9' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1E293B' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: 18, lineHeight: 1 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '16px 20px 20px' }}>{children}</div>
      </div>
    </div>
  )
}

function ModalInput({ value, onChange, onEnter, placeholder }: {
  value: string; onChange: (v: string) => void; onEnter: () => void; placeholder?: string
}) {
  return (
    <input
      autoFocus
      value={value}
      onChange={e => onChange(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && onEnter()}
      placeholder={placeholder ?? 'הכנס שם...'}
      style={{
        width: '100%', boxSizing: 'border-box',
        border: '1.5px solid #E2E8F0', borderRadius: 10,
        padding: '10px 14px', fontSize: 14, direction: 'rtl',
        outline: 'none', fontFamily: 'inherit', color: '#1E293B',
      }}
    />
  )
}

function ModalBtn({ label, color, icon, onClick, loading }: {
  label: string; color: string; icon: React.ReactNode; onClick: () => void; loading?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: color, color: '#fff', border: 'none',
        borderRadius: 10, padding: '9px 18px',
        fontSize: 13, fontWeight: 700, cursor: 'pointer',
        opacity: loading ? 0.6 : 1, fontFamily: 'inherit',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}
    >
      {loading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : icon}
      {label}
    </button>
  )
}

// ─── Main page ───

type ModalState =
  | { type: 'edit'; node: LineageNode }
  | { type: 'add'; parentId: string | null; parentName: string }
  | { type: 'delete'; node: TreeNode }
  | null

export default function FamilyTreePage() {
  const [nodes, setNodes] = useState<LineageNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>(null)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

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

  const positions = useMemo(() => layout(buildTree(nodes)), [nodes])
  const edges = useMemo(() => collectEdges(positions), [positions])
  const { w, h } = useMemo(() => canvasSize(positions), [positions])

  function openEdit(node: LineageNode) {
    setFormName(node.name); setSaveError(''); setModal({ type: 'edit', node })
  }
  function openAdd(parentId: string | null, parentName: string) {
    setFormName(''); setSaveError(''); setModal({ type: 'add', parentId, parentName })
  }
  function openDelete(node: TreeNode) {
    setSaveError(''); setModal({ type: 'delete', node })
  }
  function closeModal() { setModal(null); setSaveError('') }

  async function handleSave() {
    if (!formName.trim()) { setSaveError('נא להזין שם'); return }
    setSaving(true); setSaveError('')
    try {
      if (modal?.type === 'edit') {
        const r = await fetch(`/api/lineage?id=${modal.node.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName }),
        })
        const d = await r.json()
        if (d.error) { setSaveError(d.error); setSaving(false); return }
      } else if (modal?.type === 'add') {
        const r = await fetch('/api/lineage', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: formName, parent_id: modal.parentId }),
        })
        const d = await r.json()
        if (d.error) { setSaveError(d.error); setSaving(false); return }
      }
      await loadAll(); closeModal()
    } catch { setSaveError('שגיאה בשמירה') }
    setSaving(false)
  }

  async function handleDelete() {
    if (modal?.type !== 'delete') return
    setSaving(true); setSaveError('')
    try {
      const r = await fetch(`/api/lineage?id=${modal.node.id}`, { method: 'DELETE' })
      const d = await r.json()
      if (d.error) { setSaveError(d.error); setSaving(false); return }
      if (selected === modal.node.id) setSelected(null)
      await loadAll(); closeModal()
    } catch { setSaveError('שגיאה במחיקה') }
    setSaving(false)
  }

  const selectedPos = selected ? positions.find(p => p.node.id === selected) ?? null : null

  return (
    <div style={{ minHeight: '100vh', background: '#F3F0F8', fontFamily: 'system-ui, -apple-system, Arial, sans-serif' }} dir="rtl">

      {/* ── Header ── */}
      <header style={{
        background: '#fff', borderBottom: '1px solid #E8E0F5',
        padding: '14px 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', boxShadow: '0 2px 12px rgba(109,40,217,0.07)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(140deg,#7C3AED,#4C1D95)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(109,40,217,0.35)',
          }}>
            <GitBranch size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1E1035' }}>עץ הדורות</div>
            <div style={{ fontSize: 12, color: '#9D88BE', marginTop: 1 }}>{nodes.length} צמתים בשושלת</div>
          </div>
        </div>
        <button
          onClick={() => openAdd(null, 'שורש')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'linear-gradient(140deg,#7C3AED,#4C1D95)',
            color: '#fff', border: 'none', borderRadius: 12,
            padding: '9px 18px', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', boxShadow: '0 4px 14px rgba(109,40,217,0.35)',
          }}
        >
          <Plus size={15} /> הוסף שורש
        </button>
      </header>

      {/* ── Generation legend ── */}
      {nodes.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, padding: '10px 24px', background: '#fff',
          borderBottom: '1px solid #EDE8F5', flexWrap: 'wrap', alignItems: 'center',
        }}>
          <span style={{ fontSize: 11, color: '#9D88BE', fontWeight: 600, marginLeft: 4 }}>דורות:</span>
          {PALETTE.slice(0, Math.min(6, Math.max(...nodes.map(n => n.generation)) + 1)).map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: p.bg }} />
              <span style={{ fontSize: 11, color: '#64748B' }}>דור {i + 1}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Canvas ── */}
      <main style={{ padding: 20 }}>
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: '#7C3AED' }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 15, fontWeight: 600 }}>טוען עץ דורות…</span>
          </div>
        )}

        {error && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 12, padding: '12px 20px', fontSize: 14 }}>
              {error}
            </div>
          </div>
        )}

        {!loading && !error && nodes.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 340, gap: 16, color: '#B8A8D8' }}>
            <Users size={56} style={{ opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>אין צמתים בעץ עדיין</p>
            <button
              onClick={() => openAdd(null, 'שורש')}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'linear-gradient(140deg,#7C3AED,#4C1D95)',
                color: '#fff', border: 'none', borderRadius: 12,
                padding: '10px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Plus size={16} /> הוסף את הדור הראשון
            </button>
          </div>
        )}

        {!loading && !error && nodes.length > 0 && (
          <div style={{
            overflowX: 'auto', overflowY: 'auto',
            borderRadius: 20, background: '#fff',
            border: '1px solid #E8E0F5',
            boxShadow: '0 4px 24px rgba(109,40,217,0.08)',
            backgroundImage: 'radial-gradient(circle, #D8CCF0 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            backgroundPosition: '14px 14px',
          }}>
            <div style={{ position: 'relative', width: w, height: h + 60, minWidth: '100%' }}>

              {/* SVG layer — edges */}
              <svg
                style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }}
                width={w} height={h + 60}
              >
                <defs>
                  <marker id="dot" markerWidth="6" markerHeight="6" refX="3" refY="3">
                    <circle cx="3" cy="3" r="2" fill="#C8B8D8" />
                  </marker>
                </defs>
                {edges.map((e, i) => (
                  <Edge key={i} from={e.from} to={e.to} />
                ))}
              </svg>

              {/* HTML layer — nodes */}
              {positions.map(pos => (
                <NodeEl
                  key={pos.node.id}
                  pos={pos}
                  selected={selected === pos.node.id}
                  onClick={() => setSelected(prev => prev === pos.node.id ? null : pos.node.id)}
                  onEdit={() => openEdit(pos.node)}
                  onAddChild={() => openAdd(pos.node.id, pos.node.name)}
                  onDelete={() => openDelete(pos.node)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Selected node info panel ── */}
        {selectedPos && (
          <div style={{
            marginTop: 16, background: '#fff', borderRadius: 16,
            border: `2px solid ${pal(selectedPos.node.generation).ring}`,
            padding: '16px 20px',
            boxShadow: `0 4px 20px ${pal(selectedPos.node.generation).shadow}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4, fontWeight: 600 }}>צומת נבחר</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#1E1035' }}>{selectedPos.node.name}</div>
                <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                  דור {selectedPos.node.generation + 1} &middot; {selectedPos.node.children.length} ילדים ישירים
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <PanelBtn label="עריכה" icon={<Pencil size={13} />} color="#7C3AED" bg="#F5F0FF" onClick={() => openEdit(selectedPos.node)} />
                <PanelBtn label="הוסף ילד" icon={<Plus size={13} />} color="#16a34a" bg="#F0FDF4" onClick={() => openAdd(selectedPos.node.id, selectedPos.node.name)} />
                <PanelBtn label="מחיקה" icon={<Trash2 size={13} />} color="#dc2626" bg="#FEF2F2" onClick={() => openDelete(selectedPos.node)} />
              </div>
            </div>
            {selectedPos.node.children.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, marginBottom: 8 }}>ילדים:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {selectedPos.node.children.map(child => (
                    <button
                      key={child.id}
                      onClick={() => setSelected(child.id)}
                      style={{
                        padding: '6px 14px', borderRadius: 20, border: 'none',
                        background: pal(child.generation).bg,
                        color: '#fff', fontSize: 12, fontWeight: 700,
                        cursor: 'pointer', direction: 'rtl',
                        boxShadow: `0 3px 10px ${pal(child.generation).shadow}`,
                      }}
                    >
                      {child.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Modals ── */}

      {modal?.type === 'edit' && (
        <Modal title={`עריכת: ${modal.node.name}`} onClose={closeModal}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ModalInput value={formName} onChange={setFormName} onEnter={handleSave} />
            {saveError && <span style={{ color: '#dc2626', fontSize: 13 }}>{saveError}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <ModalBtn label="שמור" color="#7C3AED" icon={<Check size={14} />} onClick={handleSave} loading={saving} />
              <ModalBtn label="ביטול" color="#94A3B8" icon={<X size={14} />} onClick={closeModal} />
            </div>
          </div>
        </Modal>
      )}

      {modal?.type === 'add' && (
        <Modal
          title={modal.parentId ? `הוספת ילד ל: ${modal.parentName}` : 'הוספת שורש חדש'}
          onClose={closeModal}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ModalInput value={formName} onChange={setFormName} onEnter={handleSave} placeholder="הכנס שם..." />
            {saveError && <span style={{ color: '#dc2626', fontSize: 13 }}>{saveError}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <ModalBtn label="הוסף" color="#16a34a" icon={<Plus size={14} />} onClick={handleSave} loading={saving} />
              <ModalBtn label="ביטול" color="#94A3B8" icon={<X size={14} />} onClick={closeModal} />
            </div>
          </div>
        </Modal>
      )}

      {modal?.type === 'delete' && (
        <Modal title="מחיקת צומת" onClose={closeModal}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
              האם למחוק את <strong>{modal.node.name}</strong>?
            </p>
            {(modal.node.children?.length ?? 0) > 0 && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#92400E' }}>
                שים לב: לצומת זה {modal.node.children.length} ילדים — הם לא יימחקו אבל יאבדו את ההורה.
              </div>
            )}
            {saveError && <span style={{ color: '#dc2626', fontSize: 13 }}>{saveError}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              <ModalBtn label="מחק" color="#dc2626" icon={<Trash2 size={14} />} onClick={handleDelete} loading={saving} />
              <ModalBtn label="ביטול" color="#94A3B8" icon={<X size={14} />} onClick={closeModal} />
            </div>
          </div>
        </Modal>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

function PanelBtn({ label, icon, color, bg, onClick }: {
  label: string; icon: React.ReactNode; color: string; bg: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: bg, color, border: `1px solid ${color}22`,
        borderRadius: 10, padding: '7px 14px',
        fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      {icon} {label}
    </button>
  )
}
