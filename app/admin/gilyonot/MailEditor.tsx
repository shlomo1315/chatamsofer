'use client'

// עורך מייל הגיליון: גוף עשיר (טקסט, קישורים, כפתורים, תמונות, מפריד),
// עיצוב החלקים הקבועים (כותרת, פתיחה, כפתור הורדה, פוטר), תבניות שמורות
// ותצוגה חיה. שומר אוטומטית לטיוטה. הניקוי הסופי נעשה בשרת (lib/gilyonotRichHtml.ts).

import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import DOMPurify from 'dompurify'
import {
  AlignCenter, AlignLeft, AlignRight, Baseline, Bold, Check, Code2, Eraser, Highlighter, ImagePlus, Italic, LayoutTemplate,
  Link2, List, ListOrdered, Loader2, Minus, Monitor, MousePointerClick, Palette, PilcrowRight, Redo2, RotateCcw, Save,
  Smartphone, Strikethrough, Trash2, Underline, Undo2, Unlink, UserRound, X,
} from 'lucide-react'
import { DEFAULT_DESIGN, NAME_TOKEN, normalizeDesign, SYSTEM_BLUE, type MailDesign } from '@/lib/gilyonotDesign'
import { btnDanger, btnGhost, btnPrimary, input } from './ui'
import type { IssueView } from './GilyonotClient'

interface Template { id: string; name: string; subject: string | null; body_html: string | null; design: unknown; updated_at: string }
type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

const SWATCHES = ['#0f172a', '#334155', '#64748b', SYSTEM_BLUE, '#1d4ed8', '#0891b2', '#059669', '#ca8a04', '#ea580c', '#e11d48', '#7c3aed', '#ffffff']
const HILITES = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#e2e8f0']
const FONTS = [['Arial', 'אריאל'], ['David', 'דוד'], ['Frank Ruehl CLM, David, serif', 'פרנק רוהל'], ['Tahoma', 'טהומה'], ['Georgia, serif', 'ג׳ורג׳יה']]
const SIZES = [['2', 'קטן'], ['3', 'רגיל'], ['4', 'בינוני'], ['5', 'גדול'], ['6', 'גדול מאוד']]
const BLOCKS = [['p', 'פסקה'], ['h1', 'כותרת ראשית'], ['h2', 'כותרת'], ['h3', 'כותרת משנה'], ['blockquote', 'ציטוט']]
const PASTE_TAGS = ['p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'img', 'hr', 'blockquote']

const clean = (html: string) => DOMPurify.sanitize(html, { ALLOWED_TAGS: [...PASTE_TAGS, 'table', 'tbody', 'tr', 'td', 'font'], ALLOWED_ATTR: ['href', 'src', 'alt', 'style', 'dir', 'data-btn', 'width', 'align', 'size', 'face', 'color'] })
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const withScheme = (u: string) => (/^(https?:|mailto:)/i.test(u) ? u : /^[\w.+-]+@[\w-]+\.[\w.]+$/.test(u) ? `mailto:${u}` : `https://${u}`)
const buttonHtml = (label: string, href: string, bg = SYSTEM_BLUE, fg = '#ffffff') =>
  `<p style="text-align:center"><a href="${esc(href)}" data-btn="1" style="display:inline-block;background-color:${bg};color:${fg};padding:12px 28px;border-radius:10px;font-weight:bold;text-decoration:none;">${esc(label)}</a></p><p><br></p>`

function initialHtml(issue: IssueView) {
  if (issue.body_html) return issue.body_html
  if (issue.intro?.trim()) return issue.intro.trim().split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')
  return '<p><br></p>'
}

async function call(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(d.error || 'הפעולה נכשלה')
  return d
}
const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// ─── רכיבים קטנים ────────────────────────────────────────────────────────────

function Tool({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active}
      onMouseDown={e => e.preventDefault()} onClick={onClick}
      className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-1.5 text-slate-600 transition-colors hover:bg-white hover:text-slate-900 hover:shadow-sm ${active ? 'bg-white text-[#2563eb] shadow-sm' : ''}`}>
      {children}
    </button>
  )
}
const Sep = () => <span className="mx-0.5 h-6 w-px bg-slate-200" aria-hidden />

function Pop({ open, children }: { open: boolean; children: ReactNode }) {
  if (!open) return null
  return <div className="absolute top-full z-20 mt-1 rounded-xl bg-white p-2.5 shadow-lg ring-1 ring-slate-900/10" onMouseDown={e => { if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault() }}>{children}</div>
}

function Swatches({ colors, onPick }: { colors: string[]; onPick: (c: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {colors.map(c => (
        <button key={c} type="button" onMouseDown={e => e.preventDefault()} onClick={() => onPick(c)} aria-label={c} title={c}
          className="h-6 w-6 rounded-md ring-1 ring-inset ring-slate-900/15 hover:scale-110" style={{ background: c }} />
      ))}
    </div>
  )
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-slate-800">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <input type="color" value={value} onChange={e => onChange(e.target.value)} aria-label={label} className="h-9 w-11 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" />
        <input dir="ltr" value={value} onChange={e => onChange(e.target.value)} maxLength={7} aria-label={`${label}, קוד`} className={`${input.replace("w-full", "")} w-28 py-2 font-mono text-xs`} />
        <Swatches colors={SWATCHES.slice(0, 11)} onPick={onChange} />
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-800">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative h-5 w-9 rounded-full bg-slate-300 transition-colors after:absolute after:right-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-[#2563eb] peer-checked:after:-translate-x-4 peer-focus-visible:ring-4 peer-focus-visible:ring-[#2563eb]/20" aria-hidden />
      {label}
    </label>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-800">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

// ─── העורך ───────────────────────────────────────────────────────────────────

export default function MailEditor({ base, issue, saveRef }: { base: string; issue: IssueView; saveRef: MutableRefObject<(() => Promise<void>) | null> }) {
  const router = useRouter()
  const ed = useRef<HTMLDivElement>(null)
  const range = useRef<Range | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [html, setHtml] = useState(() => initialHtml(issue))
  const [design, setDesign] = useState<MailDesign>(() => normalizeDesign(issue.design))
  const htmlRef = useRef(html)
  const designRef = useRef(design)
  useEffect(() => { htmlRef.current = html; designRef.current = design }, [html, design])

  const [mode, setMode] = useState<'visual' | 'code'>('visual')
  const [code, setCode] = useState('')
  const [pop, setPop] = useState<'' | 'block' | 'font' | 'size' | 'color' | 'hilite' | 'link' | 'button' | 'image'>('')
  const [linkText, setLinkText] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [imgUrl, setImgUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [picked, setPicked] = useState<HTMLElement | null>(null)
  const [, bump] = useState(0)
  const [tab, setTab] = useState<'header' | 'greeting' | 'footer' | 'bg'>('header')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [preview, setPreview] = useState('')
  const [state, setState] = useState<SaveState>('saved')
  const [err, setErr] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [tplId, setTplId] = useState('')
  const [tplBusy, setTplBusy] = useState(false)

  // תוכן התחלתי פעם אחת: מכאן העורך מנהל את ה-DOM בעצמו.
  useEffect(() => {
    if (ed.current) ed.current.innerHTML = htmlRef.current
    document.execCommand('defaultParagraphSeparator', false, 'p')
  }, [])

  useEffect(() => {
    const onSel = () => {
      const s = document.getSelection()
      if (s?.rangeCount && ed.current?.contains(s.anchorNode)) range.current = s.getRangeAt(0).cloneRange()
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  const sync = useCallback(() => { if (ed.current) setHtml(ed.current.innerHTML) }, [])

  const restore = () => {
    const el = ed.current
    if (!el) return
    el.focus()
    const s = document.getSelection()
    if (range.current && s) { s.removeAllRanges(); s.addRange(range.current) }
    else if (s) { s.selectAllChildren(el); s.collapseToEnd() }
  }
  const exec = (cmd: string, val?: string) => {
    restore()
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(cmd, false, val)
    setPop('')
    sync()
  }
  const insert = (h: string) => exec('insertHTML', h)
  const setDir = (dir: 'rtl' | 'ltr') => {
    restore()
    let n: Node | null = document.getSelection()?.anchorNode ?? null
    while (n && n.parentNode !== ed.current) n = n.parentNode
    if (n instanceof HTMLElement) { n.dir = dir; n.style.textAlign = dir === 'rtl' ? 'right' : 'left'; sync() }
  }

  // ── שמירה אוטומטית ──
  const ver = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  const first = useRef(true)

  const save = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (!dirty.current) return
    const v = ++ver.current
    dirty.current = false
    setState('saving')
    try {
      await call(base, jsonInit('PATCH', { body_html: htmlRef.current, design: designRef.current }))
      if (v === ver.current) { setState(dirty.current ? 'dirty' : 'saved'); setErr('') }
    } catch (e) {
      dirty.current = true
      setState('error'); setErr(e instanceof Error ? e.message : 'השמירה נכשלה')
      throw e
    }
  }, [base])

  useEffect(() => { saveRef.current = save; return () => { saveRef.current = null } }, [save, saveRef])

  useEffect(() => {
    if (first.current) { first.current = false; return }
    dirty.current = true
    setState('dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { save().catch(() => {}) }, 1500)
  }, [html, design, save])

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) e.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  // ── תצוגה חיה ──
  useEffect(() => {
    const ctl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${base}/preview`, { ...jsonInit('POST', { body_html: html, design }), signal: ctl.signal })
        if (res.ok) setPreview(await res.text())
      } catch { /* בוטל או נכשל: התצוגה הקודמת נשארת */ }
    }, 400)
    return () => { clearTimeout(t); ctl.abort() }
  }, [base, html, design])

  // ── תבניות ──
  useEffect(() => {
    call('/api/admin/gilyonot/templates').then(d => setTemplates(d.templates ?? [])).catch(() => {})
  }, [])

  async function loadTemplate() {
    const t = templates.find(x => x.id === tplId)
    if (!t || !confirm(`לטעון את התבנית "${t.name}"? התוכן והעיצוב הנוכחיים יוחלפו.`)) return
    const body = t.body_html || '<p><br></p>'
    if (ed.current) ed.current.innerHTML = body
    setHtml(body); setDesign(normalizeDesign(t.design)); setPicked(null)
    if (t.subject && t.subject !== issue.subject) {
      try { await call(base, jsonInit('PATCH', { subject: t.subject })); router.refresh() } catch { /* הנושא יישאר כמו שהוא */ }
    }
  }
  async function saveTemplate(asNew: boolean) {
    const cur = templates.find(x => x.id === tplId)
    const name = asNew || !cur ? prompt('שם לתבנית:', `תבנית ${issue.title}`)?.trim() : cur.name
    if (!name) return
    if (!asNew && cur && !confirm(`לעדכן את התבנית "${cur.name}" לפי המייל הנוכחי?`)) return
    setTplBusy(true)
    try {
      const d = await call('/api/admin/gilyonot/templates', jsonInit('POST', { id: asNew ? undefined : cur?.id, name, subject: issue.subject, body_html: htmlRef.current, design: designRef.current }))
      const t = d.template as Template
      setTemplates(list => [t, ...list.filter(x => x.id !== t.id)]); setTplId(t.id); setErr('')
    } catch (e) { setErr(e instanceof Error ? e.message : 'שמירת התבנית נכשלה') }
    finally { setTplBusy(false) }
  }
  async function deleteTemplate() {
    const cur = templates.find(x => x.id === tplId)
    if (!cur || !confirm(`למחוק את התבנית "${cur.name}"?`)) return
    setTplBusy(true)
    try {
      await call(`/api/admin/gilyonot/templates?id=${cur.id}`, { method: 'DELETE' })
      setTemplates(list => list.filter(x => x.id !== cur.id)); setTplId('')
    } catch (e) { setErr(e instanceof Error ? e.message : 'מחיקת התבנית נכשלה') }
    finally { setTplBusy(false) }
  }

  // ── קישור, כפתור ותמונה ──
  const openPop = (p: typeof pop) => {
    if (p === 'link' || p === 'button') {
      setLinkText(range.current?.toString() ?? '')
      setLinkUrl('')
    }
    setPop(cur => (cur === p ? '' : p))
  }
  const insertLink = () => {
    if (!linkUrl.trim()) return
    const href = withScheme(linkUrl.trim())
    insert(`<a href="${esc(href)}">${esc(linkText.trim() || range.current?.toString() || linkUrl.trim())}</a>&nbsp;`)
  }
  const insertButton = () => {
    if (!linkUrl.trim()) return
    insert(buttonHtml(linkText.trim() || 'לחצו כאן', withScheme(linkUrl.trim())))
  }
  const insertImage = (src: string) => {
    insert(`<img src="${esc(src)}" alt="" style="display:block;width:100%;max-width:100%;height:auto;margin:0 auto 14px;"><p><br></p>`)
    setImgUrl('')
  }
  async function upload(file: File) {
    setUploading(true); setErr('')
    try {
      const fd = new FormData()
      fd.set('file', file)
      const d = await call('/api/admin/gilyonot/upload', { method: 'POST', body: fd })
      insertImage(String(d.url))
    } catch (e) { setErr(e instanceof Error ? e.message : 'העלאת התמונה נכשלה') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  // ── אלמנט שנבחר בלחיצה (קישור, כפתור או תמונה) ──
  const edit = (fn: (el: HTMLElement) => void) => { if (picked) { fn(picked); bump(n => n + 1); sync() } }
  const removePicked = () => edit(el => {
    if (el.tagName === 'A' && !el.dataset.btn) el.replaceWith(document.createTextNode(el.textContent ?? ''))
    else {
      const parent = el.parentElement
      el.remove()
      if (parent && parent !== ed.current && !parent.textContent?.trim() && !parent.querySelector('img')) parent.remove()
    }
    setPicked(null)
  })

  function onPaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const h = e.clipboardData.getData('text/html')
    const t = e.clipboardData.getData('text/plain')
    insert(h ? clean(h) : esc(t).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join(''))
  }

  function toggleCode() {
    if (mode === 'visual') { setCode(ed.current?.innerHTML ?? html); setMode('code'); setPicked(null) }
    else {
      const h = clean(code) || '<p><br></p>'
      if (ed.current) ed.current.innerHTML = h
      setHtml(h); setMode('visual')
    }
  }

  const set = <K extends keyof MailDesign>(k: K, v: MailDesign[K]) => setDesign(d => ({ ...d, [k]: v }))
  const isBtn = picked?.tagName === 'A' && !!picked.dataset.btn
  const status = { saved: 'נשמר', dirty: 'יש שינויים', saving: 'שומר...', error: 'השמירה נכשלה' }[state]

  return (
    <div className="space-y-4 border-b border-slate-100 p-5">
      {/* שורת עליונה: תבניות ושמירה */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><PilcrowRight className="h-4 w-4 text-[#2563eb]" aria-hidden />עריכת המייל</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 text-xs ${state === 'error' ? 'text-rose-700' : 'text-slate-500'}`} aria-live="polite">
            {state === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : state === 'saved' ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : null}{status}
          </span>
          <button type="button" className={`${btnGhost} min-h-9 px-3`} disabled={state === 'saving' || state === 'saved'} onClick={() => { dirty.current = true; save().catch(() => {}) }}>
            <Save className="h-4 w-4" aria-hidden />שמירה
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50/80 p-3 ring-1 ring-inset ring-slate-900/[0.04]">
        <LayoutTemplate className="h-4 w-4 text-slate-500" aria-hidden />
        <select value={tplId} onChange={e => setTplId(e.target.value)} className={`${input.replace("w-full", "")} min-w-44 flex-1 py-1.5 sm:max-w-xs`} aria-label="תבנית">
          <option value="">{templates.length ? 'בחירת תבנית...' : 'אין עדיין תבניות שמורות'}</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button type="button" className={`${btnGhost} min-h-9 px-3`} disabled={!tplId || tplBusy} onClick={loadTemplate}>טעינה</button>
        <button type="button" className={`${btnGhost} min-h-9 px-3`} disabled={tplBusy} onClick={() => saveTemplate(true)}><Save className="h-4 w-4" aria-hidden />שמירה כתבנית</button>
        {tplId && <button type="button" className={`${btnGhost} min-h-9 px-3`} disabled={tplBusy} onClick={() => saveTemplate(false)}>עדכון התבנית</button>}
        {tplId && <button type="button" className={`${btnDanger} min-h-9 px-3`} disabled={tplBusy} onClick={deleteTemplate} aria-label="מחיקת התבנית"><Trash2 className="h-4 w-4" aria-hidden /></button>}
      </div>

      {err && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}

      <div className="grid gap-5 xl:grid-cols-2">
        {/* ── עמודת העריכה ── */}
        <div className="min-w-0 space-y-4">
          <div className="overflow-visible rounded-xl ring-1 ring-slate-200 focus-within:ring-[#2563eb]/40">
            {/* סרגל כלים */}
            <div className="flex flex-wrap items-center gap-0.5 rounded-t-xl border-b border-slate-200 bg-slate-50 p-1.5" role="toolbar" aria-label="עיצוב טקסט">
              {mode === 'visual' && <>
                <Tool label="ביטול" onClick={() => exec('undo')}><Undo2 className="h-4 w-4" /></Tool>
                <Tool label="חזרה" onClick={() => exec('redo')}><Redo2 className="h-4 w-4" /></Tool>
                <Sep />
                <div className="relative">
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => openPop('block')} className="h-9 rounded-lg px-2 text-sm text-slate-700 hover:bg-white hover:shadow-sm">סוג טקסט ▾</button>
                  <Pop open={pop === 'block'}>
                    <div className="flex w-40 flex-col">{BLOCKS.map(([t, l]) => <button key={t} type="button" onClick={() => exec('formatBlock', `<${t}>`)} className={`rounded-lg px-2 py-1.5 text-right hover:bg-slate-100 ${t === 'p' ? 'text-sm' : t === 'blockquote' ? 'border-r-2 border-slate-300 text-sm text-slate-600' : 'font-bold'}`}>{l}</button>)}</div>
                  </Pop>
                </div>
                <div className="relative">
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => openPop('font')} className="h-9 rounded-lg px-2 text-sm text-slate-700 hover:bg-white hover:shadow-sm">גופן ▾</button>
                  <Pop open={pop === 'font'}>
                    <div className="flex w-40 flex-col">{FONTS.map(([f, l]) => <button key={f} type="button" onClick={() => exec('fontName', f)} style={{ fontFamily: f }} className="rounded-lg px-2 py-1.5 text-right hover:bg-slate-100">{l}</button>)}</div>
                  </Pop>
                </div>
                <div className="relative">
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => openPop('size')} className="h-9 rounded-lg px-2 text-sm text-slate-700 hover:bg-white hover:shadow-sm">גודל ▾</button>
                  <Pop open={pop === 'size'}>
                    <div className="flex w-36 flex-col">{SIZES.map(([s, l]) => <button key={s} type="button" onClick={() => exec('fontSize', s)} className="rounded-lg px-2 py-1 text-right hover:bg-slate-100" style={{ fontSize: `${10 + Number(s) * 2}px` }}>{l}</button>)}</div>
                  </Pop>
                </div>
                <Sep />
                <Tool label="מודגש" onClick={() => exec('bold')}><Bold className="h-4 w-4" /></Tool>
                <Tool label="נטוי" onClick={() => exec('italic')}><Italic className="h-4 w-4" /></Tool>
                <Tool label="קו תחתון" onClick={() => exec('underline')}><Underline className="h-4 w-4" /></Tool>
                <Tool label="קו חוצה" onClick={() => exec('strikeThrough')}><Strikethrough className="h-4 w-4" /></Tool>
                <div className="relative">
                  <Tool label="צבע טקסט" onClick={() => openPop('color')} active={pop === 'color'}><Baseline className="h-4 w-4" /></Tool>
                  <Pop open={pop === 'color'}><Swatches colors={SWATCHES} onPick={c => exec('foreColor', c)} /></Pop>
                </div>
                <div className="relative">
                  <Tool label="צבע רקע לטקסט" onClick={() => openPop('hilite')} active={pop === 'hilite'}><Highlighter className="h-4 w-4" /></Tool>
                  <Pop open={pop === 'hilite'}><Swatches colors={[...HILITES, 'transparent']} onPick={c => exec('hiliteColor', c)} /></Pop>
                </div>
                <Sep />
                <Tool label="יישור לימין" onClick={() => exec('justifyRight')}><AlignRight className="h-4 w-4" /></Tool>
                <Tool label="מרכוז" onClick={() => exec('justifyCenter')}><AlignCenter className="h-4 w-4" /></Tool>
                <Tool label="יישור לשמאל" onClick={() => exec('justifyLeft')}><AlignLeft className="h-4 w-4" /></Tool>
                <Tool label="פסקה משמאל לימין (אנגלית)" onClick={() => setDir('ltr')}><span className="text-[11px] font-bold">LTR</span></Tool>
                <Tool label="פסקה מימין לשמאל" onClick={() => setDir('rtl')}><span className="text-[11px] font-bold">RTL</span></Tool>
                <Tool label="רשימה" onClick={() => exec('insertUnorderedList')}><List className="h-4 w-4" /></Tool>
                <Tool label="רשימה ממוספרת" onClick={() => exec('insertOrderedList')}><ListOrdered className="h-4 w-4" /></Tool>
                <Sep />
                <div className="relative">
                  <Tool label="קישור" onClick={() => openPop('link')} active={pop === 'link'}><Link2 className="h-4 w-4" /></Tool>
                  <Pop open={pop === 'link' || pop === 'button'}>
                    <div className="w-64 space-y-2">
                      <p className="text-xs font-semibold text-slate-700">{pop === 'button' ? 'הוספת כפתור' : 'הוספת קישור'}</p>
                      <input className={`${input} py-1.5`} placeholder={pop === 'button' ? 'טקסט הכפתור' : 'הטקסט שיוצג'} value={linkText} onChange={e => setLinkText(e.target.value)} />
                      <input className={`${input} py-1.5`} dir="ltr" placeholder="https://..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (pop === 'button') insertButton(); else insertLink() } }} />
                      <button type="button" className={`${btnPrimary} w-full py-1.5`} disabled={!linkUrl.trim()} onClick={pop === 'button' ? insertButton : insertLink}>הוספה</button>
                    </div>
                  </Pop>
                </div>
                <Tool label="הסרת קישור" onClick={() => exec('unlink')}><Unlink className="h-4 w-4" /></Tool>
                <Tool label="כפתור" onClick={() => openPop('button')} active={pop === 'button'}><MousePointerClick className="h-4 w-4" /></Tool>
                <div className="relative">
                  <Tool label="תמונה" onClick={() => openPop('image')} active={pop === 'image'}>{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}</Tool>
                  <Pop open={pop === 'image'}>
                    <div className="w-64 space-y-2">
                      <p className="text-xs font-semibold text-slate-700">הוספת תמונה</p>
                      <button type="button" className={`${btnGhost} w-full py-1.5`} disabled={uploading} onClick={() => fileRef.current?.click()}><ImagePlus className="h-4 w-4" aria-hidden />העלאה מהמחשב</button>
                      <div className="flex gap-1.5">
                        <input className={`${input} py-1.5`} dir="ltr" placeholder="או כתובת תמונה https://..." value={imgUrl} onChange={e => setImgUrl(e.target.value)} />
                        <button type="button" className={`${btnPrimary} px-3 py-1.5`} disabled={!/^https?:\/\//.test(imgUrl.trim())} onClick={() => insertImage(imgUrl.trim())}>הוספה</button>
                      </div>
                    </div>
                  </Pop>
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={e => { const f = e.target.files?.[0]; setPop(''); if (f) upload(f) }} />
                </div>
                <Tool label="קו מפריד" onClick={() => exec('insertHorizontalRule')}><Minus className="h-4 w-4" /></Tool>
                <Tool label="הכנסת שם הנמען" onClick={() => insert(NAME_TOKEN)}><UserRound className="h-4 w-4" /></Tool>
                <Tool label="ניקוי עיצוב" onClick={() => exec('removeFormat')}><Eraser className="h-4 w-4" /></Tool>
                <Sep />
              </>}
              <Tool label={mode === 'code' ? 'חזרה לעורך' : 'עריכת HTML'} onClick={toggleCode} active={mode === 'code'}><Code2 className="h-4 w-4" /></Tool>
              {mode === 'code' && <span className="px-1 text-xs text-slate-500">עריכת HTML. לחצו שוב כדי לחזור לעורך.</span>}
            </div>

            <div
              ref={ed}
              contentEditable={mode === 'visual'}
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label="גוף המייל"
              dir="rtl"
              onInput={sync}
              onBlur={sync}
              onPaste={onPaste}
              onFocus={() => setPop('')}
              onClick={e => {
                const el = (e.target as HTMLElement).closest('a, img') as HTMLElement | null
                setPicked(el && ed.current?.contains(el) ? el : null)
                if (el?.tagName === 'A') e.preventDefault()
              }}
              className={`min-h-[320px] rounded-b-xl bg-white px-6 py-5 text-[16px] leading-[1.8] text-slate-700 outline-none ${mode === 'code' ? 'hidden' : ''}
                [&_a]:text-[#2563eb] [&_a]:underline [&_a[data-btn]]:no-underline [&_blockquote]:my-3 [&_blockquote]:border-r-[3px] [&_blockquote]:border-slate-300 [&_blockquote]:pr-3.5 [&_blockquote]:text-slate-600
                [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-slate-900 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-slate-900 [&_h3]:mb-2.5 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-slate-900
                [&_hr]:my-5 [&_hr]:border-slate-200 [&_img]:cursor-pointer [&_img]:rounded [&_ol]:list-decimal [&_ol]:pr-6 [&_p]:mb-3.5 [&_ul]:list-disc [&_ul]:pr-6`}
            />
            {mode === 'code' && (
              <textarea value={code} onChange={e => setCode(e.target.value)} dir="ltr" spellCheck={false} aria-label="קוד HTML"
                className="block min-h-[320px] w-full rounded-b-xl bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100 outline-none" />
            )}
          </div>

          {/* פאנל לאלמנט שנבחר */}
          {picked && mode === 'visual' && (
            <div className="space-y-3 rounded-xl bg-[#2563eb]/[0.04] p-4 ring-1 ring-inset ring-[#2563eb]/15">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">{picked.tagName === 'IMG' ? 'תמונה שנבחרה' : isBtn ? 'כפתור שנבחר' : 'קישור שנבחר'}</p>
                <button type="button" onClick={() => setPicked(null)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white" aria-label="סגירה"><X className="h-4 w-4" /></button>
              </div>
              {picked.tagName === 'A' ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="טקסט"><input className={input} value={picked.textContent ?? ''} onChange={e => edit(el => { el.textContent = e.target.value })} /></Field>
                    <Field label="כתובת"><input className={input} dir="ltr" value={picked.getAttribute('href') ?? ''} onChange={e => edit(el => el.setAttribute('href', e.target.value))} onBlur={e => edit(el => { if (e.target.value.trim()) el.setAttribute('href', withScheme(e.target.value.trim())) })} /></Field>
                  </div>
                  {isBtn && <>
                    <ColorField label="צבע הכפתור" value={rgbToHex(picked.style.backgroundColor) || SYSTEM_BLUE} onChange={v => edit(el => { el.style.backgroundColor = v })} />
                    <ColorField label="צבע הטקסט" value={rgbToHex(picked.style.color) || '#ffffff'} onChange={v => edit(el => { el.style.color = v })} />
                  </>}
                  <button type="button" className={`${btnDanger} min-h-9 px-3`} onClick={removePicked}><Trash2 className="h-4 w-4" aria-hidden />{isBtn ? 'מחיקת הכפתור' : 'הסרת הקישור'}</button>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">רוחב:</span>
                    {['100%', '75%', '50%', '33%'].map(w => (
                      <button key={w} type="button" onClick={() => edit(el => { el.style.width = w })} className={`${btnGhost} min-h-9 px-3 ${picked.style.width === w ? 'ring-2 ring-[#2563eb]/40' : ''}`}>{w}</button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">מיקום:</span>
                    {([['ימין', '0 0 14px auto'], ['מרכז', '0 auto 14px'], ['שמאל', '0 auto 14px 0']] as const).map(([l, m]) => (
                      <button key={l} type="button" onClick={() => edit(el => { el.style.margin = m })} className={`${btnGhost} min-h-9 px-3`}>{l}</button>
                    ))}
                  </div>
                  <Field label="תיאור התמונה" hint="מוצג כשהתמונה לא נטענת.">
                    <input className={input} value={picked.getAttribute('alt') ?? ''} onChange={e => edit(el => el.setAttribute('alt', e.target.value))} />
                  </Field>
                  <button type="button" className={`${btnDanger} min-h-9 px-3`} onClick={removePicked}><Trash2 className="h-4 w-4" aria-hidden />מחיקת התמונה</button>
                </>
              )}
            </div>
          )}

          {/* עיצוב החלקים הקבועים */}
          <div className="rounded-xl ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 pt-2">
              <div className="flex flex-wrap gap-1" role="tablist" aria-label="חלקי המייל">
                <Palette className="mx-1 mt-2 h-4 w-4 text-slate-500" aria-hidden />
                {([['header', 'כותרת'], ['greeting', 'פתיחה'], ['footer', 'פוטר'], ['bg', 'רקע']] as const).map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                    className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === k ? 'border-[#2563eb] text-[#2563eb]' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{l}</button>
                ))}
              </div>
              <button type="button" onClick={() => { if (confirm('להחזיר את הכותרת, הפתיחה, הכפתור והפוטר לברירת המחדל?')) setDesign(DEFAULT_DESIGN) }} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />איפוס
              </button>
            </div>
            <div className="space-y-4 p-4" role="tabpanel">
              {tab === 'header' && <>
                <Toggle label="להציג כותרת עליונה" checked={design.showHeader} onChange={v => set('showHeader', v)} />
                {design.showHeader && <>
                  <ColorField label="צבע הכותרת" value={design.headerColor} onChange={v => set('headerColor', v)} />
                  <Field label="שורה קטנה מעל"><input className={input} value={design.kicker} maxLength={80} onChange={e => set('kicker', e.target.value)} /></Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="כותרת" hint="ריק = שם הגיליון"><input className={input} value={design.headerTitle} placeholder={issue.title} maxLength={160} onChange={e => set('headerTitle', e.target.value)} /></Field>
                    <Field label="כותרת משנה" hint="ריק = הפרשה"><input className={input} value={design.headerSub} placeholder={issue.parasha} maxLength={120} onChange={e => set('headerSub', e.target.value)} /></Field>
                  </div>
                </>}
              </>}
              {tab === 'greeting' && <>
                <Toggle label="להציג שורת פתיחה" checked={design.showGreeting} onChange={v => set('showGreeting', v)} />
                {design.showGreeting && (
                  <Field label="שורת הפתיחה" hint={`${NAME_TOKEN} יוחלף בשם של כל נמען. מי שאין לו שם יקבל "לכבוד הנמען".`}>
                    <input className={input} value={design.greeting} maxLength={160} onChange={e => set('greeting', e.target.value)} />
                  </Field>
                )}
              </>}
              {tab === 'footer' && (
                <Field label="טקסט הפוטר" hint="קישור הסרה מהרשימה מתווסף תמיד בסוף.">
                  <textarea className={`${input} h-20`} value={design.footerText} maxLength={600} onChange={e => set('footerText', e.target.value)} />
                </Field>
              )}
              {tab === 'bg' && <ColorField label="צבע הרקע מסביב למייל" value={design.bgColor} onChange={v => set('bgColor', v)} />}
            </div>
          </div>
        </div>

        {/* ── תצוגה חיה ── */}
        <div className="min-w-0">
          <div className="sticky top-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">תצוגה חיה</h3>
              <div className="flex rounded-lg bg-slate-100 p-0.5" role="group" aria-label="גודל מסך">
                {([['desktop', 'מחשב', Monitor], ['mobile', 'נייד', Smartphone]] as const).map(([k, l, Icon]) => (
                  <button key={k} type="button" aria-pressed={device === k} onClick={() => setDevice(k)}
                    className={`inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium ${device === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden />{l}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-hidden rounded-xl bg-slate-100 p-2 ring-1 ring-inset ring-slate-900/[0.05]">
              {preview
                ? <iframe srcDoc={preview} sandbox="allow-popups allow-popups-to-escape-sandbox" title="תצוגה חיה של המייל"
                    className={`mx-auto block h-[720px] rounded-lg bg-white transition-[width] ${device === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'}`} />
                : <div className="flex h-[720px] items-center justify-center text-sm text-slate-500"><Loader2 className="ml-2 h-4 w-4 animate-spin" aria-hidden />טוען תצוגה...</div>}
            </div>
            <p className="mt-2 text-xs text-slate-500">כך ייראה אצל נמען בשם &quot;ישראל ישראלי&quot;. השינויים נשמרים אוטומטית.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function rgbToHex(v: string) {
  if (/^#[0-9a-f]{6}$/i.test(v)) return v
  const m = v.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  return m ? `#${m.slice(1, 4).map(n => Number(n).toString(16).padStart(2, '0')).join('')}` : ''
}
