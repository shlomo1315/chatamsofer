'use client'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Bold, Italic, Underline, Link2, X, Baseline } from 'lucide-react'
import { type Sel, BRAND_COLORS, toggleTag, toggleBold, setValueTag, applyLinkTo, hasFormat } from '@/lib/richFormat'
import { useFormatBridge } from './RichFormatPanel'

// ─────────────────────────────────────────────────────────────────────────────
// שדה טקסט עם בועת עיצוב — לנוסחי המייל (כיוון ג׳: בועה ופאנל).
//
// 🔴 עורך סימון ולא עורך HTML (contentEditable): הטקסט נשלח לאלפי
// נמענים, ושמירת HTML גולמי משדה שכל מזכיר עורך הייתה פותחת הזרקה.
// כאן נשמר טקסט רגיל עם סימון מצומצם, וההמרה נעשית בשרת אחרי ניטרול
// מלא. ראו lib/richText ו-lib/richFormat.
//
// הבועה הקטנה מעל הבחירה: הדגשה, נטוי, קו תחתון, צבע, קישור, ו«עוד».
// העיצוב המלא נפתח בפאנל הצד (RichFormatPanel), שמקבל את הבחירה דרך
// FormatContext. בלי הקשר כזה (שימוש עצמאי) הבועה היא כל מה שיש.
//
// ⚠️ כפתורי הבועה והפאנל לא גונבים מיקוד מהשדה (onMouseDown), אחרת
// הבחירה אובדת לפני שהפעולה מתבצעת.
// ─────────────────────────────────────────────────────────────────────────────

const URL_OK = /^(https?:\/\/|mailto:)/i

function Btn({ label, onClick, on, children }: { label: string; onClick: () => void; on?: boolean; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={on}
      onMouseDown={e => e.preventDefault()} onClick={onClick}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-white hover:bg-white/15 lg:h-9 lg:w-9 ${on ? 'bg-[#C0912F] !text-[#14213D]' : ''}`}>
      {children}
    </button>
  )
}

export default function RichTextArea({
  value, onChange, rows = 4, placeholder, className = '', style,
}: {
  value: string
  onChange: (v: string) => void
  rows?: number
  placeholder?: string
  className?: string
  style?: CSSProperties
}) {
  const bridge = useFormatBridge()
  const ref = useRef<HTMLTextAreaElement>(null)
  const valRef = useRef(value)
  useEffect(() => { valRef.current = value }, [value])
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null)
  const [pop, setPop] = useState<null | 'color'>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  // ⚠️ הבחירה נשמרת בפתיחת חלונית הקישור: לחיצה על שדה הכתובת מוציאה את
  // המיקוד מה-textarea, והבחירה המקורית אובדת.
  const linkSel = useRef<{ start: number; end: number }>({ start: 0, end: 0 })

  const report = bridge?.report

  const run = (fn: (s: Sel) => Sel) => {
    const el = ref.current
    if (!el) return
    const r = fn({ value: valRef.current, start: el.selectionStart, end: el.selectionEnd })
    valRef.current = r.value
    onChange(r.value)
    setPop(null)
    // ⚠️ requestAnimationFrame: הערך מתעדכן ברינדור הבא, ומיקום סמן
    // לפניו נדרס. הבחירה נשמרת כדי שאפשר להמשיך לעצב ברצף.
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true })
      el.setSelectionRange(r.start, r.end)
      readSel()
    })
  }

  const readSel = () => {
    const el = ref.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b } = el
    const v = valRef.current
    if (b > a && v.slice(a, b).trim()) {
      setSel({ start: a, end: b })
      report?.({ sel: { value: v, start: a, end: b }, run })
    } else {
      setSel(null); setPop(null); setLinkOpen(false)
      report?.(null)
    }
  }

  const urlValid = URL_OK.test(linkUrl.trim())
  const applyLink = () => {
    // ⚠️ אותה בדיקה כמו בשרת: כתובת שאינה http/https/mailto לא תהפוך
    // לקישור גם אם תישמר, ועדיף לומר זאת כאן מאשר להפתיע במייל.
    if (!urlValid) return
    const el = ref.current
    const r = applyLinkTo({ value: valRef.current, ...linkSel.current }, linkUrl.trim())
    valRef.current = r.value
    onChange(r.value)
    setLinkOpen(false)
    setLinkUrl('')
    requestAnimationFrame(() => { el?.focus({ preventScroll: true }); el?.setSelectionRange(r.start, r.end); readSel() })
  }

  const s: Sel = { value, start: sel?.start ?? 0, end: sel?.end ?? 0 }
  const picked = value.slice(s.start, s.end)
  const isBold = /^\*\*.*\*\*$/.test(picked) || (value.slice(s.start - 2, s.start) === '**' && value.slice(s.end, s.end + 2) === '**')

  return (
    <div className="relative"
      onBlur={e => {
        const next = e.relatedTarget as Element | null
        // המיקוד עבר לפאנל הצד (רשימת גופן/גודל) — הבחירה נשארת.
        if (next?.closest?.('[data-fmt-panel]')) return
        if (!e.currentTarget.contains(next)) { setSel(null); setPop(null); setLinkOpen(false); report?.(null) }
      }}>
      {sel && (
        <div dir="rtl" className="absolute -top-2 right-0 z-30 w-max max-w-[calc(100vw-2rem)] -translate-y-full">
          <div role="toolbar" aria-label="עיצוב מהיר"
            className="flex items-center gap-0.5 rounded-full bg-[#14213D] px-1.5 py-1 shadow-xl ring-1 ring-black/10">
            <Btn label="הדגשה" on={isBold} onClick={() => run(toggleBold)}><Bold size={16} /></Btn>
            <Btn label="נטוי" on={hasFormat(s, 'i')} onClick={() => run(x => toggleTag(x, 'i'))}><Italic size={16} /></Btn>
            <Btn label="קו תחתון" on={hasFormat(s, 'u')} onClick={() => run(x => toggleTag(x, 'u'))}><Underline size={16} /></Btn>
            <Btn label="צבע" on={pop === 'color'} onClick={() => { setLinkOpen(false); setPop(p => (p ? null : 'color')) }}><Baseline size={16} /></Btn>
            <Btn label="קישור" on={linkOpen} onClick={() => { linkSel.current = { start: s.start, end: s.end }; setPop(null); setLinkOpen(o => !o) }}><Link2 size={16} /></Btn>
            {bridge && (
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={bridge.openPanel}
                className="h-11 rounded-full px-3 text-xs font-bold text-[#C0912F] hover:bg-white/15 lg:h-9">עוד ›</button>
            )}
          </div>

          {pop === 'color' && (
            <div className="mt-1 grid w-60 grid-cols-6 gap-1.5 rounded-xl bg-white p-2 shadow-xl ring-1 ring-[#E3DED3]">
              {BRAND_COLORS.map(c => (
                <button key={c} type="button" aria-label={`צבע ${c}`}
                  onMouseDown={e => e.preventDefault()} onClick={() => run(x => setValueTag(x, 'color', c))}
                  className="h-9 rounded-lg ring-1 ring-black/15" style={{ background: c }} />
              ))}
            </div>
          )}

          {linkOpen && (
            <div className="mt-1 w-72 max-w-full rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700">כתובת הקישור</span>
                <button type="button" onClick={() => { setLinkOpen(false); setLinkUrl('') }}
                  className="text-slate-400 hover:text-slate-600" aria-label="סגירה"><X size={14} /></button>
              </div>
              <input autoFocus value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && urlValid) applyLink() }}
                placeholder="https://…  או  mailto:…" dir="ltr"
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm outline-none focus:border-indigo-400" />
              {linkUrl.trim() && !urlValid && (
                <p className="mt-1 text-[11px] text-amber-700">הכתובת חייבת להתחיל ב-https:// או mailto:</p>
              )}
              <button type="button" onClick={applyLink} disabled={!urlValid}
                className="mt-2 w-full rounded-lg bg-[#14213D] px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
                הוספת הקישור
              </button>
            </div>
          )}
        </div>
      )}

      <textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={e => { valRef.current = e.target.value; onChange(e.target.value); requestAnimationFrame(readSel) }}
        onSelect={readSel}
        onKeyUp={readSel}
        onMouseUp={readSel}
        onTouchEnd={() => requestAnimationFrame(readSel)}
        className={className}
        style={style}
      />
      <p className="mt-1 text-[10px] text-slate-400">סמנו טקסט כדי לעצב אותו: הדגשה, צבע, קישור ועוד</p>
    </div>
  )
}
