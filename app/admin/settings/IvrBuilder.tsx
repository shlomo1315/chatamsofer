'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Loader2, Plus, Trash2, Save, Copy, Check, AlertTriangle, Info,
  Phone, ListTree, Volume2, Sparkles, ChevronLeft, Power,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type {
  IvrConfig, IvrNodeDef, IvrNodeType, IvrProblem,
} from '@/lib/ivrBuilder'

// ─────────────────────────────────────────────────────────────────────────────
// בונה השלוחות — המסך שבו המנהל בונה את המערכת הטלפונית.
//
// 🔴 עד כה השלוחות היו קבועות בקוד: הוספת שלוחה או שינוי מקש דרשו
// פריסה. כאן הוא בונה בעצמו — סוג, מקשים, הודעות וקול.
//
// ⚠️ האימות מוצג *בזמן אמת* ולא רק בשמירה: מבנה שבור פירושו מתקשרים
// ששומעים שגיאה או נתקעים, והם פשוט מנתקים בלי שאיש ידע. עדיף שהמנהל
// יראה את הבעיה בזמן שהוא עורך.
// ─────────────────────────────────────────────────────────────────────────────

interface LoadedData {
  config: IvrConfig
  problems: IvrProblem[]
  webhookUrl: string
  typeLabels: Record<string, string>
  typeHints: Record<string, string>
  validDigits: string[]
  tokenSet: boolean
}

const TYPE_ORDER: IvrNodeType[] = ['menu', 'message', 'transfer', 'dial', 'record', 'hangup']

/** מזהה חדש ויציב. ⚠️ בלי תלות ב-Date/Math.random בזמן רינדור. */
let idCounter = 0
const newId = () => `n${Date.now().toString(36)}${(idCounter++).toString(36)}`

export default function IvrBuilder() {
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()

  const [data, setData] = useState<LoadedData | null>(null)
  const [cfg, setCfg] = useState<IvrConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [voiceFor, setVoiceFor] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/yemot-ivr', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'טעינה נכשלה')
      setData(d)
      setCfg(d.config)
      setDirty(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינה נכשלה')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { const t = setTimeout(() => { void load() }, 0); return () => clearTimeout(t) }, [load])

  // ⚠️ האימות רץ בלקוח על אותם כללים של השרת — אבל השרת הוא הקובע.
  // כאן זו רק תצוגה מיידית, כדי שהמנהל לא יגלה את הבעיה רק בשמירה.
  const problems = useMemo<IvrProblem[]>(() => {
    if (!cfg) return []
    const out: IvrProblem[] = []
    const byId = new Map(cfg.nodes.map(n => [n.id, n]))
    for (const n of cfg.nodes) {
      if (n.enabled === false) continue
      if (n.type === 'menu') {
        if (!(n.keys ?? []).length) out.push({ nodeId: n.id, level: 'error', message: 'תפריט בלי מקשים' })
        if (!n.prompt?.text?.trim() && !n.prompt?.file) {
          out.push({ nodeId: n.id, level: 'error', message: 'תפריט בלי הודעה' })
        }
        const used = new Set<string>()
        for (const k of n.keys ?? []) {
          if (used.has(k.digit)) out.push({ nodeId: n.id, level: 'error', message: `המקש ${k.digit} פעמיים` })
          used.add(k.digit)
          if (!byId.has(k.target)) out.push({ nodeId: n.id, level: 'error', message: `המקש ${k.digit} מפנה לשלוחה שאינה קיימת` })
        }
      }
      if (n.type === 'transfer' && !n.folder?.trim()) {
        out.push({ nodeId: n.id, level: 'error', message: 'לא הוגדרה שלוחת יעד' })
      }
      if (n.type === 'dial' && !(n.phone ?? '').replace(/\D/g, '')) {
        out.push({ nodeId: n.id, level: 'error', message: 'לא הוגדר מספר לחיוג' })
      }
    }
    return out
  }, [cfg])

  const errors = problems.filter(p => p.level === 'error')
  const problemsFor = (id: string) => problems.filter(p => p.nodeId === id)

  const patch = (id: string, next: Partial<IvrNodeDef>) => {
    setCfg(c => c && ({ ...c, nodes: c.nodes.map(n => (n.id === id ? { ...n, ...next } : n)) }))
    setDirty(true)
  }

  const addNode = (parentId?: string) => {
    if (!cfg) return
    const id = newId()
    const node: IvrNodeDef = {
      id, name: 'שלוחה חדשה', type: 'message',
      prompt: { text: '' }, enabled: true,
    }
    let nodes = [...cfg.nodes, node]

    // ⚠️ שלוחה חדשה מתחברת מיד למקש פנוי בתפריט האב. שלוחה שאי אפשר
    // להגיע אליה נראית כמו עבודה שנעשתה, ואינה עושה דבר.
    if (parentId) {
      const parent = cfg.nodes.find(n => n.id === parentId)
      if (parent?.type === 'menu') {
        const used = new Set((parent.keys ?? []).map(k => k.digit))
        const free = ['1','2','3','4','5','6','7','8','9','0'].find(d => !used.has(d))
        if (free) {
          nodes = nodes.map(n => n.id === parentId
            ? { ...n, keys: [...(n.keys ?? []), { digit: free, target: id }] }
            : n)
        } else {
          toast.error('כל המקשים בתפריט תפוסים')
        }
      }
    }
    setCfg({ ...cfg, nodes })
    setOpenId(id)
    setDirty(true)
  }

  const removeNode = async (id: string) => {
    if (!cfg) return
    if (id === cfg.rootId) { toast.error('אי אפשר למחוק את שלוחת הפתיחה'); return }
    const node = cfg.nodes.find(n => n.id === id)
    const refs = cfg.nodes.filter(n => (n.keys ?? []).some(k => k.target === id))
    const ok = await confirm({
      title: `למחוק את "${node?.name ?? 'השלוחה'}"?`,
      message: refs.length
        ? `${refs.length} מקשים מפנים אליה — הם יימחקו גם הם.`
        : 'הפעולה אינה הפיכה.',
      confirmLabel: 'מחק',
      danger: true,
    })
    if (!ok) return
    setCfg({
      ...cfg,
      // ⚠️ גם המקשים שמפנים אליה נמחקים: מקש שמצביע לשלוחה שאינה קיימת
      // שולח את המתקשר לשקט.
      nodes: cfg.nodes
        .filter(n => n.id !== id)
        .map(n => ({ ...n, keys: (n.keys ?? []).filter(k => k.target !== id) })),
    })
    setDirty(true)
  }

  const save = async () => {
    if (!cfg) return
    if (errors.length) { toast.error('יש שגיאות שחוסמות שמירה'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/admin/yemot-ivr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: cfg }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'שמירה נכשלה')
      setCfg(d.config)
      setDirty(false)
      toast.success('המבנה נשמר — הוא פעיל מיד')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שמירה נכשלה')
    } finally {
      setSaving(false)
    }
  }

  const genVoice = async (nodeId: string, field: 'prompt' | 'invalid') => {
    const node = cfg?.nodes.find(n => n.id === nodeId)
    const text = (field === 'prompt' ? node?.prompt?.text : node?.invalid?.text) ?? ''
    if (!text.trim()) { toast.error('אין טקסט להקראה'); return }
    if (dirty) { toast.error('שמרו קודם את המבנה'); return }

    setVoiceFor(nodeId)
    try {
      const r = await fetch('/api/admin/yemot-ivr/generate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, field, text }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error ?? 'יצירת הקול נכשלה')
      patch(nodeId, field === 'prompt'
        ? { prompt: { text, file: d.file } }
        : { invalid: { text, file: d.file } })
      setDirty(false)
      toast.success('הקול נוצר והועלה לימות')
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'יצירת הקול נכשלה')
    } finally {
      setVoiceFor(null)
    }
  }

  const copyUrl = async () => {
    if (!data?.webhookUrl) return
    try {
      await navigator.clipboard.writeText(data.webhookUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('ההעתקה נכשלה — סמנו והעתיקו ידנית')
    }
  }

  if (loading) {
    return <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
      <Loader2 size={16} className="animate-spin" /> טוען…
    </div>
  }
  if (!cfg || !data) {
    return <p className="py-4 text-sm text-slate-500">לא ניתן לטעון את המבנה.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {confirmDialog}

      {/* ── כתובת הווהבוק ── */}
      {/* 🔴 בלי הכתובת הזו בימות, שום דבר כאן אינו פעיל. לכן היא ראשונה. */}
      <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50/60 p-4">
        <h4 className="flex items-center gap-1.5 text-sm font-black text-indigo-900">
          <Phone size={15} /> כתובת ה-API להדבקה בימות
        </h4>
        <p className="mt-1 text-xs leading-relaxed text-indigo-800">
          בהגדרות השלוחה בימות: סוג השלוחה <strong>API</strong>, ובשדה הכתובת הדביקו:
        </p>
        <div className="mt-2 flex items-center gap-2">
          <code dir="ltr" className="flex-1 overflow-x-auto rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs text-slate-700">
            {data.webhookUrl}
          </code>
          <button onClick={copyUrl}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700">
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'הועתק' : 'העתק'}
          </button>
        </div>
        {!data.tokenSet && (
          // ⚠️ בלי הטוקן הווהבוק דוחה כל בקשה (fail-closed) — המתקשר
          // ישמע "אין הרשאה". עדיף לומר זאת כאן מאשר לגלות בשיחה.
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            YEMOT_WEBHOOK_SECRET אינו מוגדר בשרת — עד שיוגדר, כל שיחה תישמע &quot;אין הרשאה&quot;.
          </p>
        )}
      </div>

      {/* ── סרגל פעולה ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => addNode()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Plus size={14} /> שלוחה חדשה
          </button>
          <span className="text-xs text-slate-500">{cfg.nodes.length} שלוחות</span>
        </div>
        <button onClick={save} disabled={saving || !dirty || errors.length > 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? 'שומר…' : dirty ? 'שמור שינויים' : 'נשמר'}
        </button>
      </div>

      {/* ── שגיאות חוסמות ── */}
      {errors.length > 0 && (
        <div className="rounded-xl border-2 border-rose-200 bg-rose-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-rose-900">
            <AlertTriangle size={14} /> {errors.length} בעיות שחוסמות שמירה
          </p>
          <ul className="mt-1.5 flex flex-col gap-0.5 text-xs text-rose-800">
            {errors.slice(0, 6).map((p, i) => {
              const n = cfg.nodes.find(x => x.id === p.nodeId)
              return <li key={i}>· {n ? `${n.name}: ` : ''}{p.message}</li>
            })}
          </ul>
        </div>
      )}

      {/* ── רשימת השלוחות ── */}
      <div className="flex flex-col gap-2">
        {cfg.nodes.map(node => {
          const isRoot = node.id === cfg.rootId
          const isOpen = openId === node.id
          const nodeProblems = problemsFor(node.id)
          const hasError = nodeProblems.some(p => p.level === 'error')

          return (
            <div key={node.id}
              className={`rounded-xl border bg-white ${
                hasError ? 'border-rose-300' : isRoot ? 'border-teal-300' : 'border-slate-200'}`}>

              {/* כותרת */}
              <div className="flex items-center gap-2 px-3.5 py-2.5">
                <button onClick={() => setOpenId(isOpen ? null : node.id)}
                  className="flex flex-1 items-center gap-2 text-right">
                  <ChevronLeft size={15}
                    className={`text-slate-400 transition-transform ${isOpen ? '-rotate-90' : ''}`} />
                  <span className="text-sm font-bold text-slate-800">{node.name}</span>
                  {isRoot && (
                    <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-800">
                      פתיחה
                    </span>
                  )}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {data.typeLabels[node.type] ?? node.type}
                  </span>
                  {node.enabled === false && (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                      כבוי
                    </span>
                  )}
                  {hasError && <AlertTriangle size={13} className="text-rose-500" />}
                </button>

                <button onClick={() => patch(node.id, { enabled: node.enabled === false })}
                  title={node.enabled === false ? 'הפעל' : 'כבה'}
                  className={`rounded-lg p-1.5 ${
                    node.enabled === false ? 'text-slate-400 hover:bg-slate-100' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                  <Power size={14} />
                </button>
                {!isRoot && (
                  <button onClick={() => void removeNode(node.id)}
                    className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {/* גוף */}
              {isOpen && (
                <div className="flex flex-col gap-3 border-t border-slate-100 px-3.5 py-3">
                  {nodeProblems.length > 0 && (
                    <ul className="flex flex-col gap-0.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
                      {nodeProblems.map((p, i) => <li key={i}>· {p.message}</li>)}
                    </ul>
                  )}

                  {/* שם + סוג */}
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-slate-600">שם השלוחה</span>
                      <input value={node.name}
                        onChange={e => patch(node.id, { name: e.target.value })}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-slate-600">מה קורה בשלוחה</span>
                      <select value={node.type}
                        onChange={e => patch(node.id, { type: e.target.value as IvrNodeType })}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                        {TYPE_ORDER.map(t => (
                          <option key={t} value={t}>{data.typeLabels[t]}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="flex items-start gap-1.5 text-xs text-slate-500">
                    <Info size={12} className="mt-0.5 shrink-0" /> {data.typeHints[node.type]}
                  </p>

                  {/* ההודעה */}
                  <label className="flex flex-col gap-1">
                    <span className="flex items-center justify-between text-xs font-semibold text-slate-600">
                      <span>ההודעה שנשמעת</span>
                      {node.prompt?.file && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                          <Volume2 size={11} /> מושמע קול מוקלט
                        </span>
                      )}
                    </span>
                    <textarea value={node.prompt?.text ?? ''} rows={2}
                      onChange={e => patch(node.id, { prompt: { ...node.prompt, text: e.target.value } })}
                      className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => void genVoice(node.id, 'prompt')}
                      disabled={voiceFor === node.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50">
                      {voiceFor === node.id ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      יצירת קול נוירוני
                    </button>
                    {node.prompt?.file && (
                      <button onClick={() => patch(node.id, { prompt: { text: node.prompt?.text ?? '', file: null } })}
                        className="text-xs font-semibold text-slate-500 underline">
                        חזרה להקראה חיה
                      </button>
                    )}
                  </div>

                  {/* שדות לפי סוג */}
                  {node.type === 'transfer' && (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-slate-600">שלוחת היעד בימות</span>
                      <input dir="ltr" value={node.folder ?? ''} placeholder="/2"
                        onChange={e => patch(node.id, { folder: e.target.value })}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
                      <span className="text-[11px] text-slate-500">
                        כפי שהיא מוגדרת בימות — למשל <code dir="ltr">/2</code>
                      </span>
                    </label>
                  )}

                  {node.type === 'dial' && (
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-slate-600">מספר לחיוג</span>
                      <input dir="ltr" value={node.phone ?? ''} placeholder="02-1234567"
                        onChange={e => patch(node.id, { phone: e.target.value })}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
                    </label>
                  )}

                  {/* מקשי התפריט */}
                  {node.type === 'menu' && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                          <ListTree size={12} /> מקשים
                        </span>
                        <button onClick={() => addNode(node.id)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">
                          <Plus size={12} /> שלוחה חדשה תחת התפריט
                        </button>
                      </div>

                      {(node.keys ?? []).map((k, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <select value={k.digit}
                            onChange={e => {
                              const keys = [...(node.keys ?? [])]
                              keys[i] = { ...k, digit: e.target.value }
                              patch(node.id, { keys })
                            }}
                            className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-bold">
                            {data.validDigits.map(d => <option key={d} value={d}>{d}</option>)}
                          </select>
                          <select value={k.target}
                            onChange={e => {
                              const keys = [...(node.keys ?? [])]
                              keys[i] = { ...k, target: e.target.value }
                              patch(node.id, { keys })
                            }}
                            className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                            {cfg.nodes.filter(n => n.id !== node.id).map(n => (
                              <option key={n.id} value={n.id}>{n.name}</option>
                            ))}
                          </select>
                          <button onClick={() => patch(node.id, { keys: (node.keys ?? []).filter((_, j) => j !== i) })}
                            className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}

                      {!(node.keys ?? []).length && (
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          אין מקשים — המתקשר ישמע את ההודעה ויישאר תקוע.
                        </p>
                      )}

                      {/* ⚠️ נוסח ההקשה השגויה — בלעדיו מושמע נוסח כללי. */}
                      <label className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-slate-600">כשמקישים מקש לא נכון</span>
                        <input value={node.invalid?.text ?? ''} placeholder="הקשה שגויה"
                          onChange={e => patch(node.id, { invalid: { ...node.invalid, text: e.target.value } })}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
