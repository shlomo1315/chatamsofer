'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Heading, Type, Image as ImageIcon, MousePointerClick, Minus, MoveVertical,
  Trash2, ChevronUp, ChevronDown, Braces, Upload, Loader2, Copy,
  AlignRight, AlignCenter, AlignLeft, Link2, Plus, Settings2,
} from 'lucide-react'
import type { Block, BlockType } from '@/lib/newsletter/blocks'
import { MERGE_TAGS } from '@/lib/newsletter/merge'
import { NEWSLETTER_ACTIONS } from '@/lib/newsletter/actions'
import { useToast } from '@/components/ui/Toast'

const NAVY = '#1B3256'
const GOLD = '#C69D2D'

const BLOCK_META: Record<BlockType, { label: string; icon: React.ElementType }> = {
  heading: { label: 'כותרת', icon: Heading },
  text:    { label: 'טקסט',  icon: Type },
  image:   { label: 'תמונה', icon: ImageIcon },
  button:  { label: 'כפתור', icon: MousePointerClick },
  divider: { label: 'מפריד', icon: Minus },
  spacer:  { label: 'רווח',  icon: MoveVertical },
}

const ADD_ORDER: BlockType[] = ['heading', 'text', 'image', 'button', 'divider', 'spacer']

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function newBlock(type: BlockType): Block {
  const id = newId()
  switch (type) {
    case 'heading': return { id, type, content: '', level: 1, align: 'right' }
    case 'text':    return { id, type, content: '', align: 'right' }
    case 'image':   return { id, type, src: '', alt: '' }
    case 'button':  return { id, type, label: 'לחצו כאן', url: '', color: GOLD }
    case 'spacer':  return { id, type, height: 20 }
    default:        return { id, type }
  }
}

/** הזרקת טקסט לשדה שהיה בפוקוס — עוקף את השליטה של React על הערך. */
export function insertAtCursor(el: HTMLTextAreaElement | HTMLInputElement | null, text: string) {
  if (!el) return
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? start
  const next = el.value.slice(0, start) + text + el.value.slice(end)

  const proto = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, next)
  el.dispatchEvent(new Event('input', { bubbles: true }))

  requestAnimationFrame(() => {
    el.focus()
    el.setSelectionRange(start + text.length, start + text.length)
  })
}

/** בורר משתני מיזוג — משותף לעורך ולשורת הנושא. */
export function MergeTagPicker({ onPick, hint }: {
  onPick: (token: string) => void
  hint?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50
                   px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
      >
        <Braces size={15} /> משתני מיזוג
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1.5 w-80 overflow-hidden rounded-xl
                          border border-slate-200 bg-white shadow-lg">
            <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              {hint ?? 'לחצו על שדה טקסט, ואז בחרו משתנה'}
            </div>
            <div className="max-h-72 overflow-y-auto">
              {MERGE_TAGS.map(t => (
                <button
                  key={t.token}
                  type="button"
                  onClick={() => { onPick(t.token); setOpen(false) }}
                  className="flex w-full items-start gap-2 border-b border-slate-50 px-3 py-2 text-right
                             transition last:border-0 hover:bg-indigo-50"
                >
                  <code className="mt-0.5 flex-shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[11px]
                                   font-bold text-indigo-700">
                    {`{{${t.token}}}`}
                  </code>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-700">{t.label}</span>
                    <span className="block truncate text-xs text-slate-400">{t.example}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// עורך WYSIWYG — הקנבס מציג את המייל בדיוק כפי שייראה, והעריכה נעשית עליו.
// mode / rawHtml אינם בשימוש עוד (מצב HTML הוסר) — נשארים ב-props לתאימות.
// ─────────────────────────────────────────────────────────────────────────────
export default function BlockEditor({
  blocks, onChange,
}: {
  blocks: Block[]
  onChange: (b: Block[]) => void
  mode: 'blocks' | 'html'
  onModeChange: (m: 'blocks' | 'html') => void
  rawHtml: string
  onRawHtmlChange: (h: string) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // ה-contentEditable האחרון שהיה בפוקוס — יעד הזרקת משתני המיזוג
  const lastEditable = useRef<HTMLElement | null>(null)

  const selected = blocks.find(b => b.id === selectedId) ?? null

  function update(id: string, patch: Partial<Block>) {
    onChange(blocks.map(b => (b.id === id ? { ...b, ...patch } : b)))
  }
  function remove(id: string) {
    onChange(blocks.filter(b => b.id !== id))
    if (selectedId === id) setSelectedId(null)
  }
  function duplicate(id: string) {
    const i = blocks.findIndex(b => b.id === id)
    if (i < 0) return
    const copy: Block = { ...blocks[i], id: newId() }
    const next = [...blocks]
    next.splice(i + 1, 0, copy)
    onChange(next)
    setSelectedId(copy.id)
  }
  function move(id: string, dir: -1 | 1) {
    const i = blocks.findIndex(b => b.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= blocks.length) return
    const next = [...blocks]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  /** הוספה אחרי הבלוק הנבחר (או בסוף) */
  function add(type: BlockType) {
    const b = newBlock(type)
    const i = selectedId ? blocks.findIndex(x => x.id === selectedId) : -1
    const next = [...blocks]
    if (i >= 0) next.splice(i + 1, 0, b)
    else next.push(b)
    onChange(next)
    setSelectedId(b.id)
  }

  /** הזרקת {{משתנה}} בסמן שבתוך ה-contentEditable שנערך */
  function insertTag(token: string) {
    const el = lastEditable.current
    if (!el) return
    el.focus()
    document.execCommand('insertText', false, `{{${token}}}`)
    const id = el.dataset.blockId
    if (id) update(id, { content: el.innerHTML })
  }

  return (
    <div className="flex min-h-[600px] overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* ── פאנל (שמאל ב-RTL) ── */}
      <aside className="flex w-72 flex-shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white">
        {/* הוספת בלוק */}
        <div className="border-b border-slate-100 p-4">
          <h3 className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
            <Plus size={13} /> הוספת בלוק
          </h3>
          <div className="grid grid-cols-2 gap-1.5">
            {ADD_ORDER.map(type => {
              const { label, icon: Icon } = BLOCK_META[type]
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => add(type)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white
                             px-2.5 py-2 text-xs font-semibold text-slate-600 transition
                             hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <Icon size={14} /> {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* הגדרות הבלוק הנבחר */}
        <div className="flex-1 border-b border-slate-100 p-4">
          <h3 className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
            <Settings2 size={13} /> הגדרות הבלוק
          </h3>
          {selected ? (
            <BlockSettings
              key={selected.id}
              block={selected}
              onUpdate={p => update(selected.id, p)}
            />
          ) : (
            <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs leading-relaxed text-slate-400">
              בחרו בלוק בקנבס כדי לערוך אותו
            </p>
          )}
        </div>

        {/* משתני מיזוג */}
        <div className="p-4">
          <h3 className="mb-2.5 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
            <Braces size={13} /> משתני מיזוג
          </h3>
          <p className="mb-2 text-[11px] leading-relaxed text-slate-400">
            לחצו בתוך טקסט בקנבס, ואז על משתנה — הוא יתווסף במקום הסמן.
          </p>
          <div className="flex flex-col gap-1 overflow-hidden rounded-lg border border-slate-200">
            {MERGE_TAGS.map(t => (
              <button
                key={t.token}
                type="button"
                // onMouseDown — מונע איבוד הפוקוס מה-contentEditable לפני ההזרקה
                onMouseDown={e => { e.preventDefault(); insertTag(t.token) }}
                className="flex items-center gap-2 border-b border-slate-50 px-2.5 py-1.5 text-right
                           transition last:border-0 hover:bg-indigo-50"
              >
                <code className="flex-shrink-0 rounded bg-indigo-100 px-1 py-0.5 text-[10px] font-bold text-indigo-700">
                  {`{{${t.token}}}`}
                </code>
                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── קנבס חי ── */}
      <div className="flex-1 overflow-y-auto bg-slate-100 p-6" dir="rtl">
        <div className="mx-auto max-w-[620px] overflow-hidden rounded-2xl bg-white shadow-lg">
          {/* פס navy + לוגו — כמו במעטפת האמיתית */}
          <div style={{ height: 6, background: NAVY }} />
          <div className="px-10 pb-2 pt-8 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="היכל החתם סופר" width={72} height={72} className="inline-block" />
          </div>

          <div className="px-10 pb-8 pt-5">
            {!blocks.length ? (
              <p className="py-20 text-center text-sm text-slate-400">
                המייל ריק — הוסיפו בלוק מהפאנל
              </p>
            ) : (
              blocks.map((b, i) => (
                <CanvasBlock
                  key={b.id}
                  block={b}
                  selected={b.id === selectedId}
                  first={i === 0}
                  last={i === blocks.length - 1}
                  onSelect={() => setSelectedId(b.id)}
                  onUpdate={p => update(b.id, p)}
                  onRemove={() => remove(b.id)}
                  onDuplicate={() => duplicate(b.id)}
                  onMove={d => move(b.id, d)}
                  editableRef={lastEditable}
                />
              ))
            )}
          </div>

          {/* פוטר — תצוגה בלבד, נוסף אוטומטית בשליחה */}
          <div className="border-t-2 bg-slate-50 px-10 py-5 text-center" style={{ borderTopColor: `${NAVY}22` }}>
            <p className="m-0 text-[13px] font-bold text-slate-700">היכל החתם סופר</p>
            <p className="m-0 text-xs text-slate-400">office@chasamsofer.info</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// בלוק בקנבס — מרונדר כפי שייראה במייל
// ─────────────────────────────────────────────────────────────────────────────
function CanvasBlock({
  block: b, selected, first, last,
  onSelect, onUpdate, onRemove, onDuplicate, onMove, editableRef,
}: {
  block: Block
  selected: boolean
  first: boolean
  last: boolean
  onSelect: () => void
  onUpdate: (p: Partial<Block>) => void
  onRemove: () => void
  onDuplicate: () => void
  onMove: (d: -1 | 1) => void
  editableRef: React.MutableRefObject<HTMLElement | null>
}) {
  return (
    <div
      onClick={onSelect}
      className={`group relative mb-1 cursor-pointer rounded-lg transition ${
        selected ? 'ring-2 ring-indigo-400' : 'hover:ring-1 hover:ring-slate-300'
      }`}
    >
      {/* כפתורים צפים בהובר */}
      <div className="absolute -top-3 left-2 z-10 hidden items-center gap-0.5 rounded-lg border
                      border-slate-200 bg-white px-1 py-0.5 shadow-md group-hover:flex">
        <IconBtn onClick={() => onMove(-1)} disabled={first} title="למעלה"><ChevronUp size={14} /></IconBtn>
        <IconBtn onClick={() => onMove(1)} disabled={last} title="למטה"><ChevronDown size={14} /></IconBtn>
        <IconBtn onClick={onDuplicate} title="שכפול"><Copy size={13} /></IconBtn>
        <IconBtn onClick={onRemove} title="מחיקה" danger><Trash2 size={13} /></IconBtn>
      </div>

      <BlockBody block={b} onUpdate={onUpdate} editableRef={editableRef} />
    </div>
  )
}

function BlockBody({ block: b, onUpdate, editableRef }: {
  block: Block
  onUpdate: (p: Partial<Block>) => void
  editableRef: React.MutableRefObject<HTMLElement | null>
}) {
  const align = b.align ?? 'right'

  switch (b.type) {
    case 'heading':
      return (
        <Editable
          id={b.id}
          tag="h2"
          html={b.content ?? ''}
          onInput={html => onUpdate({ content: html })}
          editableRef={editableRef}
          placeholder="כותרת…"
          style={{
            margin: '0 0 16px',
            color: NAVY,
            fontSize: b.level === 2 ? 20 : 25,
            fontWeight: 900,
            lineHeight: 1.4,
            textAlign: align,
          }}
        />
      )

    case 'text':
      return (
        <Editable
          id={b.id}
          tag="div"
          html={b.content ?? ''}
          onInput={html => onUpdate({ content: html })}
          editableRef={editableRef}
          placeholder="כתבו כאן…"
          style={{
            margin: '0 0 16px',
            color: '#334155',
            fontSize: 15,
            lineHeight: 1.9,
            textAlign: align,
          }}
        />
      )

    case 'image':
      return (
        <div style={{ margin: '0 0 18px', textAlign: 'center' }}>
          {b.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={b.src}
              alt={b.alt ?? ''}
              style={{ display: 'block', width: '100%', maxWidth: 540, height: 'auto', borderRadius: 12, margin: '0 auto' }}
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5 rounded-xl border-2 border-dashed
                            border-slate-300 bg-slate-50/60 py-12 text-slate-400">
              <ImageIcon size={26} />
              <span className="text-sm font-semibold">לחצו להעלאת תמונה</span>
              <span className="text-xs">ההעלאה בפאנל ההגדרות</span>
            </div>
          )}
        </div>
      )

    case 'button':
      return (
        <div style={{ margin: '0 0 18px', textAlign: 'center' }}>
          <div
            className="inline-block rounded-xl px-6 py-3.5 text-[15px] font-bold text-white"
            style={{ background: b.color ?? GOLD }}
          >
            {b.label || 'לחצו כאן'}
          </div>
        </div>
      )

    case 'divider':
      return (
        <div style={{ margin: '22px 0' }}>
          <div style={{ borderTop: `2px solid ${GOLD}` }} />
        </div>
      )

    case 'spacer': {
      const h = Math.min(Math.max(Number(b.height) || 20, 4), 80)
      return (
        <div
          className="flex items-center justify-center rounded border border-dashed border-transparent
                     text-[10px] text-transparent transition hover:border-slate-300 hover:text-slate-400"
          style={{ height: h }}
        >
          {h}px
        </div>
      )
    }

    default:
      return null
  }
}

/**
 * שדה עריכה חי.
 * ה-innerHTML נקבע פעם אחת ב-mount בלבד — כתיבה חוזרת בכל render מאפסת את
 * מיקום הסמן. מכאן והלאה ה-DOM הוא מקור האמת לתוכן, ו-onInput רק מסנכרן ל-state.
 */
function Editable({ id, tag, html, onInput, editableRef, placeholder, style }: {
  id: string
  tag: 'h2' | 'div'
  html: string
  onInput: (html: string) => void
  editableRef: React.MutableRefObject<HTMLElement | null>
  placeholder: string
  style: React.CSSProperties
}) {
  const ref = useRef<HTMLElement | null>(null)
  const [empty, setEmpty] = useState(!html)

  useEffect(() => {
    if (ref.current) ref.current.innerHTML = html
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const Tag = tag as 'div'

  return (
    <div className="relative">
      <Tag
        ref={ref as React.RefObject<HTMLDivElement>}
        data-block-id={id}
        contentEditable
        suppressContentEditableWarning
        dir="rtl"
        onFocus={() => { editableRef.current = ref.current }}
        onInput={e => {
          const el = e.currentTarget
          setEmpty(!el.textContent?.trim())
          onInput(el.innerHTML)
        }}
        onPaste={e => {
          // הדבקה כטקסט נקי — HTML מ-Word/אתרים שובר את המייל
          e.preventDefault()
          const text = e.clipboardData.getData('text/plain')
          document.execCommand('insertText', false, text)
        }}
        style={{ ...style, outline: 'none', minHeight: '1.2em' }}
        className="rounded px-1 focus:bg-indigo-50/40"
      />
      {empty && (
        <span
          className="pointer-events-none absolute inset-x-1 top-0 select-none text-slate-300"
          style={{ fontSize: style.fontSize, lineHeight: style.lineHeight, textAlign: style.textAlign }}
        >
          {placeholder}
        </span>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// פאנל ההגדרות — משתנה לפי סוג הבלוק
// ─────────────────────────────────────────────────────────────────────────────
function BlockSettings({ block: b, onUpdate }: {
  block: Block
  onUpdate: (p: Partial<Block>) => void
}) {
  const { label, icon: Icon } = BLOCK_META[b.type]

  return (
    <div className="flex flex-col gap-3">
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1.5
                       text-xs font-bold text-indigo-700">
        <Icon size={13} /> {label}
      </span>

      {b.type === 'heading' && (
        <>
          <Field label="סוג כותרת">
            <Segmented
              options={[{ v: 1, l: 'ראשית' }, { v: 2, l: 'משנית' }]}
              value={b.level ?? 1}
              onChange={v => onUpdate({ level: v as 1 | 2 })}
            />
          </Field>
          <Field label="יישור">
            <AlignPicker value={b.align} onChange={a => onUpdate({ align: a })} />
          </Field>
        </>
      )}

      {b.type === 'text' && (
        <Field label="יישור">
          <AlignPicker value={b.align} onChange={a => onUpdate({ align: a })} />
        </Field>
      )}

      {b.type === 'image' && <ImageSettings block={b} onUpdate={onUpdate} />}
      {b.type === 'button' && <ButtonSettings block={b} onUpdate={onUpdate} />}

      {b.type === 'spacer' && (
        <Field label={`גובה — ${Math.min(Math.max(Number(b.height) || 20, 4), 80)}px`}>
          <input
            type="range" min={4} max={80} step={2}
            value={b.height ?? 20}
            onChange={e => onUpdate({ height: Number(e.target.value) })}
            className="w-full accent-indigo-500"
          />
        </Field>
      )}

      {b.type === 'divider' && (
        <p className="text-xs text-slate-400">קו מפריד — אין הגדרות.</p>
      )}
    </div>
  )
}

function ImageSettings({ block: b, onUpdate }: {
  block: Block
  onUpdate: (p: Partial<Block>) => void
}) {
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function upload(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/admin/newsletter/upload', { method: 'POST', body: form })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'העלאה נכשלה')
      onUpdate({ src: d.url })
      toast.success('התמונה הועלתה')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-indigo-200
                   bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 transition
                   hover:bg-indigo-100 disabled:opacity-50"
      >
        {uploading
          ? <><Loader2 size={14} className="animate-spin" /> מעלה…</>
          : <><Upload size={14} /> {b.src ? 'החלפת תמונה' : 'העלאת תמונה'}</>}
      </button>
      <p className="-mt-1.5 text-[11px] text-slate-400">JPG · PNG · GIF · WEBP · עד 5MB</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }}
        className="hidden"
      />

      <Field label="טקסט חלופי">
        <TextInput value={b.alt ?? ''} onChange={v => onUpdate({ alt: v })} placeholder="תיאור התמונה" />
      </Field>
      <Field label="קישור בלחיצה (אופציונלי)">
        <TextInput value={b.href ?? ''} onChange={v => onUpdate({ href: v })} placeholder="https://…" ltr />
      </Field>
    </>
  )
}

function ButtonSettings({ block: b, onUpdate }: {
  block: Block
  onUpdate: (p: Partial<Block>) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="inline-flex w-full items-center justify-between gap-2 rounded-lg border
                     border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700
                     transition hover:bg-indigo-100"
        >
          <span className="inline-flex items-center gap-1.5"><Link2 size={13} /> פעולה מוכנה</span>
          <ChevronDown size={13} />
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-20 mt-1.5 w-full overflow-hidden rounded-xl
                            border border-slate-200 bg-white shadow-lg">
              {NEWSLETTER_ACTIONS.map(a => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => {
                    onUpdate(a.key === 'custom'
                      ? { url: '', color: a.color }
                      : { label: a.label, url: a.url, color: a.color })
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-2 border-b border-slate-50 px-2.5 py-2
                             text-right transition last:border-0 hover:bg-slate-50"
                >
                  <span className="h-6 w-1.5 flex-shrink-0 rounded-full" style={{ background: a.color }} />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-slate-700">{a.label}</span>
                    <span className="block truncate text-[11px] text-slate-400">{a.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <Field label="טקסט הכפתור">
        <TextInput value={b.label ?? ''} onChange={v => onUpdate({ label: v })} placeholder="לחצו כאן" />
      </Field>
      <Field label="כתובת">
        <TextInput value={b.url ?? ''} onChange={v => onUpdate({ url: v })} placeholder="https://…" ltr />
      </Field>
      <Field label="צבע">
        <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
          <input
            type="color"
            value={b.color ?? GOLD}
            onChange={e => onUpdate({ color: e.target.value })}
            className="h-6 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          <span className="font-mono text-[11px] text-slate-400">{b.color ?? GOLD}</span>
        </label>
      </Field>
    </>
  )
}

// ── רכיבי עזר ──
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-slate-500">{label}</span>
      {children}
    </label>
  )
}

function TextInput({ value, onChange, placeholder, ltr }: {
  value: string; onChange: (v: string) => void; placeholder?: string; ltr?: boolean
}) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      dir={ltr ? 'ltr' : undefined}
      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs
                 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
    />
  )
}

function IconBtn({ children, onClick, disabled, title, danger }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string; danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick() }}
      disabled={disabled}
      title={title}
      className={`rounded p-1 transition disabled:opacity-20 ${
        danger ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
               : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

function Segmented({ options, value, onChange }: {
  options: { v: number; l: string }[]; value: number; onChange: (v: number) => void
}) {
  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5">
      {options.map(o => (
        <button
          key={o.v} type="button" onClick={() => onChange(o.v)}
          className={`flex-1 rounded px-3 py-1 text-xs font-semibold transition ${
            value === o.v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  )
}

function AlignPicker({ value = 'right', onChange }: {
  value?: 'right' | 'center' | 'left'; onChange: (a: 'right' | 'center' | 'left') => void
}) {
  const opts = [
    { v: 'right' as const, icon: AlignRight },
    { v: 'center' as const, icon: AlignCenter },
    { v: 'left' as const, icon: AlignLeft },
  ]
  return (
    <div className="flex rounded-lg bg-slate-100 p-0.5">
      {opts.map(o => {
        const Icon = o.icon
        return (
          <button
            key={o.v} type="button" onClick={() => onChange(o.v)}
            className={`flex-1 rounded py-1.5 transition ${
              value === o.v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'
            }`}
          >
            <Icon size={14} className="mx-auto" />
          </button>
        )
      })}
    </div>
  )
}
