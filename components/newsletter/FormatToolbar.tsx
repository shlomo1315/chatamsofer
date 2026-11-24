'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlignCenter, AlignLeft, AlignRight, Baseline, Bold, Code2, Eraser, Highlighter, ImagePlus, Italic, Link2,
  List, ListOrdered, Loader2, Minus, MousePointerClick, Redo2, Strikethrough, Trash2, Underline, Undo2, Unlink, X,
} from 'lucide-react'
import {
  FONTS, HILITES, Pop, SIZES, Sep, SWATCHES, Swatches, TEXT_BLOCKS, Tool, escHtml, rgbToHex, withScheme,
} from '@/components/editor/richTextTools'
import { alignBlocks, type Align } from '@/lib/gilyonotAlign'
import { imageHtml } from '@/lib/gilyonotDefaultTemplate'
import { sanitizeEmailHtml } from '@/lib/sanitizeEmailHtml'

// סרגל עיצוב לעורך הניוזלטר — אותם כלים כמו בעורך הגיליונות (MailEditor),
// ופועל על בלוק הטקסט או הכותרת שבו נמצא הסמן. כל שינוי נשמר ל-content של הבלוק.

const NAVY = '#1B3256'
const GOLD = '#C69D2D'
const COLORS = [NAVY, GOLD, ...SWATCHES.slice(0, 10)]
const field = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100'
const primary = 'w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50'
const ghost = 'rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50'
const drop = 'h-9 rounded-lg px-2 text-sm text-slate-700 hover:bg-white hover:shadow-sm disabled:pointer-events-none disabled:opacity-40'

const buttonHtml = (label: string, href: string) =>
  `<p style="text-align:center"><a href="${escHtml(href)}" data-btn="1" style="display:inline-block;background-color:${GOLD};color:#ffffff;padding:12px 28px;border-radius:10px;font-weight:bold;text-decoration:none;">${escHtml(label)}</a></p><p><br></p>`

/** השדה הניתן לעריכה (בלוק) שמכיל את הצומת, או null. */
function editableOf(n: Node | null): HTMLElement | null {
  const el = n instanceof HTMLElement ? n : n?.parentElement ?? null
  return el?.closest<HTMLElement>('[contenteditable="true"][data-block-id]') ?? null
}

type PopKind = '' | 'block' | 'font' | 'size' | 'color' | 'hilite' | 'link' | 'button' | 'image'

export default function FormatToolbar({ targetRef, onCommit }: {
  /** הבלוק האחרון שהיה בפוקוס (lastEditable של העורך) */
  targetRef: React.MutableRefObject<HTMLElement | null>
  /** שמירת ה-HTML של הבלוק אחרי שינוי */
  onCommit: (el: HTMLElement) => void
}) {
  const range = useRef<Range | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [hasTarget, setHasTarget] = useState(false)
  const [pop, setPop] = useState<PopKind>('')
  const [linkText, setLinkText] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [imgUrl, setImgUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const [code, setCode] = useState<string | null>(null)
  const [picked, setPicked] = useState<HTMLElement | null>(null)
  const [, bump] = useState(0)

  // שמירת הבחירה האחרונה בתוך בלוק, כדי שלחיצה על הסרגל תפעל עליה
  useEffect(() => {
    const onSel = () => {
      const s = document.getSelection()
      const el = s?.rangeCount ? editableOf(s.anchorNode) : null
      if (!el) return
      targetRef.current = el
      range.current = s!.getRangeAt(0).cloneRange()
      setHasTarget(true)
    }
    // לחיצה על קישור, כפתור או תמונה בתוך בלוק פותחת את פאנל העריכה שלהם
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!editableOf(t)) return
      setPicked(t.closest<HTMLElement>('a, img'))
    }
    document.addEventListener('selectionchange', onSel)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('selectionchange', onSel)
      document.removeEventListener('click', onClick)
    }
  }, [targetRef])

  /** מחזיר את הפוקוס והבחירה לבלוק. null אם אין בלוק פעיל. */
  const restore = () => {
    const el = targetRef.current
    if (!el?.isConnected) { setHasTarget(false); return null }
    el.focus()
    const s = document.getSelection()
    if (s && range.current && el.contains(range.current.startContainer)) { s.removeAllRanges(); s.addRange(range.current) }
    else if (s) { s.selectAllChildren(el); s.collapseToEnd() }
    return el
  }
  const exec = (cmd: string, val?: string) => {
    const el = restore()
    if (!el) return
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(cmd, false, val)
    setPop('')
    onCommit(el)
  }
  const insert = (h: string) => exec('insertHTML', h)
  // execCommand('justify*') מיישר רק חלק מהשורות, לכן מיישרים ידנית כל שורה מסומנת
  const align = (a: Align) => {
    const el = restore()
    if (!el) return
    const s = document.getSelection()
    const r = s?.rangeCount ? s.getRangeAt(0) : null
    if (!r || !alignBlocks(el, r, a)) { exec(a === 'center' ? 'justifyCenter' : a === 'right' ? 'justifyRight' : 'justifyLeft'); return }
    setPop('')
    onCommit(el)
  }
  const setDir = (dir: 'rtl' | 'ltr') => {
    const el = restore()
    if (!el) return
    const top = () => {
      let n: Node | null = document.getSelection()?.anchorNode ?? null
      while (n && n.parentNode !== el) n = n.parentNode
      return n
    }
    // טקסט בלי עטיפה — עוטפים קודם בשורה, כדי שהכיוון יישמר בתוכן
    if (!(top() instanceof HTMLElement)) document.execCommand('formatBlock', false, '<div>')
    const n = top()
    if (n instanceof HTMLElement) { n.dir = dir; n.style.textAlign = dir === 'rtl' ? 'right' : 'left'; onCommit(el) }
  }

  const openPop = (p: PopKind) => {
    if (p === 'link' || p === 'button') { setLinkText(range.current?.toString() ?? ''); setLinkUrl('') }
    setErr('')
    setPop(cur => (cur === p ? '' : p))
  }
  const insertLink = () => {
    if (!linkUrl.trim()) return
    insert(`<a href="${escHtml(withScheme(linkUrl.trim()))}">${escHtml(linkText.trim() || range.current?.toString() || linkUrl.trim())}</a>&nbsp;`)
  }
  const insertButton = () => {
    if (!linkUrl.trim()) return
    insert(buttonHtml(linkText.trim() || 'לחצו כאן', withScheme(linkUrl.trim())))
  }
  const insertImage = (src: string) => { insert(imageHtml(src)); setImgUrl('') }
  async function upload(file: File) {
    setUploading(true); setErr('')
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/admin/newsletter/upload', { method: 'POST', body: form })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'העלאת התמונה נכשלה')
      insertImage(String(d.url))
    } catch (e) { setErr(e instanceof Error ? e.message : 'העלאת התמונה נכשלה') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  // ── עריכת HTML של הבלוק ──
  const toggleCode = () => {
    if (code !== null) { setCode(null); return }
    const el = targetRef.current
    if (!el?.isConnected) return
    setPicked(null); setPop('')
    setCode(el.innerHTML)
  }
  const applyCode = () => {
    const el = targetRef.current
    if (el?.isConnected && code !== null) { el.innerHTML = sanitizeEmailHtml(code); onCommit(el) }
    setCode(null)
  }

  // ── קישור, כפתור או תמונה שנבחרו בלחיצה ──
  const edit = (fn: (el: HTMLElement) => void) => {
    const host = picked && editableOf(picked)
    if (!picked || !host) return
    fn(picked); bump(n => n + 1); onCommit(host)
  }
  const removePicked = () => {
    const host = picked && editableOf(picked)
    if (!picked || !host) return
    if (picked.tagName === 'A' && !picked.dataset.btn) picked.replaceWith(document.createTextNode(picked.textContent ?? ''))
    else {
      const parent = picked.parentElement
      picked.remove()
      if (parent && parent !== host && !parent.textContent?.trim() && !parent.querySelector('img')) parent.remove()
    }
    setPicked(null)
    onCommit(host)
  }
  const isBtn = picked?.tagName === 'A' && !!picked.dataset.btn
  const off = !hasTarget

  return (
    <div className="sticky top-0 z-30 -mx-6 -mt-6 mb-6 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-0.5 p-1.5" role="toolbar" aria-label="עיצוב טקסט">
        <Tool label="ביטול" disabled={off} onClick={() => exec('undo')}><Undo2 className="h-4 w-4" /></Tool>
        <Tool label="חזרה" disabled={off} onClick={() => exec('redo')}><Redo2 className="h-4 w-4" /></Tool>
        <Sep />
        <div className="relative">
          <button type="button" disabled={off} onMouseDown={e => e.preventDefault()} onClick={() => openPop('block')} className={drop}>סוג טקסט ▾</button>
          <Pop open={pop === 'block'}>
            <div className="flex w-40 flex-col">{TEXT_BLOCKS.map(([t, l]) => <button key={t} type="button" onClick={() => exec('formatBlock', `<${t}>`)} className={`rounded-lg px-2 py-1.5 text-right hover:bg-slate-100 ${t === 'p' ? 'text-sm' : t === 'blockquote' ? 'border-r-2 border-slate-300 text-sm text-slate-600' : 'font-bold'}`}>{l}</button>)}</div>
          </Pop>
        </div>
        <div className="relative">
          <button type="button" disabled={off} onMouseDown={e => e.preventDefault()} onClick={() => openPop('font')} className={drop}>גופן ▾</button>
          <Pop open={pop === 'font'}>
            <div className="flex w-40 flex-col">{FONTS.map(([f, l]) => <button key={f} type="button" onClick={() => exec('fontName', f)} style={{ fontFamily: f }} className="rounded-lg px-2 py-1.5 text-right hover:bg-slate-100">{l}</button>)}</div>
          </Pop>
        </div>
        <div className="relative">
          <button type="button" disabled={off} onMouseDown={e => e.preventDefault()} onClick={() => openPop('size')} className={drop}>גודל ▾</button>
          <Pop open={pop === 'size'}>
            <div className="flex w-36 flex-col">{SIZES.map(([s, l]) => <button key={s} type="button" onClick={() => exec('fontSize', s)} className="rounded-lg px-2 py-1 text-right hover:bg-slate-100" style={{ fontSize: `${10 + Number(s) * 2}px` }}>{l}</button>)}</div>
          </Pop>
        </div>
        <Sep />
        <Tool label="מודגש" disabled={off} onClick={() => exec('bold')}><Bold className="h-4 w-4" /></Tool>
        <Tool label="נטוי" disabled={off} onClick={() => exec('italic')}><Italic className="h-4 w-4" /></Tool>
        <Tool label="קו תחתון" disabled={off} onClick={() => exec('underline')}><Underline className="h-4 w-4" /></Tool>
        <Tool label="קו חוצה" disabled={off} onClick={() => exec('strikeThrough')}><Strikethrough className="h-4 w-4" /></Tool>
        <div className="relative">
          <Tool label="צבע טקסט" disabled={off} onClick={() => openPop('color')} active={pop === 'color'}><Baseline className="h-4 w-4" /></Tool>
          <Pop open={pop === 'color'}><Swatches colors={[...COLORS, '#ffffff']} onPick={c => exec('foreColor', c)} /></Pop>
        </div>
        <div className="relative">
          <Tool label="צבע רקע לטקסט" disabled={off} onClick={() => openPop('hilite')} active={pop === 'hilite'}><Highlighter className="h-4 w-4" /></Tool>
          <Pop open={pop === 'hilite'}><Swatches colors={[...HILITES, 'transparent']} onPick={c => exec('hiliteColor', c)} /></Pop>
        </div>
        <Sep />
        <Tool label="יישור לימין" disabled={off} onClick={() => align('right')}><AlignRight className="h-4 w-4" /></Tool>
        <Tool label="מרכוז" disabled={off} onClick={() => align('center')}><AlignCenter className="h-4 w-4" /></Tool>
        <Tool label="יישור לשמאל" disabled={off} onClick={() => align('left')}><AlignLeft className="h-4 w-4" /></Tool>
        <Tool label="פסקה משמאל לימין (אנגלית)" disabled={off} onClick={() => setDir('ltr')}><span className="text-[11px] font-bold">LTR</span></Tool>
        <Tool label="פסקה מימין לשמאל" disabled={off} onClick={() => setDir('rtl')}><span className="text-[11px] font-bold">RTL</span></Tool>
        <Tool label="רשימה" disabled={off} onClick={() => exec('insertUnorderedList')}><List className="h-4 w-4" /></Tool>
        <Tool label="רשימה ממוספרת" disabled={off} onClick={() => exec('insertOrderedList')}><ListOrdered className="h-4 w-4" /></Tool>
        <Sep />
        <div className="relative">
          <Tool label="קישור" disabled={off} onClick={() => openPop('link')} active={pop === 'link'}><Link2 className="h-4 w-4" /></Tool>
          <Pop open={pop === 'link' || pop === 'button'}>
            <div className="w-64 space-y-2">
              <p className="text-xs font-semibold text-slate-700">{pop === 'button' ? 'הוספת כפתור בתוך הטקסט' : 'הוספת קישור'}</p>
              <input className={field} placeholder={pop === 'button' ? 'טקסט הכפתור' : 'הטקסט שיוצג'} value={linkText} onChange={e => setLinkText(e.target.value)} />
              <input className={field} dir="ltr" placeholder="https://..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (pop === 'button') insertButton(); else insertLink() } }} />
              <button type="button" className={primary} disabled={!linkUrl.trim()} onClick={pop === 'button' ? insertButton : insertLink}>הוספה</button>
            </div>
          </Pop>
        </div>
        <Tool label="הסרת קישור" disabled={off} onClick={() => exec('unlink')}><Unlink className="h-4 w-4" /></Tool>
        <Tool label="הוסף כפתור בתוך הטקסט" disabled={off} onClick={() => openPop('button')} active={pop === 'button'}><MousePointerClick className="h-4 w-4" /></Tool>
        <div className="relative">
          <Tool label="תמונה בתוך הטקסט" disabled={off} onClick={() => openPop('image')} active={pop === 'image'}>{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}</Tool>
          <Pop open={pop === 'image'}>
            <div className="w-64 space-y-2">
              <p className="text-xs font-semibold text-slate-700">הוספת תמונה</p>
              <button type="button" className={`${ghost} flex w-full items-center justify-center gap-1.5 py-1.5 text-sm`} disabled={uploading} onClick={() => fileRef.current?.click()}><ImagePlus className="h-4 w-4" aria-hidden />העלאה מהמחשב</button>
              <div className="flex gap-1.5">
                <input className={field} dir="ltr" placeholder="או כתובת תמונה https://..." value={imgUrl} onChange={e => setImgUrl(e.target.value)} />
                <button type="button" className="rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={!/^https?:\/\//.test(imgUrl.trim())} onClick={() => insertImage(imgUrl.trim())}>הוספה</button>
              </div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
          </Pop>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" tabIndex={-1} aria-hidden
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
        </div>
        <Tool label="קו מפריד" disabled={off} onClick={() => exec('insertHorizontalRule')}><Minus className="h-4 w-4" /></Tool>
        <Tool label="ניקוי עיצוב" disabled={off} onClick={() => exec('removeFormat')}><Eraser className="h-4 w-4" /></Tool>
        <Sep />
        <Tool label={code !== null ? 'סגירת עריכת HTML' : 'עריכת HTML של הבלוק'} disabled={off} onClick={toggleCode} active={code !== null}><Code2 className="h-4 w-4" /></Tool>
        {off && <span className="px-1.5 text-xs text-slate-500">לחצו על כותרת או טקסט במייל כדי לעצב</span>}
      </div>

      {/* עריכת HTML של הבלוק הפעיל */}
      {code !== null && (
        <div className="space-y-2 border-t border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-700">HTML של הבלוק</p>
          <textarea dir="ltr" value={code} onChange={e => setCode(e.target.value)} rows={8}
            className={`${field} font-mono text-xs leading-relaxed`} />
          <div className="flex gap-2">
            <button type="button" className={`${primary} w-auto`} onClick={applyCode}>החלה</button>
            <button type="button" className={ghost} onClick={() => setCode(null)}>ביטול</button>
          </div>
        </div>
      )}

      {/* קישור, כפתור או תמונה שנבחרו */}
      {picked?.isConnected && code === null && (
        <div className="space-y-2.5 border-t border-slate-200 bg-indigo-50/60 p-3 text-sm">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-900">{picked.tagName === 'IMG' ? 'תמונה שנבחרה' : isBtn ? 'כפתור שנבחר' : 'קישור שנבחר'}</p>
            <button type="button" onClick={() => setPicked(null)} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white" aria-label="סגירה"><X className="h-4 w-4" /></button>
          </div>
          {picked.tagName === 'A' ? (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block"><span className="mb-1 block text-xs text-slate-600">טקסט</span>
                  <input className={field} value={picked.textContent ?? ''} onChange={e => edit(el => { el.textContent = e.target.value })} /></label>
                <label className="block"><span className="mb-1 block text-xs text-slate-600">כתובת</span>
                  <input className={field} dir="ltr" value={picked.getAttribute('href') ?? ''} onChange={e => edit(el => el.setAttribute('href', e.target.value))}
                    onBlur={e => edit(el => { if (e.target.value.trim()) el.setAttribute('href', withScheme(e.target.value.trim())) })} /></label>
              </div>
              {isBtn && (
                <div className="flex flex-wrap items-center gap-4">
                  <ColorPick label="צבע הכפתור" value={rgbToHex(picked.style.backgroundColor) || GOLD} onChange={v => edit(el => { el.style.backgroundColor = v })} />
                  <ColorPick label="צבע הטקסט" value={rgbToHex(picked.style.color) || '#ffffff'} onChange={v => edit(el => { el.style.color = v })} />
                </div>
              )}
              <button type="button" className={`${ghost} inline-flex items-center gap-1.5 text-rose-700`} onClick={removePicked}><Trash2 className="h-3.5 w-3.5" aria-hidden />{isBtn ? 'מחיקת הכפתור' : 'הסרת הקישור'}</button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-600">רוחב:</span>
                {['100%', '75%', '50%', '33%'].map(w => (
                  <button key={w} type="button" onClick={() => edit(el => { el.style.width = w })} className={`${ghost} ${picked.style.width === w ? 'ring-2 ring-indigo-300' : ''}`}>{w}</button>
                ))}
                <span className="ms-3 text-xs text-slate-600">מיקום:</span>
                {([['ימין', '0 0 14px auto'], ['מרכז', '0 auto 14px'], ['שמאל', '0 auto 14px 0']] as const).map(([l, m]) => (
                  <button key={l} type="button" onClick={() => edit(el => { el.style.margin = m })} className={ghost}>{l}</button>
                ))}
              </div>
              <label className="block"><span className="mb-1 block text-xs text-slate-600">תיאור התמונה (מוצג כשהתמונה לא נטענת)</span>
                <input className={field} value={picked.getAttribute('alt') ?? ''} onChange={e => edit(el => el.setAttribute('alt', e.target.value))} /></label>
              <button type="button" className={`${ghost} inline-flex items-center gap-1.5 text-rose-700`} onClick={removePicked}><Trash2 className="h-3.5 w-3.5" aria-hidden />מחיקת התמונה</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function ColorPick({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-600">{label}</span>
      <input type="color" value={value} onChange={e => onChange(e.target.value)} aria-label={label} className="h-8 w-10 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" />
      <Swatches colors={COLORS.slice(0, 6)} onPick={onChange} />
    </div>
  )
}
