'use client'

import { useCallback, useRef, useState } from 'react'
import {
  Heading, Type, Image as ImageIcon, MousePointerClick, Minus, MoveVertical,
  ArrowUp, ArrowDown, Trash2, Braces, Code2, LayoutList, AlertTriangle,
} from 'lucide-react'
import Button from '@/components/ui/Button'
import type { Block, BlockType } from '@/lib/newsletter/blocks'
import { MERGE_TAGS } from '@/lib/newsletter/merge'

const CARD = 'rounded-2xl border border-slate-200 bg-white'
const NAVY = '#1B3256'
const GOLD = '#C69D2D'

const input =
  'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'

const ADD_BUTTONS: { type: BlockType; label: string; icon: typeof Type }[] = [
  { type: 'heading', label: 'כותרת', icon: Heading },
  { type: 'text', label: 'טקסט', icon: Type },
  { type: 'image', label: 'תמונה', icon: ImageIcon },
  { type: 'button', label: 'כפתור', icon: MousePointerClick },
  { type: 'divider', label: 'מפריד', icon: Minus },
  { type: 'spacer', label: 'רווח', icon: MoveVertical },
]

const TYPE_LABEL: Record<BlockType, string> = {
  heading: 'כותרת',
  text: 'טקסט',
  image: 'תמונה',
  button: 'כפתור',
  divider: 'מפריד',
  spacer: 'רווח',
}

const ALIGNS: { value: 'right' | 'center' | 'left'; label: string }[] = [
  { value: 'right', label: 'ימין' },
  { value: 'center', label: 'מרכז' },
  { value: 'left', label: 'שמאל' },
]

function newBlock(type: BlockType): Block {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  switch (type) {
    case 'heading':
      return { id, type, content: 'כותרת חדשה', level: 1, align: 'right' }
    case 'text':
      return { id, type, content: '', align: 'right' }
    case 'image':
      return { id, type, src: '', alt: '' }
    case 'button':
      return { id, type, label: 'לחצו כאן', url: '', color: GOLD }
    case 'spacer':
      return { id, type, height: 20 }
    default:
      return { id, type }
  }
}

/** קבוצת כפתורי בחירה קטנה */
function Seg<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T | undefined
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-slate-200">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-xs font-medium transition-colors ${
            value === o.value
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function BlockEditor({
  blocks,
  onChange,
  mode,
  onModeChange,
  rawHtml,
  onRawHtmlChange,
}: {
  blocks: Block[]
  onChange: (b: Block[]) => void
  mode: 'blocks' | 'html'
  onModeChange: (m: 'blocks' | 'html') => void
  rawHtml: string
  onRawHtmlChange: (h: string) => void
}) {
  const [tagsOpen, setTagsOpen] = useState(false)
  // השדה האחרון שהיה בפוקוס — לשם מוזרק תג המיזוג
  const lastFocused = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)

  const update = useCallback(
    (id: string, patch: Partial<Block>) => {
      onChange(blocks.map(b => (b.id === id ? { ...b, ...patch } : b)))
    },
    [blocks, onChange],
  )

  const move = useCallback(
    (idx: number, dir: -1 | 1) => {
      const to = idx + dir
      if (to < 0 || to >= blocks.length) return
      const next = [...blocks]
      const [b] = next.splice(idx, 1)
      next.splice(to, 0, b)
      onChange(next)
    },
    [blocks, onChange],
  )

  const remove = useCallback(
    (id: string) => onChange(blocks.filter(b => b.id !== id)),
    [blocks, onChange],
  )

  const add = useCallback(
    (type: BlockType) => onChange([...blocks, newBlock(type)]),
    [blocks, onChange],
  )

  // הזרקת תג לשדה שהיה בפוקוס, במיקום הסמן
  const insertTag = useCallback((token: string) => {
    const el = lastFocused.current
    const snippet = `{{${token}}}`
    if (!el) return
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    const next = el.value.slice(0, start) + snippet + el.value.slice(end)

    // עדכון דרך native setter — כדי ש-React יקלוט את השינוי ויירה onChange
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    setter?.call(el, next)
    el.dispatchEvent(new Event('input', { bubbles: true }))

    const caret = start + snippet.length
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(caret, caret)
    })
  }, [])

  const focusProps = {
    onFocus: (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      lastFocused.current = e.currentTarget
    },
  }

  const switchMode = (m: 'blocks' | 'html') => {
    if (m === mode) return
    if (m === 'html') {
      const ok = window.confirm(
        'מעבר לעריכת HTML הוא חד-כיווני — לאחר המעבר לא ניתן לחזור לעריכת בלוקים בקמפיין זה. להמשיך?',
      )
      if (!ok) return
    }
    onModeChange(m)
  }

  return (
    <div dir="rtl" className="space-y-4">
      {/* ── סרגל עליון ── */}
      <div className={`${CARD} flex flex-wrap items-center justify-between gap-3 p-3`}>
        <Seg
          options={[
            { value: 'blocks' as const, label: 'בלוקים' },
            { value: 'html' as const, label: 'HTML' },
          ]}
          value={mode}
          onChange={switchMode}
        />

        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTagsOpen(o => !o)}
          >
            <Braces className="h-4 w-4" />
            משתני מיזוג
          </Button>

          {tagsOpen && (
            <>
              <button
                type="button"
                aria-label="סגירה"
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setTagsOpen(false)}
              />
              <div className="absolute left-0 z-20 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                  לחיצה מוסיפה את התג לשדה שהיה בפוקוס
                </div>
                <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                  {MERGE_TAGS.map(t => (
                    <li key={t.token}>
                      <button
                        type="button"
                        onClick={() => {
                          insertTag(t.token)
                          setTagsOpen(false)
                        }}
                        className="w-full px-3 py-2 text-right transition-colors hover:bg-indigo-50"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-700">{t.label}</span>
                          <code
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500"
                            dir="ltr"
                          >{`{{${t.token}}}`}</code>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-400">{t.example}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>

      {mode === 'html' ? (
        /* ── מצב HTML ── */
        <div className={`${CARD} p-4`}>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-bold" style={{ color: NAVY }}>
            <Code2 className="h-4 w-4" style={{ color: GOLD }} />
            עריכת HTML
          </div>
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              השתמשו בטבלאות ו-inline styles בלבד — תוכנות מייל אינן תומכות ב-flex/grid.
              ניתן לשלב משתני מיזוג בפורמט <code dir="ltr">{'{{שם_משפחה}}'}</code>.
            </span>
          </div>
          <textarea
            {...focusProps}
            value={rawHtml}
            onChange={e => onRawHtmlChange(e.target.value)}
            dir="ltr"
            spellCheck={false}
            rows={22}
            placeholder="<table role=&quot;presentation&quot;>…</table>"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      ) : (
        <>
          {/* ── כפתורי הוספה ── */}
          <div className={`${CARD} flex flex-wrap items-center gap-2 p-3`}>
            <span className="ml-1 inline-flex items-center gap-1 text-xs font-bold text-slate-500">
              <LayoutList className="h-3.5 w-3.5" />
              הוספת בלוק
            </span>
            {ADD_BUTTONS.map(({ type, label, icon: Icon }) => (
              <button
                key={type}
                type="button"
                onClick={() => add(type)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* ── רשימת הבלוקים ── */}
          {blocks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-400">
              אין בלוקים עדיין — הוסיפו בלוק כדי להתחיל
            </div>
          ) : (
            <div className="space-y-3">
              {blocks.map((b, i) => (
                <div key={b.id} className={`${CARD} p-3`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                      className="rounded-lg px-2 py-0.5 text-[11px] font-bold text-white"
                      style={{ background: NAVY }}
                    >
                      {TYPE_LABEL[b.type]}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="הזזה למעלה"
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                        className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="הזזה למטה"
                        disabled={i === blocks.length - 1}
                        onClick={() => move(i, 1)}
                        className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="מחיקה"
                        onClick={() => remove(b.id)}
                        className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* ── שדות לפי סוג ── */}
                  {(b.type === 'heading' || b.type === 'text') && (
                    <div className="space-y-2">
                      <textarea
                        {...focusProps}
                        value={b.content ?? ''}
                        onChange={e => update(b.id, { content: e.target.value })}
                        rows={b.type === 'heading' ? 2 : 5}
                        placeholder={b.type === 'heading' ? 'טקסט הכותרת' : 'תוכן הפסקה'}
                        className={input}
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        {b.type === 'heading' && (
                          <Seg
                            options={[
                              { value: 1 as const, label: 'ראשית' },
                              { value: 2 as const, label: 'משנית' },
                            ].map(o => ({ value: String(o.value) as '1' | '2', label: o.label }))}
                            value={String(b.level ?? 1) as '1' | '2'}
                            onChange={v => update(b.id, { level: Number(v) === 2 ? 2 : 1 })}
                          />
                        )}
                        <Seg
                          options={ALIGNS}
                          value={b.align ?? 'right'}
                          onChange={v => update(b.id, { align: v })}
                        />
                      </div>
                    </div>
                  )}

                  {b.type === 'image' && (
                    <div className="grid gap-2 md:grid-cols-3">
                      <input
                        {...focusProps}
                        type="url"
                        dir="ltr"
                        value={b.src ?? ''}
                        onChange={e => update(b.id, { src: e.target.value })}
                        placeholder="כתובת התמונה (https://…)"
                        className={input}
                      />
                      <input
                        {...focusProps}
                        type="text"
                        value={b.alt ?? ''}
                        onChange={e => update(b.id, { alt: e.target.value })}
                        placeholder="טקסט חלופי"
                        className={input}
                      />
                      <input
                        {...focusProps}
                        type="url"
                        dir="ltr"
                        value={b.href ?? ''}
                        onChange={e => update(b.id, { href: e.target.value })}
                        placeholder="קישור (אופציונלי)"
                        className={input}
                      />
                    </div>
                  )}

                  {b.type === 'button' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        {...focusProps}
                        type="text"
                        value={b.label ?? ''}
                        onChange={e => update(b.id, { label: e.target.value })}
                        placeholder="טקסט הכפתור"
                        className={`${input} flex-1 min-w-40`}
                      />
                      <input
                        {...focusProps}
                        type="url"
                        dir="ltr"
                        value={b.url ?? ''}
                        onChange={e => update(b.id, { url: e.target.value })}
                        placeholder="https://…"
                        className={`${input} flex-1 min-w-40`}
                      />
                      <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1">
                        <span className="text-xs text-slate-500">צבע</span>
                        <input
                          type="color"
                          value={b.color ?? GOLD}
                          onChange={e => update(b.id, { color: e.target.value })}
                          className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                        />
                      </label>
                    </div>
                  )}

                  {b.type === 'spacer' && (
                    <label className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">גובה (px)</span>
                      <input
                        type="number"
                        min={4}
                        max={80}
                        value={b.height ?? 20}
                        onChange={e => update(b.id, { height: Number(e.target.value) })}
                        className={`${input} w-24`}
                      />
                    </label>
                  )}

                  {b.type === 'divider' && (
                    <div className="h-0.5 w-full rounded" style={{ background: GOLD }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
