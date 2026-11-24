'use client'

import type { ReactNode } from 'react'
import DOMPurify from 'dompurify'
import { SYSTEM_BLUE } from '@/lib/gilyonotDesign'

// כלי עיצוב טקסט משותפים לעורך הגיליונות ולעורך הניוזלטר:
// לוחות צבעים, גופנים וגדלים, ניקוי הדבקה, וכפתורי הסרגל.

export const SWATCHES = ['#0f172a', '#334155', '#64748b', SYSTEM_BLUE, '#1d4ed8', '#0891b2', '#059669', '#ca8a04', '#ea580c', '#e11d48', '#14213D', '#ffffff']
export const HILITES = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#fed7aa', '#e2e8f0']
export const FONTS = [['Arial', 'אריאל'], ['David', 'דוד'], ['Frank Ruehl CLM, David, serif', 'פרנק רוהל'], ['Tahoma', 'טהומה'], ['Georgia, serif', 'ג׳ורג׳יה']]
export const SIZES = [['2', 'קטן'], ['3', 'רגיל'], ['4', 'בינוני'], ['5', 'גדול'], ['6', 'גדול מאוד']]
export const TEXT_BLOCKS = [['p', 'פסקה'], ['h1', 'כותרת ראשית'], ['h2', 'כותרת'], ['h3', 'כותרת משנה'], ['blockquote', 'ציטוט']]
const PASTE_TAGS = ['p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'img', 'hr', 'blockquote']

/** ניקוי HTML מודבק (Word, אתרים) לתגיות ולמאפיינים שתוכנות מייל מבינות. */
export const cleanPaste = (html: string) => DOMPurify.sanitize(html, { ALLOWED_TAGS: [...PASTE_TAGS, 'table', 'tbody', 'tr', 'td', 'font'], ALLOWED_ATTR: ['href', 'src', 'alt', 'style', 'dir', 'data-btn', 'width', 'align', 'size', 'face', 'color'] })
export const escHtml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
/** משלים https:// או mailto: לכתובת שהוקלדה בלעדיהם. */
export const withScheme = (u: string) => (/^(https?:|mailto:)/i.test(u) ? u : /^[\w.+-]+@[\w-]+\.[\w.]+$/.test(u) ? `mailto:${u}` : `https://${u}`)

export function rgbToHex(v: string) {
  if (/^#[0-9a-f]{6}$/i.test(v)) return v
  const m = v.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  return m ? `#${m.slice(1, 4).map(n => Number(n).toString(16).padStart(2, '0')).join('')}` : ''
}

export function Tool({ label, onClick, active, disabled, children }: { label: string; onClick: () => void; active?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled}
      onMouseDown={e => e.preventDefault()} onClick={onClick}
      className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-1.5 text-slate-600 transition-colors hover:bg-white hover:text-slate-900 hover:shadow-sm disabled:pointer-events-none disabled:opacity-40 ${active ? 'bg-white text-[#2563eb] shadow-sm' : ''}`}>
      {children}
    </button>
  )
}
export const Sep = () => <span className="mx-0.5 h-6 w-px bg-slate-200" aria-hidden />

export function Pop({ open, children }: { open: boolean; children: ReactNode }) {
  if (!open) return null
  return <div className="absolute top-full z-20 mt-1 w-max rounded-xl bg-white p-2.5 shadow-lg ring-1 ring-slate-900/10" onMouseDown={e => { if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault() }}>{children}</div>
}

export function Swatches({ colors, onPick }: { colors: string[]; onPick: (c: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {colors.map(c => (
        <button key={c} type="button" onMouseDown={e => e.preventDefault()} onClick={() => onPick(c)} aria-label={c} title={c}
          className="h-6 w-6 rounded-md ring-1 ring-inset ring-slate-900/15 hover:scale-110" style={{ background: c }} />
      ))}
    </div>
  )
}
