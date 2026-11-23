'use client'
// ─────────────────────────────────────────────────────────────────────────────
// עורך סדר הדורות — משותף לכרטסת המוטב, לכרטסת היולדת ולקישור התיקון.
//
// עריכת שם, בן/חתן, הוספה בכל מקום, מחיקה וסידור למעלה/למטה — הכול במקום,
// בלי טעינת עמוד. השמירה עצמה בידי מי שמשתמש ברכיב (onSave).
// 🔴 הלוגיקה ב-lib/lineageChainEdit — אותה לוגיקה גם בשרת.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { ArrowUp, ArrowDown, Trash2, Plus, Loader2, Check, PenLine, GitBranch, Search } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import {
  rowsFromChain, chainFromRows, updateRow, insertRow, removeRow, moveRow, emptyRows, treeChildrenOf, rel,
  MAX_EDIT_GENERATIONS, MAX_GEN_NAME, type EditRow, type ChainStep, type RemoveMode, type TreeNode,
} from '@/lib/lineageChainEdit'

export interface LineageChainEditorProps {
  initialChain: { generation?: number | null; name?: string | null; relation?: unknown }[] | null | undefined
  onSave: (chain: ChainStep[]) => void | Promise<void>
  onCancel?: () => void
  saving?: boolean
  error?: string
  saveLabel?: string
  /** תווית לשורה האחרונה (למשל "זה אתם") */
  lastLabel?: string
  /**
   * טעינת צמתי העץ לדור gen (והדור שלפניו). כשקיים — "+" פותח בחירה בין דור
   * ידני לבין דור קיים מאותו גזע. בלי — "+" מוסיף שורה ריקה (קישור ציבורי).
   */
  loadTreeNodes?: (gen: number) => Promise<TreeNode[]>
}

type AddState = { at: number; mode: 'manual' | 'tree'; name: string; relation: EditRow['relation']; nodes: TreeNode[] | null; loadError: string; q: string }

function RelationToggle({ value, onChange, disabled }: { value: EditRow['relation']; onChange: (v: EditRow['relation']) => void; disabled?: boolean }) {
  const opt = (v: 'son' | 'son_in_law', label: string) => (
    <button type="button" disabled={disabled} aria-pressed={value === v}
      onClick={() => onChange(value === v ? null : v)}
      className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${value === v ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
      {label}
    </button>
  )
  return (
    <div className="inline-flex shrink-0 overflow-hidden rounded-lg border border-slate-300 divide-x divide-x-reverse divide-slate-300">
      {opt('son', 'בן')}{opt('son_in_law', 'חתן')}
    </div>
  )
}

export default function LineageChainEditor({ initialChain, onSave, onCancel, saving, error, saveLabel = 'שמירת סדר הדורות', lastLabel, loadTreeNodes }: LineageChainEditorProps) {
  const [add, setAdd] = useState<AddState | null>(null)
  const patchAdd = (p: Partial<AddState>) => setAdd(a => (a ? { ...a, ...p } : a))

  // "+" במקום at (אינדקס שורה). הדור החדש יהיה דור at+1, ואביו — השורה at-1.
  const openAdd = (at: number) => {
    if (!loadTreeNodes) { setRows(rs => insertRow(rs, at)); return }
    setAdd({ at, mode: 'manual', name: '', relation: 'son', nodes: null, loadError: '', q: '' })
    loadTreeNodes(at + 1)
      .then(nodes => setAdd(a => (a && a.at === at ? { ...a, nodes } : a)))
      .catch(() => setAdd(a => (a && a.at === at ? { ...a, nodes: [], loadError: 'לא ניתן לטעון את העץ כרגע' } : a)))
  }
  const commitAdd = (row: EditRow) => {
    if (!add || !row.name.trim()) return
    setRows(rs => insertRow(rs, add.at, row))
    setAdd(null)
  }
  const [rows, setRows] = useState<EditRow[]>(() => {
    const r = rowsFromChain(initialChain)
    return r.length > 1 ? r : insertRow(r, 1)
  })
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)
  const [showEmpty, setShowEmpty] = useState(false)
  const empty = useMemo(() => new Set(emptyRows(rows)), [rows])
  const full = rows.length >= MAX_EDIT_GENERATIONS

  const save = () => {
    if (empty.size) { setShowEmpty(true); return }
    void onSave(chainFromRows(rows))
  }

  const confirmDelete = (mode: RemoveMode) => {
    if (pendingDelete === null) return
    setRows(r => removeRow(r, pendingDelete, mode))
    setPendingDelete(null)
  }

  const isLastDelete = pendingDelete !== null && pendingDelete === rows.length - 1
  // תצוגה מקדימה: הדור שנמחק ועד 3 הדורות שאחריו, בשני המצבים.
  const preview = (mode: RemoveMode) => {
    if (pendingDelete === null) return []
    const after = removeRow(rows, pendingDelete, mode)
    const from = pendingDelete
    return after.slice(from, from + 3).map((r, k) => ({ gen: from + k + 1, name: r.name }))
  }

  return (
    <div dir="rtl" className="font-[Heebo,sans-serif]">
      <ol className="flex flex-col gap-1.5">
        {rows.map((r, i) => {
          const isRoot = i === 0
          const isEmpty = empty.has(i)
          return (
            <li key={i} className="flex flex-col gap-1.5">
              <div className={`flex flex-wrap items-center gap-2 rounded-xl border px-2.5 py-2 ${isRoot ? 'border-slate-200 bg-slate-50' : isEmpty && showEmpty ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                <span className="w-12 shrink-0 text-xs font-bold text-slate-400 ltr-num">דור {i + 1}</span>
                {isRoot ? (
                  <span className="flex-1 text-sm font-bold text-slate-700">{r.name}</span>
                ) : (
                  <>
                    <input value={r.name} maxLength={MAX_GEN_NAME} disabled={saving}
                      aria-label={`שם בדור ${i + 1}`}
                      placeholder={isEmpty ? 'מקום ריק — יש למלא שם' : ''}
                      onChange={e => setRows(rs => updateRow(rs, i, { name: e.target.value }))}
                      className="min-w-[9rem] flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                    {lastLabel && i === rows.length - 1 && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-600">{lastLabel}</span>}
                    <RelationToggle value={r.relation} disabled={saving} onChange={v => setRows(rs => updateRow(rs, i, { relation: v }))} />
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button type="button" title="העברה למעלה" aria-label="העברה למעלה" disabled={saving || i <= 1}
                        onClick={() => setRows(rs => moveRow(rs, i, -1))}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowUp size={15} /></button>
                      <button type="button" title="העברה למטה" aria-label="העברה למטה" disabled={saving || i >= rows.length - 1}
                        onClick={() => setRows(rs => moveRow(rs, i, 1))}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><ArrowDown size={15} /></button>
                      <button type="button" title="מחיקת הדור" aria-label="מחיקת הדור" disabled={saving}
                        onClick={() => { if (!r.name.trim() && i === rows.length - 1) setRows(rs => removeRow(rs, i, 'shift')); else setPendingDelete(i) }}
                        className="rounded-md p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-30"><Trash2 size={15} /></button>
                    </div>
                  </>
                )}
              </div>
              {/* הוספת דור אחרי השורה הזו */}
              <div className="flex justify-start ps-12">
                <button type="button" disabled={saving || full}
                  onClick={() => openAdd(i + 1)}
                  aria-label={i === rows.length - 1 ? 'הוספת דור בסוף' : `הוספת דור בין דור ${i + 1} לדור ${i + 2}`}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-indigo-500 hover:bg-indigo-50 disabled:opacity-40">
                  <Plus size={12} /> {i === rows.length - 1 ? 'הוספת דור בסוף' : `הוספת דור כאן (בין דור ${i + 1} לדור ${i + 2})`}
                </button>
              </div>
            </li>
          )
        })}
      </ol>

      {showEmpty && empty.size > 0 && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          יש {empty.size === 1 ? 'מקום ריק אחד' : `${empty.size} מקומות ריקים`} בסדר (מסומנים בצהוב) — יש למלא שם או למחוק.
        </div>
      )}
      {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</div>}

      <div className="mt-4 flex gap-2">
        <button type="button" disabled={saving} onClick={save}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {saveLabel}
        </button>
        {onCancel && (
          <button type="button" disabled={saving} onClick={onCancel}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">ביטול</button>
        )}
      </div>

      <Modal open={pendingDelete !== null} onClose={() => setPendingDelete(null)} size="sm"
        title={pendingDelete !== null ? `מחיקת דור ${pendingDelete + 1}${rows[pendingDelete]?.name ? ` — ${rows[pendingDelete].name}` : ''}` : ''}>
        <div dir="rtl" className="flex flex-col gap-3 text-sm">
          {isLastDelete ? (
            <p className="text-slate-600">זה הדור האחרון ברשימה, והוא יימחק.</p>
          ) : (
            <p className="text-slate-600">מה לעשות עם הדורות שאחריו?</p>
          )}
          {(isLastDelete ? (['shift'] as RemoveMode[]) : (['shift', 'keep'] as RemoveMode[])).map(mode => (
            <button key={mode} type="button" onClick={() => confirmDelete(mode)}
              className="rounded-xl border border-slate-200 p-3 text-right hover:border-indigo-400 hover:bg-indigo-50">
              <div className="font-bold text-slate-800">
                {isLastDelete ? 'מחיקה' : mode === 'shift' ? 'הדורות הבאים עולים דור' : 'להשאיר מקום ריק'}
              </div>
              {!isLastDelete && (
                <div className="mt-0.5 text-xs text-slate-500">
                  {mode === 'shift' ? 'המקום נסגר, וכל מי שאחריו עולה דור אחד.' : 'כל השאר נשארים בדור שלהם, ובמקום הזה ימולא שם אחר.'}
                </div>
              )}
              {!isLastDelete && (
                <ul className="mt-2 flex flex-col gap-0.5 text-xs">
                  {preview(mode).map(p => (
                    <li key={p.gen} className="flex gap-2">
                      <span className="w-12 text-slate-400 ltr-num">דור {p.gen}</span>
                      <span className={p.name ? 'text-slate-700' : 'italic text-amber-700'}>{p.name || 'מקום ריק'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </button>
          ))}
          <button type="button" onClick={() => setPendingDelete(null)} className="text-xs font-semibold text-slate-500 hover:underline">ביטול</button>
        </div>
      </Modal>

      <Modal open={add !== null} onClose={() => setAdd(null)} size="sm"
        title={add ? `הוספת דור ${add.at + 1}${rows[add.at - 1]?.name ? ` — אחרי ${rows[add.at - 1].name}` : ''}` : ''}>
        {add && (() => {
          const prevName = rows[add.at - 1]?.name ?? ''
          const kids = add.nodes ? treeChildrenOf(add.nodes, prevName, add.at + 1) : null
          const q = add.q.trim()
          const shown = kids?.filter(n => !q || n.name.includes(q)) ?? null
          const tab = (m: AddState['mode'], label: string, Icon: typeof PenLine) => (
            <button type="button" role="tab" aria-selected={add.mode === m} onClick={() => patchAdd({ mode: m })}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${add.mode === m ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              <Icon size={15} /> {label}
            </button>
          )
          return (
            <div dir="rtl" className="flex flex-col gap-3 text-sm">
              <div role="tablist" className="flex gap-1 rounded-xl bg-slate-100 p-1">
                {tab('manual', 'דור ידני', PenLine)}
                {tab('tree', 'דור קיים מאותו גזע', GitBranch)}
              </div>

              {add.mode === 'manual' ? (
                <form className="flex flex-col gap-3" onSubmit={e => { e.preventDefault(); commitAdd({ name: add.name, relation: add.relation }) }}>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-slate-500">שם</span>
                    <input autoFocus value={add.name} maxLength={MAX_GEN_NAME} aria-label="שם הדור החדש"
                      onChange={e => patchAdd({ name: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-500">{prevName ? `קשר ל${prevName}` : 'קשר'}</span>
                    <RelationToggle value={add.relation} onChange={v => patchAdd({ relation: v })} />
                  </div>
                  <button type="submit" disabled={!add.name.trim()}
                    className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-40">הוספה</button>
                </form>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-slate-500">
                    {add.at === 1 ? 'בני רבינו החתם סופר בעץ.' : `ילדי ${prevName || 'הדור הקודם'} בעץ (דור ${add.at + 1}).`}
                  </p>
                  {shown === null ? (
                    <div className="flex items-center gap-2 py-4 text-slate-400"><Loader2 size={15} className="animate-spin" /> טוען מהעץ…</div>
                  ) : add.loadError ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{add.loadError}</div>
                  ) : !kids?.length ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs text-slate-600">
                      {prevName ? `ל${prevName} אין ילדים בעץ בדור ${add.at + 1}.` : 'הדור הקודם ריק — יש למלא אותו קודם.'} אפשר להוסיף דור ידני.
                    </div>
                  ) : (
                    <>
                      {kids.length > 6 && (
                        <div className="relative">
                          <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input value={add.q} onChange={e => patchAdd({ q: e.target.value })} placeholder="חיפוש שם" aria-label="חיפוש בעץ"
                            className="w-full rounded-lg border border-slate-300 py-2 pe-2.5 ps-8 text-sm focus:border-indigo-500 focus:outline-none" />
                        </div>
                      )}
                      <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
                        {shown!.map(n => (
                          <li key={n.id}>
                            <button type="button" onClick={() => commitAdd({ name: n.name, relation: rel(n.relation) ?? 'son' })}
                              className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-right hover:border-indigo-400 hover:bg-indigo-50">
                              <span className="font-semibold text-slate-800">{n.name}</span>
                              <span className="shrink-0 text-[11px] text-slate-400">
                                {rel(n.relation) === 'son_in_law' ? 'חתן' : 'בן'}{n.status === 'verified' ? ' · מאושר' : ''}
                              </span>
                            </button>
                          </li>
                        ))}
                        {!shown!.length && <li className="py-2 text-xs text-slate-400">אין תוצאות</li>}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })()}
      </Modal>
    </div>
  )
}
