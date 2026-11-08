'use client'
/* eslint-disable react-hooks/refs -- היסטוריית הביטול נשמרת ב-ref בכוונה (bump מרנדר מחדש); הפונקציות העוטפות נקראות בזמן רינדור רק כדי להעביר handlers */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  X, Save, Loader2, Undo2, Redo2, Monitor, Smartphone, Eye, Pencil, Send, Check, Plus, Trash2,
  ChevronDown, ChevronUp, GripVertical, Mail, Clock, Ban, FileText, Link2, SlidersHorizontal,
  AlertCircle, PanelBottomOpen,
} from 'lucide-react'
import RichTextArea from '@/components/ui/RichTextArea'
import {
  REQUEST_MAILTO_PRESETS, AUTO_REPLY_DEFAULT_TITLE, AUTO_REPLY_DEFAULT_NO_REPLY, MAX_BUTTONS, MAX_SECTIONS,
} from '@/lib/autoReplyConfig'
import type {
  AutoReplyMap, AutoReplySettings as Settings, AutoReplyButton, AutoReplySection, AutoReplyMode,
} from '@/lib/autoReplyConfig'

// ─────────────────────────────────────────────────────────────────────────────
// עורך חי למייל המענה האוטומטי: המייל עצמו ערוך במקום במרכז, ובצד ימין פאנל
// אחד בגלילה אחת עם חלקים מתקפלים. המאפיינים של הבלוק הנבחר תמיד למעלה.
//
// ⚠️ הטקסטים נשמרים כסימון (**מודגש**, [טקסט](כתובת)) ולא כ-HTML, ולכן אין כאן
// contentEditable. הבלוק הנבחר נערך ב-RichTextArea, והשאר מוצגים מעוצבים
// כמו במייל. ההמרה ל-HTML נשארת בשרת, אחרי ניטרול.
//
// ⚠️ המודל קבוע (כותרת, פתיחה, כפתורים, סעיפים, הערת סיום, "אין להשיב"), לכן
// "הוספה" כאן היא סעיף, כפתור, או הפעלת הערת הסיום וה"אין להשיב".
// ─────────────────────────────────────────────────────────────────────────────

export interface LiveEditorDept { key: string; label: string; email: string; color: string; custom?: boolean }

type Sel = string | null // 'title' | 'message' | 'footnote' | 'noreply' | 'tempMessage' | 'g:i' | 's:i' | 's:i:j'

const MODES: { key: AutoReplyMode; label: string; hint: string; icon: typeof Clock }[] = [
  { key: 'full', label: 'מענה ראשי', hint: 'הנוסח המלא', icon: FileText },
  { key: 'temp', label: 'הודעה זמנית', hint: 'נוסח קצר בינתיים', icon: Clock },
  { key: 'off', label: 'ללא מענה', hint: 'לא נשלח כלום', icon: Ban },
]

const URL_OK = /^(https?:\/\/|mailto:)/i

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr
  const next = [...arr]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** תצוגת סימון עשיר כאלמנטי React — בלי dangerouslySetInnerHTML. */
function RichView({ text, empty }: { text: string; empty: string }) {
  if (!text.trim()) return <span className="text-slate-400">{empty}</span>
  const parts = text.split(/(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\([^)\n]*\))/g)
  return (
    <>
      {parts.map((p, i) => {
        const b = /^\*\*([^*\n]+)\*\*$/.exec(p)
        if (b) return <strong key={i}>{b[1]}</strong>
        const l = /^\[([^\]\n]+)\]\(([^)\n]*)\)$/.exec(p)
        if (l && URL_OK.test(l[2].trim())) {
          return <span key={i} className="underline" style={{ color: '#4f46e5' }}>{l[1]}</span>
        }
        return <span key={i}>{p}</span>
      })}
    </>
  )
}

export default function AutoReplyLiveEditor({
  dept, depts, config, s, dirty, saving, onPatch, onSwitchDept, onSave, onClose,
}: {
  dept: LiveEditorDept
  depts: LiveEditorDept[]
  config: AutoReplyMap
  s: Settings
  dirty: boolean
  saving: boolean
  onPatch: (changes: Partial<Settings>) => void
  onSwitchDept: (key: string) => void
  onSave: () => void
  onClose: () => void
}) {
  const [sel, setSel] = useState<Sel>(null)
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop')
  const [view, setView] = useState<'edit' | 'preview'>('edit')
  const [drawer, setDrawer] = useState(false)
  const [open, setOpen] = useState({ structure: true, add: true, box: false })
  const [, bump] = useState(0)
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [dragFrom, setDragFrom] = useState<number | null>(null)

  // ── ביטול וחזרה — snapshot של הגדרות התיבה, עם איחוד הקלדות רצופות ──
  const sRef = useRef(s)
  useEffect(() => { sRef.current = s }, [s])
  const past = useRef<Settings[]>([])
  const future = useRef<Settings[]>([])
  const lastKey = useRef('')
  const lastAt = useRef(0)

  const change = useCallback((changes: Partial<Settings>, key = '') => {
    const now = Date.now()
    const merge = key !== '' && lastKey.current === key && now - lastAt.current < 1200
    if (!merge) {
      past.current.push(sRef.current)
      if (past.current.length > 100) past.current.shift()
      future.current = []
    }
    lastKey.current = key
    lastAt.current = now
    onPatch(changes)
    bump(n => n + 1)
  }, [onPatch])

  const undo = useCallback(() => {
    const prev = past.current.pop()
    if (!prev) return
    future.current.push(sRef.current)
    lastKey.current = ''
    onPatch(prev)
    bump(n => n + 1)
  }, [onPatch])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push(sRef.current)
    lastKey.current = ''
    onPatch(next)
    bump(n => n + 1)
  }, [onPatch])

  // ── קיצורי מקלדת: Ctrl+S שומר; Ctrl+Z / Ctrl+Y מחוץ לשדות טקסט ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const k = e.key.toLowerCase()
      if (k === 's') { e.preventDefault(); onSave(); return }
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo() }
      if (k === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSave, undo, redo])

  // ── תצוגה אמיתית מהשרת (אותה פונקציה ששולחת בפועל) ──
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  useEffect(() => {
    if (view !== 'preview') return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/auto-reply-config', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preview: { department: dept.key }, config }),
        })
        const d = await res.json()
        if (!cancelled && res.ok) setPreview({ subject: d.subject, html: d.html })
      } catch { /* תצוגה בלבד */ }
    }, 200)
    return () => { cancelled = true; clearTimeout(t) }
  }, [view, config, dept.key])
  useEffect(() => {
    const doc = frameRef.current?.contentDocument
    if (view !== 'preview' || !doc || !preview) return
    doc.open(); doc.write(preview.html); doc.close()
  }, [preview, view])

  const flash = (ok: boolean, text: string) => {
    setToast({ ok, text })
    setTimeout(() => setToast(null), 3500)
  }

  const testSend = async () => {
    setTesting(true)
    try {
      const res = await fetch('/api/admin/auto-reply-config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testSend: { department: dept.key }, config }),
      })
      const d = await res.json()
      if (!res.ok) flash(false, d.error ?? 'שליחת מייל הבדיקה נכשלה')
      else flash(true, `מייל בדיקה נשלח אל ${d.to}`)
    } catch { flash(false, 'שגיאת תקשורת — מייל הבדיקה לא נשלח') }
    finally { setTesting(false) }
  }

  // ── פעולות על המבנה ──
  const select = (id: Sel, scroll = false) => {
    setSel(id)
    if (scroll && id) {
      requestAnimationFrame(() => document.getElementById(`blk-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }))
    }
  }

  const addSection = (at = s.sections.length) => {
    if (s.sections.length >= MAX_SECTIONS) { flash(false, `אפשר עד ${MAX_SECTIONS} סעיפים`); return }
    const arr = [...s.sections]
    arr.splice(at, 0, { title: '', text: '', buttons: [] })
    change({ sections: arr })
    select(`s:${at}`, true)
  }

  const addGeneralButton = (b: AutoReplyButton = { label: '', url: '' }) => {
    if (s.buttons.length >= MAX_BUTTONS) { flash(false, `אפשר עד ${MAX_BUTTONS} כפתורים`); return }
    change({ buttons: [...s.buttons, b] })
    select(`g:${s.buttons.length}`, true)
  }

  const addSectionButton = (i: number) => {
    const sec = s.sections[i]
    if (!sec || sec.buttons.length >= MAX_BUTTONS) return
    const arr = [...s.sections]
    arr[i] = { ...sec, buttons: [...sec.buttons, { label: '', url: '' }] }
    change({ sections: arr })
    select(`s:${i}:${sec.buttons.length}`, true)
  }

  /** כפתור הגשה מוכן: הקישור נבנה בשרת ונשמר כ-mailto מלא (ראו ButtonsEditor הישן). */
  const addPreset = async (p: typeof REQUEST_MAILTO_PRESETS[number]) => {
    try {
      const res = await fetch(`/api/request-draft?type=${encodeURIComponent(p.type)}&raw=1`)
      const data = await res.json()
      if (!res.ok || !data?.url) throw new Error('x')
      addGeneralButton({ label: p.label, url: String(data.url) })
    } catch { flash(false, 'לא הצלחנו לבנות את קישור ההגשה. נסו שוב.') }
  }

  const setSection = (i: number, next: AutoReplySection, key?: string) => {
    const arr = [...s.sections]; arr[i] = next
    change({ sections: arr }, key)
  }

  const removeSelected = () => {
    if (!sel) return
    const [k, a, b] = sel.split(':')
    if (k === 'g') change({ buttons: s.buttons.filter((_, j) => j !== Number(a)) })
    else if (k === 's' && b === undefined) change({ sections: s.sections.filter((_, j) => j !== Number(a)) })
    else if (k === 's') {
      const i = Number(a)
      setSection(i, { ...s.sections[i], buttons: s.sections[i].buttons.filter((_, j) => j !== Number(b)) })
    } else if (sel === 'footnote') change({ footnote: '' })
    setSel(null)
  }

  const isTemp = s.mode === 'temp'
  const isOff = s.mode === 'off' || !s.enabled && false
  const wordCount = useMemo(() => {
    const all = [s.message, ...s.sections.map(x => `${x.title} ${x.text}`), s.footnote].join(' ')
    return all.trim() ? all.trim().split(/\s+/).length : 0
  }, [s])
  const noUrl = useMemo(() => [...s.buttons, ...s.sections.flatMap(x => x.buttons)].filter(b => !b.url.trim()).length, [s])

  // ───────────────────────── הפאנל ─────────────────────────
  const field = 'w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:border-[#C0912F] outline-none'

  const Props = () => {
    if (!sel) {
      return <p className="text-xs text-slate-500 leading-relaxed">לחצו על חלק במייל כדי לערוך אותו. כאן יופיעו המאפיינים שלו.</p>
    }
    const [k, a, b] = sel.split(':')
    const btnEditor = (btn: AutoReplyButton | undefined, set: (n: AutoReplyButton) => void, move?: [() => void, () => void]) => {
      if (!btn) return null
      return (
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold text-slate-600">טקסט הכפתור</label>
          <input value={btn.label} onChange={e => set({ ...btn, label: e.target.value })} className={field} />
          <label className="text-[11px] font-bold text-slate-600">כתובת</label>
          <input value={btn.url} dir="ltr" placeholder="https://… או mailto:…"
            onChange={e => set({ ...btn, url: e.target.value })} className={`${field} text-left`} />
          {btn.url.trim() && !URL_OK.test(btn.url.trim()) && (
            <p className="text-[11px] text-amber-700">הכתובת חייבת להתחיל ב-https:// או mailto:</p>
          )}
          <div className="flex items-center gap-2">
            {move && (
              <>
                <button type="button" onClick={move[0]} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:text-[#14213D]" title="הקדמה"><ChevronUp size={14} /></button>
                <button type="button" onClick={move[1]} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:text-[#14213D]" title="דחייה"><ChevronDown size={14} /></button>
              </>
            )}
            <button type="button" onClick={removeSelected}
              className="mr-auto flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700"><Trash2 size={13} /> מחיקה</button>
          </div>
        </div>
      )
    }

    if (k === 'g') {
      const i = Number(a)
      return btnEditor(s.buttons[i], n => { const arr = [...s.buttons]; arr[i] = n; change({ buttons: arr }, sel) },
        [() => { change({ buttons: moveItem(s.buttons, i, i - 1) }); select(`g:${Math.max(0, i - 1)}`) },
         () => { change({ buttons: moveItem(s.buttons, i, i + 1) }); select(`g:${Math.min(s.buttons.length - 1, i + 1)}`) }])
    }
    if (k === 's' && b !== undefined) {
      const i = Number(a), j = Number(b)
      const sec = s.sections[i]
      return btnEditor(sec?.buttons[j], n => {
        const bs = [...sec.buttons]; bs[j] = n; setSection(i, { ...sec, buttons: bs }, sel)
      })
    }
    if (k === 's') {
      const i = Number(a)
      const sec = s.sections[i]
      if (!sec) return null
      return (
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-bold text-slate-600">כותרת הסעיף</label>
          <input value={sec.title} onChange={e => setSection(i, { ...sec, title: e.target.value }, sel)} className={field} />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { change({ sections: moveItem(s.sections, i, i - 1) }); select(`s:${Math.max(0, i - 1)}`) }}
              disabled={i === 0} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:text-[#14213D] disabled:opacity-30" title="הקדמה"><ChevronUp size={14} /></button>
            <button type="button" onClick={() => { change({ sections: moveItem(s.sections, i, i + 1) }); select(`s:${Math.min(s.sections.length - 1, i + 1)}`) }}
              disabled={i === s.sections.length - 1} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:text-[#14213D] disabled:opacity-30" title="דחייה"><ChevronDown size={14} /></button>
            <button type="button" onClick={() => addSectionButton(i)}
              className="flex items-center gap-1 text-xs font-bold text-[#14213D]"><Plus size={13} /> קישור לסעיף</button>
            <button type="button" onClick={removeSelected}
              className="mr-auto flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700"><Trash2 size={13} /> מחיקה</button>
          </div>
        </div>
      )
    }
    if (sel === 'title') {
      return (
        <div className="flex flex-col gap-2 text-xs text-slate-600 leading-relaxed">
          <p>הכיתוב הגדול בראש המייל. ריק — יוצג ״{AUTO_REPLY_DEFAULT_TITLE}״.</p>
          {s.title?.trim() && <button type="button" onClick={() => change({ title: '' })} className="self-start font-bold text-[#14213D] underline">איפוס לברירת מחדל</button>}
        </div>
      )
    }
    if (sel === 'noreply') {
      return (
        <div className="flex flex-col gap-2 text-xs text-slate-600 leading-relaxed">
          <p>השורה הראשונה היא הכותרת המודגשת. ריק — יוצג הנוסח הרגיל.</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => change({ noReplyNotice: ' ' })} className="font-bold text-[#14213D] underline">הסתרת הבלוק</button>
            <button type="button" onClick={() => change({ noReplyNotice: '' })} className="font-bold text-[#14213D] underline">איפוס לברירת מחדל</button>
          </div>
        </div>
      )
    }
    if (sel === 'footnote') {
      return (
        <div className="flex flex-col gap-2 text-xs text-slate-600 leading-relaxed">
          <p>תיבה מודגשת בתחתית המייל. ריקה — לא מוצגת.</p>
          {s.footnote.trim() && <button type="button" onClick={removeSelected} className="self-start font-bold text-red-600">הסרת ההערה</button>}
        </div>
      )
    }
    return <p className="text-xs text-slate-600 leading-relaxed">סמנו טקסט ולחצו ״הדגשה״ או ״קישור״ מעל השדה.</p>
  }

  const Section = ({ id, title, icon, children }: { id: 'structure' | 'add' | 'box'; title: string; icon: ReactNode; children: ReactNode }) => (
    <div className="border-b border-[#E3DED3]">
      <button type="button" onClick={() => setOpen(o => ({ ...o, [id]: !o[id] }))}
        className="w-full flex items-center gap-2 px-4 py-3 text-right text-sm font-black text-[#142036]">
        <span className="text-[#C0912F]">{icon}</span>{title}
        <ChevronDown size={15} className={`mr-auto text-slate-400 transition-transform ${open[id] ? 'rotate-180' : ''}`} />
      </button>
      {open[id] && <div className="px-4 pb-4">{children}</div>}
    </div>
  )

  const structRow = (id: string, label: string, sub?: string, extra?: { drag?: number }) => (
    <div key={id}
      draggable={extra?.drag !== undefined}
      onDragStart={e => { if (extra?.drag === undefined) return; e.dataTransfer.setData('text/plain', String(extra.drag)); setDragFrom(extra.drag) }}
      onDragOver={e => { if (extra?.drag !== undefined) e.preventDefault() }}
      onDrop={e => {
        if (extra?.drag === undefined) return
        e.preventDefault()
        const from = Number(e.dataTransfer.getData('text/plain'))
        if (Number.isFinite(from)) change({ sections: moveItem(s.sections, from, extra.drag) })
        setDragFrom(null)
      }}
      onDragEnd={() => setDragFrom(null)}
      className={dragFrom !== null && extra?.drag === dragFrom ? 'opacity-40' : ''}>
      <button type="button" onClick={() => select(id, true)}
        className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-right text-xs transition-colors ${
          sel === id ? 'bg-[#F6EBCB] font-bold text-[#142036]' : 'text-slate-700 hover:bg-slate-50'}`}>
        {extra?.drag !== undefined
          ? <GripVertical size={13} className="shrink-0 cursor-grab text-slate-300" />
          : <span className="w-[13px] shrink-0" />}
        <span className="truncate">{label}</span>
        {sub && <span className="mr-auto shrink-0 text-[10px] text-slate-400">{sub}</span>}
      </button>
    </div>
  )

  const panel = (
    <div className="flex flex-col">
      {/* מאפיינים — דבוקים למעלה */}
      <div className="sticky top-0 z-10 border-b border-[#E3DED3] bg-[#F6EBCB] px-4 py-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-black text-[#142036]">
          <SlidersHorizontal size={14} className="text-[#C0912F]" />
          {sel ? 'מאפייני הבלוק' : 'מאפיינים'}
        </div>
        {Props()}
      </div>

      {Section({
        id: 'structure', title: 'מבנה המייל', icon: <FileText size={15} />,
        children: isTemp ? (
          <div className="flex flex-col">{structRow('tempMessage', 'ההודעה הזמנית')}</div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {structRow('title', 'כותרת ראשית', s.title?.trim() || 'ברירת מחדל')}
            {structRow('message', 'פסקת פתיחה')}
            {s.buttons.map((b, i) => structRow(`g:${i}`, `כפתור: ${b.label || 'ללא שם'}`))}
            {s.sections.map((x, i) => (
              <div key={i}>
                {structRow(`s:${i}`, `סעיף ${i + 1}: ${x.title || 'ללא כותרת'}`, undefined, { drag: i })}
                <div className="pr-5">{x.buttons.map((b, j) => structRow(`s:${i}:${j}`, `קישור: ${b.label || 'ללא שם'}`))}</div>
              </div>
            ))}
            {structRow('footnote', 'הערת סיום', s.footnote.trim() ? undefined : 'ריקה')}
            {structRow('noreply', 'אין להשיב')}
          </div>
        ),
      })}

      {!isTemp && !isOff && Section({
        id: 'add', title: 'הוספה', icon: <Plus size={15} />,
        children: (
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => addSection()}
              className="flex items-center gap-2 rounded-lg border border-[#E3DED3] bg-white px-3 py-2 text-xs font-bold text-[#142036] hover:border-[#C0912F]">
              <Plus size={13} /> סעיף חדש
            </button>
            <button type="button" onClick={() => addGeneralButton()}
              className="flex items-center gap-2 rounded-lg border border-[#E3DED3] bg-white px-3 py-2 text-xs font-bold text-[#142036] hover:border-[#C0912F]">
              <Link2 size={13} /> כפתור קישור
            </button>
            <button type="button" onClick={() => select('footnote', true)}
              className="flex items-center gap-2 rounded-lg border border-[#E3DED3] bg-white px-3 py-2 text-xs font-bold text-[#142036] hover:border-[#C0912F]">
              <Pencil size={13} /> הערת סיום
            </button>
            <p className="mt-1 text-[11px] font-bold text-slate-500">כפתורי הגשה מוכנים</p>
            <p className="text-[11px] leading-relaxed text-slate-400">נפתח אצל המשפחה חלון כתיבה עם הנמען והנושא מוכנים.</p>
            {REQUEST_MAILTO_PRESETS.map(p => (
              <button key={p.subject} type="button" onClick={() => addPreset(p)}
                className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-right hover:bg-emerald-50">
                <span className="block text-xs font-bold text-slate-800">{p.label}</span>
                <span className="block text-[11px] text-slate-400">{p.hint}</span>
              </button>
            ))}
          </div>
        ),
      })}

      {Section({
        id: 'box', title: 'הגדרות התיבה', icon: <Mail size={15} />,
        children: (
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-600">תיבה</label>
              <select value={dept.key} onChange={e => onSwitchDept(e.target.value)} className={field}>
                {depts.filter(d => d.key !== 'mailing').map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-600">מה נשלח לפונים</label>
              <div className="grid grid-cols-3 gap-1.5">
                {MODES.map(m => {
                  const on = s.mode === m.key
                  const Icon = m.icon
                  return (
                    <button key={m.key} type="button" aria-pressed={on} onClick={() => change({ mode: m.key })}
                      className={`flex flex-col items-center gap-1 rounded-xl border-2 px-1 py-2 text-center transition-colors ${
                        on ? 'border-[#C0912F] bg-[#F6EBCB] text-[#142036]' : 'border-[#E3DED3] bg-white text-slate-500'}`}>
                      <Icon size={15} />
                      <span className="text-[11px] font-bold leading-tight">{m.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <label className="flex cursor-pointer items-center justify-between text-xs font-bold text-slate-700">
              התיבה פעילה
              <input type="checkbox" checked={s.enabled} onChange={e => change({ enabled: e.target.checked })} className="h-4 w-4" />
            </label>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-slate-600">מכסה שבועית לפונה</label>
              <input type="number" min={1} max={100} value={s.weeklyCap}
                onChange={e => change({ weeklyCap: Number(e.target.value) || 10 }, 'cap')}
                className={`${field} w-24`} />
              <p className="mt-1 text-[11px] text-slate-400">בולם מפני לולאת מיילים. מומלץ להשאיר על 10.</p>
            </div>
          </div>
        ),
      })}
    </div>
  )

  // ───────────────────────── הקנבס ─────────────────────────
  const blockCls = (id: string) =>
    `relative rounded-lg transition-shadow cursor-text ${sel === id ? 'ring-2 ring-[#C0912F] ring-offset-2' : 'hover:ring-1 hover:ring-[#C0912F]/50 hover:ring-offset-2'}`

  const richBlock = (id: string, value: string, set: (v: string) => void, placeholder: string, extraCls = '', style?: React.CSSProperties) => (
    <div id={`blk-${id}`} className={`${blockCls(id)} ${extraCls}`} style={style} onClick={() => select(id)}>
      {sel === id ? (
        <RichTextArea value={value} rows={Math.max(3, value.split('\n').length + 1)} placeholder={placeholder}
          onChange={v => set(v)}
          className="w-full resize-y rounded-md border border-[#E3DED3] bg-white/80 px-2 py-1.5 text-[15px] leading-relaxed outline-none" />
      ) : (
        <div className="whitespace-pre-wrap text-[15px] leading-relaxed"><RichView text={value} empty={placeholder} /></div>
      )}
    </div>
  )

  const btnChip = (b: AutoReplyButton, id: string) => (
    <button key={id} id={`blk-${id}`} type="button" onClick={() => select(id)}
      className={`rounded-lg px-4 py-2 text-sm font-bold text-white ${sel === id ? 'ring-2 ring-[#C0912F] ring-offset-2' : ''}`}
      style={{ background: dept.color }}>
      {b.label || 'כפתור חדש'}
      {!b.url.trim() && <span className="mr-1 text-[10px] font-normal opacity-80">· חסרה כתובת</span>}
    </button>
  )

  const insertBar = (at: number) => (
    <button type="button" onClick={() => addSection(at)} title="הוספת סעיף כאן"
      className="group my-0.5 flex w-full items-center gap-2 py-1 opacity-0 transition-opacity hover:opacity-100 focus:opacity-100">
      <span className="h-px flex-1 bg-[#C0912F]/40" />
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#C0912F] text-white"><Plus size={12} /></span>
      <span className="h-px flex-1 bg-[#C0912F]/40" />
    </button>
  )

  const noReplyText = s.noReplyNotice === undefined || s.noReplyNotice === '' ? AUTO_REPLY_DEFAULT_NO_REPLY : s.noReplyNotice
  const noReplyHidden = (s.noReplyNotice ?? '').length > 0 && !(s.noReplyNotice ?? '').trim()

  const subjectField = (
    <input value={isTemp ? s.tempSubject : s.subject}
      onChange={e => change(isTemp ? { tempSubject: e.target.value } : { subject: e.target.value }, 'subject')}
      placeholder="נושא המייל"
      className="min-w-0 flex-1 bg-transparent text-sm font-bold text-[#142036] outline-none" />
  )

  const stage = (
    <div className={`mx-auto w-full transition-all ${device === 'phone' ? 'max-w-[390px]' : 'max-w-[680px]'}`}>
      {/* מעטפה */}
      <div className="mb-3 overflow-hidden rounded-xl border border-[#E3DED3] bg-white text-sm">
        <div className="flex items-center gap-2 border-b border-[#E3DED3] px-3 py-2">
          <span className="w-10 shrink-0 text-xs text-slate-400">מאת</span>
          <span className="truncate text-xs text-slate-700">{dept.label} · <bdi>{dept.email}</bdi></span>
        </div>
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="w-10 shrink-0 text-xs text-slate-400">נושא</span>
          {view === 'preview' ? <span className="truncate text-sm font-bold">{preview?.subject}</span> : subjectField}
        </div>
      </div>

      {view === 'preview' ? (
        <div className="overflow-hidden rounded-2xl border border-[#E3DED3] bg-white">
          {preview
            ? <iframe ref={frameRef} title="תצוגה מקדימה" sandbox="" className="h-[calc(100vh-230px)] min-h-[420px] w-full bg-white" />
            : <div className="flex h-72 items-center justify-center text-slate-400"><Loader2 size={18} className="animate-spin" /></div>}
        </div>
      ) : s.mode === 'off' ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center text-sm text-slate-500">
          <Ban size={22} className="mx-auto mb-2 text-slate-400" />
          במצב ״ללא מענה״ לא נשלח שום מייל לפונים. כדי לערוך את הנוסח, עברו למצב אחר בפס העליון.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#E3DED3] bg-white shadow-sm">
          <div id="blk-title" onClick={() => select('title')} className="cursor-text px-6 py-6 text-center text-white" style={{ background: '#14213D', borderBottom: `4px solid ${dept.color}` }}>
            <div className={`mx-auto max-w-full rounded-md ${sel === 'title' ? 'ring-2 ring-[#C0912F] ring-offset-2 ring-offset-[#14213D]' : ''}`}>
              {isTemp ? (
                <div className="text-xl font-black">{dept.label}</div>
              ) : (
                <input value={s.title ?? ''} onChange={e => change({ title: e.target.value }, 'title')}
                  onFocus={() => select('title')} placeholder={AUTO_REPLY_DEFAULT_TITLE}
                  className="w-full bg-transparent text-center text-2xl font-black text-white outline-none placeholder:text-white/60" />
              )}
            </div>
            <div className="mt-1 text-xs text-white/70">היכל החתם סופר · {dept.label}</div>
          </div>

          <div className="flex flex-col gap-4 px-6 py-6 text-[#142036]">
            {isTemp ? (
              <>
                {richBlock('tempMessage', s.tempMessage, v => change({ tempMessage: v }, 'tempMessage'), 'כתבו כאן את ההודעה הזמנית…')}
                <p className="text-[11px] text-slate-400">הודעה זמנית היא טקסט בלבד, בלי סעיפים וכפתורים.</p>
                {!s.tempMessage.trim() && (
                  <p className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-100 px-2.5 py-2 text-[11px] font-bold text-amber-900">
                    <AlertCircle size={13} className="mt-px shrink-0" /> ההודעה הזמנית ריקה. עד שיוזן בה טקסט יישלח המענה הראשי.
                  </p>
                )}
              </>
            ) : (
              <>
                {richBlock('message', s.message, v => change({ message: v }, 'message'), 'פסקת פתיחה…')}
                {s.buttons.length > 0 && <div className="flex flex-wrap gap-2">{s.buttons.map((b, i) => btnChip(b, `g:${i}`))}</div>}

                {s.sections.map((sec, i) => (
                  <div key={i}>
                    {insertBar(i)}
                    <div id={`blk-s:${i}`}
                      className={`rounded-xl border bg-[#FBF8F1] p-4 ${sel?.startsWith(`s:${i}`) ? 'border-[#C0912F]' : 'border-[#E3DED3]'}`}
                      onClick={() => { if (!sel?.startsWith(`s:${i}`)) select(`s:${i}`) }}>
                      <input value={sec.title} placeholder="כותרת הסעיף"
                        onFocus={() => select(`s:${i}`)}
                        onChange={e => setSection(i, { ...sec, title: e.target.value }, `st${i}`)}
                        className="mb-1 w-full bg-transparent text-base font-black text-[#142036] outline-none" />
                      {sel === `s:${i}` || sel?.startsWith(`s:${i}:`) ? (
                        <RichTextArea value={sec.text} rows={Math.max(2, sec.text.split('\n').length + 1)} placeholder="תיאור הסעיף…"
                          onChange={v => setSection(i, { ...sec, text: v }, `sx${i}`)}
                          className="w-full resize-y rounded-md border border-[#E3DED3] bg-white px-2 py-1.5 text-sm leading-relaxed outline-none" />
                      ) : (
                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700"><RichView text={sec.text} empty="תיאור הסעיף…" /></div>
                      )}
                      {sec.buttons.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">{sec.buttons.map((b, j) => btnChip(b, `s:${i}:${j}`))}</div>
                      )}
                    </div>
                  </div>
                ))}
                {insertBar(s.sections.length)}

                {s.sections.length === 0 && s.buttons.length === 0 && (
                  <button type="button" onClick={() => addSection()}
                    className="rounded-xl border border-dashed border-[#C0912F]/60 py-5 text-sm font-bold text-[#8a6a1f] hover:bg-[#F6EBCB]/50">
                    + הוספת סעיף ראשון
                  </button>
                )}

                {(s.footnote.trim() || sel === 'footnote') && (
                  richBlock('footnote', s.footnote, v => change({ footnote: v }, 'footnote'), 'הערת סיום…',
                    'rounded-xl border-r-4 bg-[#F6EBCB]/60 p-3', { borderColor: '#C0912F' })
                )}
              </>
            )}

            {/* ⚠️ "אין להשיב" קבוע בתחתית — נשלח בכל מייל, ולכן גם בהודעה הזמנית */}
            <div id="blk-noreply" onClick={() => select('noreply')} className={`${blockCls('noreply')} rounded-xl border border-red-200 bg-red-50 p-3`}>
              {sel === 'noreply' ? (
                <RichTextArea value={s.noReplyNotice ?? ''} rows={3} placeholder={AUTO_REPLY_DEFAULT_NO_REPLY}
                  onChange={v => change({ noReplyNotice: v }, 'noreply')}
                  className="w-full resize-y rounded-md border border-red-200 bg-white px-2 py-1.5 text-sm leading-relaxed text-red-900 outline-none" />
              ) : noReplyHidden ? (
                <div className="text-xs text-slate-500">הבלוק מוסתר ולא יופיע במייל. לחצו כדי להחזיר.</div>
              ) : (
                <div className="whitespace-pre-wrap text-xs leading-relaxed text-red-900"><RichView text={noReplyText} empty="" /></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const iconBtn = 'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E3DED3] bg-white text-slate-600 hover:text-[#14213D] disabled:opacity-30'

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#F4F1EA]" dir="rtl" role="dialog" aria-label="עורך המענה האוטומטי">
      {/* פס עליון */}
      <header className="flex flex-wrap items-center gap-2 border-b border-[#E3DED3] bg-white px-3 py-2">
        <button type="button" onClick={onClose} className={iconBtn} title="סגירה"><X size={16} /></button>
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: dept.color }} />
          <span className="truncate text-sm font-black text-[#142036]">{dept.label}</span>
        </div>

        <div className="mr-2 hidden items-center rounded-lg border border-[#E3DED3] bg-[#F4F1EA] p-0.5 sm:flex">
          {MODES.map(m => (
            <button key={m.key} type="button" onClick={() => change({ mode: m.key })} aria-pressed={s.mode === m.key}
              className={`rounded-md px-2.5 py-1 text-xs font-bold ${s.mode === m.key ? 'bg-[#14213D] text-white' : 'text-slate-600'}`}>
              {m.label}
            </button>
          ))}
        </div>

        <div className="mr-auto flex items-center gap-1.5">
          <button type="button" onClick={undo} disabled={!past.current.length} className={iconBtn} title="ביטול (Ctrl+Z)"><Undo2 size={15} /></button>
          <button type="button" onClick={redo} disabled={!future.current.length} className={iconBtn} title="חזרה (Ctrl+Y)"><Redo2 size={15} /></button>
          <button type="button" onClick={() => setView(v => v === 'edit' ? 'preview' : 'edit')}
            className={`${iconBtn} w-auto gap-1 px-2 text-xs font-bold`} title="תצוגה אמיתית כפי שתישלח">
            {view === 'edit' ? <><Eye size={14} /> תצוגה</> : <><Pencil size={14} /> עריכה</>}
          </button>
          <div className="flex items-center rounded-lg border border-[#E3DED3] bg-white p-0.5">
            <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')} title="מחשב"
              className={`rounded-md p-1.5 ${device === 'desktop' ? 'bg-[#F6EBCB] text-[#142036]' : 'text-slate-500'}`}><Monitor size={14} /></button>
            <button type="button" aria-pressed={device === 'phone'} onClick={() => setDevice('phone')} title="טלפון"
              className={`rounded-md p-1.5 ${device === 'phone' ? 'bg-[#F6EBCB] text-[#142036]' : 'text-slate-500'}`}><Smartphone size={14} /></button>
          </div>
          <button type="button" onClick={testSend} disabled={testing}
            className={`${iconBtn} w-auto gap-1 px-2 text-xs font-bold`} title="שליחת המייל הזה אליך לבדיקה">
            {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            <span className="hidden md:inline">מייל בדיקה אליי</span>
          </button>
          <span className={`hidden text-xs font-bold md:inline ${dirty ? 'text-amber-700' : 'text-emerald-700'}`}>
            {dirty ? 'יש שינויים' : <span className="inline-flex items-center gap-1"><Check size={13} /> נשמר</span>}
          </span>
          <button type="button" onClick={onSave} disabled={saving || !dirty}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#14213D] px-3 text-xs font-bold text-white hover:bg-[#0E1830] disabled:opacity-50" title="שמירה (Ctrl+S)">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} שמירה
          </button>
        </div>
      </header>

      {/* מונים */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[#E3DED3] bg-white/70 px-4 py-1.5 text-[11px] text-slate-500">
        <span>{s.sections.length} סעיפים</span>
        <span>{s.buttons.length + s.sections.reduce((n, x) => n + x.buttons.length, 0)} כפתורים</span>
        <span className={noUrl ? 'font-bold text-amber-700' : ''}>{noUrl} בלי כתובת</span>
        <span>{wordCount} מילים</span>
        {toast && <span className={`mr-auto font-bold ${toast.ok ? 'text-emerald-700' : 'text-red-600'}`}>{toast.text}</span>}
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[360px] shrink-0 overflow-y-auto border-l border-[#E3DED3] bg-white lg:block">{panel}</aside>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 pb-24 lg:pb-8" onClick={e => { if (e.target === e.currentTarget) setSel(null) }}>
          {stage}
        </main>
      </div>

      {/* טלפון: מגירה מלמטה */}
      <button type="button" onClick={() => setDrawer(true)}
        className="fixed bottom-4 left-4 z-[61] inline-flex items-center gap-2 rounded-full bg-[#14213D] px-4 py-3 text-sm font-bold text-white shadow-xl lg:hidden">
        <PanelBottomOpen size={16} /> כלים ומאפיינים
      </button>
      {drawer && (
        <div className="fixed inset-0 z-[62] lg:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[78vh] flex-col rounded-t-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#E3DED3] px-4 py-2.5">
              <span className="text-sm font-black text-[#142036]">כלים ומאפיינים</span>
              <button type="button" onClick={() => setDrawer(false)} className={iconBtn}><X size={15} /></button>
            </div>
            <div className="overflow-y-auto">{panel}</div>
          </div>
        </div>
      )}
    </div>
  )
}
