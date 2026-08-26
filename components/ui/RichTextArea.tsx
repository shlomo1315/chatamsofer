'use client'
import { useRef, useState, type CSSProperties } from 'react'
import { Bold, Link2, X } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// שדה טקסט עם הדגשה וקישורים — לנוסחי המייל.
//
// 🔴 עורך סימון ולא עורך HTML (contentEditable): הטקסט נשלח לאלפי
// נמענים, ושמירת HTML גולמי משדה שכל מזכיר עורך הייתה פותחת הזרקה.
// כאן נשמר טקסט רגיל עם **מודגש** ו-[טקסט](כתובת), וההמרה נעשית
// בשרת אחרי ניטרול מלא. ראו lib/richText.
//
// ⚠️ הסימון עוטף את מה שהמשתמש *סימן בעכבר* — הוא לא צריך להכיר את
// התחביר. כפתור בלי בחירה מוסיף תבנית ריקה עם הסמן בפנים.
// ─────────────────────────────────────────────────────────────────────────────

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
  const ref = useRef<HTMLTextAreaElement>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  // ⚠️ הבחירה נשמרת בפתיחת החלונית: לחיצה על שדה הכתובת מוציאה את
  // המיקוד מה-textarea, והבחירה המקורית אובדת.
  const selRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 })

  const selection = () => {
    const el = ref.current
    if (!el) return { start: 0, end: 0 }
    return { start: el.selectionStart, end: el.selectionEnd }
  }

  /** עוטף את הבחירה (או מוסיף תבנית ריקה) ומחזיר את הסמן פנימה. */
  const wrap = (before: string, after: string, placeholderText: string) => {
    const el = ref.current
    if (!el) return
    const { start, end } = selection()
    const picked = value.slice(start, end) || placeholderText
    const next = value.slice(0, start) + before + picked + after + value.slice(end)
    onChange(next)
    // ⚠️ requestAnimationFrame: הערך מתעדכן ברינדור הבא, ומיקום סמן
    // לפניו נדרס. בלי זה הסמן קופץ לתחילת השדה אחרי כל לחיצה.
    requestAnimationFrame(() => {
      el.focus()
      const from = start + before.length
      el.setSelectionRange(from, from + picked.length)
    })
  }

  const applyLink = () => {
    const el = ref.current
    const url = linkUrl.trim()
    // ⚠️ אותה בדיקה כמו בשרת: כתובת שאינה http/https/mailto לא תהפוך
    // לקישור גם אם תישמר, ועדיף לומר זאת כאן מאשר להפתיע במייל.
    if (!/^(https?:\/\/|mailto:)/i.test(url)) return
    const { start, end } = selRef.current
    const picked = value.slice(start, end) || 'טקסט הקישור'
    const next = `${value.slice(0, start)}[${picked}](${url})${value.slice(end)}`
    onChange(next)
    setLinkOpen(false)
    setLinkUrl('')
    requestAnimationFrame(() => {
      el?.focus()
      const from = start + 1
      el?.setSelectionRange(from, from + picked.length)
    })
  }

  const urlValid = /^(https?:\/\/|mailto:)/i.test(linkUrl.trim())

  return (
    <div className="relative">
      <div className="flex items-center gap-1 mb-1">
        <button type="button" title="הדגשה — סמנו טקסט ולחצו"
          onClick={() => wrap('**', '**', 'טקסט מודגש')}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600">
          <Bold size={12} /> הדגשה
        </button>
        <button type="button" title="קישור — סמנו טקסט ולחצו"
          onClick={() => { selRef.current = selection(); setLinkOpen(true) }}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600">
          <Link2 size={12} /> קישור
        </button>
        <span className="text-[10px] text-slate-400">סמנו טקסט ולחצו על הכפתור</span>
      </div>

      <textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className={className}
        style={style}
      />

      {linkOpen && (
        <div className="absolute z-30 top-8 right-0 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-700">כתובת הקישור</span>
            <button type="button" onClick={() => { setLinkOpen(false); setLinkUrl('') }}
              className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
          </div>
          <input
            autoFocus
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && urlValid) applyLink() }}
            placeholder="https://…  או  mailto:…"
            dir="ltr"
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-indigo-400 outline-none"
          />
          {/* ⚠️ הסבר ולא חסימה שקטה: כתובת פסולה פשוט לא תהפוך לקישור
              במייל, ועדיף שהמזכיר ידע למה. */}
          {linkUrl.trim() && !urlValid && (
            <p className="mt-1 text-[10px] text-amber-700">
              הכתובת חייבת להתחיל ב-https:// או mailto:
            </p>
          )}
          <button type="button" onClick={applyLink} disabled={!urlValid}
            className="mt-2 w-full rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-40">
            הוספת הקישור
          </button>
        </div>
      )}
    </div>
  )
}
