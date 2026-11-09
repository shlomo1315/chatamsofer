'use client'
import { createContext, useContext, type ReactNode } from 'react'
import {
  Bold, Italic, Underline, Strikethrough, Superscript, Subscript, RemoveFormatting,
  AlignRight, AlignCenter, AlignLeft, AlignJustify, List, ListOrdered, Plus, Minus,
} from 'lucide-react'
import {
  type Sel, DEFAULT_SIZE, SIZE_STEPS, BRAND_COLORS, toggleTag, toggleBold, setValueTag, stepSize,
  clearFormat, setBlock, hasFormat, currentValue,
} from '@/lib/richFormat'

// ─────────────────────────────────────────────────────────────────────────────
// פאנל «עיצוב הטקסט המסומן» — כיוון ג׳ במוקאפ. מוצג בעמודה הימנית של
// העורך; הבועה הקטנה שמעל הטקסט מדווחת אליו על הבחירה הנוכחית.
// ─────────────────────────────────────────────────────────────────────────────

/** בקר של שדה הטקסט שמסומן כרגע: הבחירה, והרצת פעולה עליה. */
export type FormatCtl = { sel: Sel; run: (fn: (s: Sel) => Sel) => void }

export type FormatBridge = {
  ctl: FormatCtl | null
  report: (c: FormatCtl | null) => void
  /** פתיחת הפאנל המלא (בטלפון — המגירה). */
  openPanel: () => void
}

export const FormatContext = createContext<FormatBridge | null>(null)
export const useFormatBridge = () => useContext(FormatContext)

const ib = 'inline-flex h-11 min-w-11 items-center justify-center rounded-lg border border-[#E3DED3] bg-white text-[#14213D] hover:bg-[#F4F1EA] lg:h-10 lg:min-w-10'
const Lab = ({ children }: { children: ReactNode }) => <div className="mb-1.5 mt-3.5 text-[11px] text-slate-500 first:mt-0">{children}</div>

function Ib({ label, on, onClick, children }: { label: string; on?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={on} onClick={onClick}
      className={`${ib} ${on ? '!border-[#14213D] !bg-[#14213D] !text-white' : ''}`}>{children}</button>
  )
}

function Swatches({ active, onPick, kind }: { active?: string; onPick: (c: string) => void; kind: string }) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {BRAND_COLORS.map(c => (
        <button key={c} type="button" aria-label={`${kind} ${c}`} aria-pressed={active?.toLowerCase() === c.toLowerCase()}
          onClick={() => onPick(c)}
          className={`h-9 rounded-lg ring-1 ring-black/15 aria-pressed:ring-2 aria-pressed:ring-[#C0912F] aria-pressed:ring-offset-1`}
          style={{ background: c }} />
      ))}
    </div>
  )
}

export default function RichFormatPanel() {
  const bridge = useFormatBridge()
  const ctl = bridge?.ctl ?? null

  if (!ctl) {
    return (
      <p data-fmt-panel className="rounded-xl border border-dashed border-[#E3DED3] bg-[#F4F1EA] p-3 text-xs leading-relaxed text-slate-600">
        לחצו על פסקה כדי לערוך אותה. סמנו מילה או משפט כדי לשנות גופן, גודל, צבע והדגשה.
      </p>
    )
  }

  const { sel: s, run } = ctl
  const picked = s.value.slice(s.start, s.end).replace(/\{\/?[a-z]+(?:=[^{}\s]*)?\}|\*\*/g, '')
  const sizeNow = Number(currentValue(s, 'size')) || DEFAULT_SIZE
  const bold = /^\*\*.*\*\*$/.test(s.value.slice(s.start, s.end)) || (s.value.slice(s.start - 2, s.start) === '**' && s.value.slice(s.end, s.end + 2) === '**')

  return (
    // ⚠️ onMouseDown: לחיצה בפאנל לא גונבת מיקוד מהשדה (אחרת הבחירה אובדת),
    // חוץ מרשימות הבחירה שחייבות להיפתח.
    <section data-fmt-panel aria-label="עיצוב הטקסט המסומן"
      className="rounded-xl border border-[#E6D6A8] bg-gradient-to-b from-[#FFFCF3] to-white p-3.5"
      onMouseDown={e => { if (!(e.target instanceof HTMLSelectElement)) e.preventDefault() }}>
      <p className="mb-3 text-xs font-black text-[#142036]">עיצוב הטקסט המסומן</p>

      <Lab>גופן וגודל</Lab>
      <div className="grid grid-cols-[1fr_84px] gap-1.5">
        <select aria-label="גופן" defaultValue="Heebo" className="h-10 rounded-lg border border-[#E3DED3] bg-white px-2 text-sm">
          <option value="Heebo">Heebo</option>
        </select>
        <select aria-label="גודל" value={String(sizeNow)} onChange={e => run(x => setValueTag(x, 'size', e.target.value))}
          className="h-10 rounded-lg border border-[#E3DED3] bg-white px-2 text-sm">
          {[...new Set([...SIZE_STEPS, sizeNow])].sort((a, b) => a - b).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      <Lab>סגנון</Lab>
      <div className="flex flex-wrap gap-1">
        <Ib label="הדגשה" on={bold} onClick={() => run(toggleBold)}><Bold size={16} /></Ib>
        <Ib label="נטוי" on={hasFormat(s, 'i')} onClick={() => run(x => toggleTag(x, 'i'))}><Italic size={16} /></Ib>
        <Ib label="קו תחתון" on={hasFormat(s, 'u')} onClick={() => run(x => toggleTag(x, 'u'))}><Underline size={16} /></Ib>
        <Ib label="קו חוצה" on={hasFormat(s, 's')} onClick={() => run(x => toggleTag(x, 's'))}><Strikethrough size={16} /></Ib>
        <Ib label="כתב עילי" on={hasFormat(s, 'sup')} onClick={() => run(x => toggleTag(x, 'sup'))}><Superscript size={16} /></Ib>
        <Ib label="כתב תחתי" on={hasFormat(s, 'sub')} onClick={() => run(x => toggleTag(x, 'sub'))}><Subscript size={16} /></Ib>
        <Ib label="הגדלה" onClick={() => run(x => stepSize(x, 1))}><Plus size={16} /></Ib>
        <Ib label="הקטנה" onClick={() => run(x => stepSize(x, -1))}><Minus size={16} /></Ib>
        <Ib label="ניקוי עיצוב" onClick={() => run(clearFormat)}><RemoveFormatting size={16} /></Ib>
      </div>

      <Lab>צבע טקסט</Lab>
      <Swatches kind="צבע" active={currentValue(s, 'color')} onPick={c => run(x => setValueTag(x, 'color', c))} />
      <Lab>הדגשת רקע</Lab>
      <Swatches kind="רקע" active={currentValue(s, 'bg')} onPick={c => run(x => setValueTag(x, 'bg', c))} />

      <Lab>יישור ורשימה</Lab>
      <div className="flex flex-wrap gap-1">
        <Ib label="יישור לימין" onClick={() => run(x => setBlock(x, 'right'))}><AlignRight size={16} /></Ib>
        <Ib label="מרכוז" onClick={() => run(x => setBlock(x, 'center'))}><AlignCenter size={16} /></Ib>
        <Ib label="יישור לשמאל" onClick={() => run(x => setBlock(x, 'left'))}><AlignLeft size={16} /></Ib>
        <Ib label="יישור מלא" onClick={() => run(x => setBlock(x, 'justify'))}><AlignJustify size={16} /></Ib>
        <Ib label="תבליטים" onClick={() => run(x => setBlock(x, 'li'))}><List size={16} /></Ib>
        <Ib label="מספור" onClick={() => run(x => setBlock(x, 'ol'))}><ListOrdered size={16} /></Ib>
      </div>

      <p className="mt-3.5 rounded-lg border border-dashed border-[#E3DED3] bg-white px-3 py-2 text-xs text-slate-500">
        מסומן: <b className="text-[#142036]">{picked.length > 40 ? picked.slice(0, 40) + '…' : picked}</b>
      </p>
    </section>
  )
}
