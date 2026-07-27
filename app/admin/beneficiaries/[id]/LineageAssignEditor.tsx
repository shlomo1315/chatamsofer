'use client'
import { useState, useEffect, useMemo } from 'react'
import { GitBranch, Search, Loader2, Check, X, ChevronLeft, AlertTriangle } from 'lucide-react'
import { useRouter } from 'next/navigation'

// ─────────────────────────────────────────────────────────────────────────────
// עריכת שיוך הצאצא לצומת בעץ הדורות.
//
// במבנה הקיים הצאצא מצביע לצומת עלה יחיד (lineage_node_id). כאן האדמין בוחר
// צומת חדש (חיפוש לפי שם), רואה תצוגה מקדימה של השרשרת שתיווצר, ושומר.
// השרשרת מחושבת בשרת מהצומת עד השורש.
// ─────────────────────────────────────────────────────────────────────────────

interface Node {
  id: string
  name: string
  generation: number
  parent_id: string | null
  relation?: 'son' | 'son_in_law' | null
  status?: string
}

export default function LineageAssignEditor({
  beneficiaryId, currentNodeId,
}: {
  beneficiaryId: string
  currentNodeId: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [nodes, setNodes] = useState<Node[]>([])
  const [loading, setLoading] = useState(false)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Node | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  // טעינת כל צמתי העץ בפתיחת המודל (פעם אחת)
  useEffect(() => {
    if (!open || nodes.length) return
    setLoading(true); setErr('')
    fetch('/api/admin/lineage')
      .then(r => r.json())
      .then(d => { if (d.nodes) setNodes(d.nodes); else setErr(d.error ?? 'הטעינה נכשלה') })
      .catch(() => setErr('הטעינה נכשלה'))
      .finally(() => setLoading(false))
  }, [open, nodes.length])

  const map = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])

  // תוצאות חיפוש — לפי שם (מסונן), עד 40
  const results = useMemo(() => {
    const term = q.trim()
    if (!term) return []
    return nodes.filter(n => n.name.includes(term)).slice(0, 40)
  }, [q, nodes])

  // תצוגה מקדימה של השרשרת מהצומת שנבחר עד השורש
  const previewChain = useMemo(() => {
    if (!picked) return []
    const chain: Node[] = []
    const seen = new Set<string>()
    let cur: Node | undefined = picked
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      chain.unshift(cur)
      cur = cur.parent_id ? map.get(cur.parent_id) : undefined
    }
    return chain
  }, [picked, map])

  const save = async () => {
    if (!picked) return
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/admin/lineage/assign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiaryId, nodeId: picked.id }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'השמירה נכשלה'); return }
      setOpen(false); setPicked(null); setQ('')
      router.refresh()
    } catch { setErr('שגיאת תקשורת') }
    finally { setSaving(false) }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-300 rounded-lg px-3 py-1.5 transition-colors">
        <GitBranch size={13} /> שנה שיוך לעץ
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" dir="rtl"
          onClick={() => !saving && setOpen(false)}>
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[85vh] overflow-y-auto p-5"
            onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(false)} disabled={saving}
              className="absolute top-4 left-4 text-slate-400 hover:text-slate-600"><X size={18} /></button>
            <h2 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
              <GitBranch size={17} className="text-indigo-600" /> שיוך הצאצא לעץ הדורות
            </h2>
            <p className="text-xs text-slate-500 mb-4">חפשו את הצומת בעץ שאליו הצאצא משתייך. השרשרת המלאה תיגזר אוטומטית.</p>

            {/* חיפוש */}
            <div className="relative mb-3">
              <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={e => { setQ(e.target.value); setPicked(null) }}
                placeholder="חיפוש לפי שם…" autoFocus
                className="w-full rounded-xl border border-slate-300 pr-9 pl-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>

            {loading && <div className="flex items-center gap-2 text-slate-500 text-sm py-4"><Loader2 size={15} className="animate-spin" /> טוען את עץ הדורות…</div>}
            {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{err}</p>}

            {/* תוצאות חיפוש */}
            {!picked && q.trim() && (
              <div className="flex flex-col gap-1 max-h-56 overflow-y-auto">
                {results.length === 0 ? (
                  <p className="text-sm text-slate-400 py-3 text-center">לא נמצאו צמתים תואמים</p>
                ) : results.map(n => (
                  <button key={n.id} type="button" onClick={() => setPicked(n)}
                    className={`flex items-center justify-between text-right rounded-lg border px-3 py-2 text-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50 ${
                      n.id === currentNodeId ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'
                    }`}>
                    <span className="font-medium text-slate-800">{n.name}</span>
                    <span className="text-xs text-slate-400">דור {n.generation}{n.id === currentNodeId ? ' · נוכחי' : ''}</span>
                  </button>
                ))}
              </div>
            )}

            {/* תצוגה מקדימה של השרשרת שתיווצר */}
            {picked && (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                  <p className="text-xs font-semibold text-indigo-900 mb-2">השרשרת שתיווצר:</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {previewChain.map((c, i) => (
                      <span key={c.id} className="flex items-center gap-1">
                        {i > 0 && <ChevronLeft size={11} className="text-slate-300" />}
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white text-slate-700 border border-slate-200">
                          <span className="text-slate-400 ml-1">דור {c.generation}</span>{c.name}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  פעולה זו תעדכן את שיוך הצאצא ואת שרשרת הדורות שלו. ודאו שהצומת נכון.
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setPicked(null)} disabled={saving}
                    className="text-sm text-slate-600 px-3 py-2 rounded-lg hover:bg-slate-50">חזרה לחיפוש</button>
                  <button type="button" onClick={save} disabled={saving}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} שמור שיוך
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
