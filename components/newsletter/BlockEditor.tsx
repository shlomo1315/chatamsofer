'use client'

import { useRef, useState } from 'react'
import {
  Heading, Type, Image as ImageIcon, MousePointerClick, Minus, MoveVertical,
  Trash2, ChevronUp, ChevronDown, Braces, Upload, Loader2, Code, LayoutList,
  AlignRight, AlignCenter, AlignLeft, Link2,
} from 'lucide-react'
import type { Block, BlockType } from '@/lib/newsletter/blocks'
import { MERGE_TAGS } from '@/lib/newsletter/merge'
import { NEWSLETTER_ACTIONS } from '@/lib/newsletter/actions'
import { useToast } from '@/components/ui/Toast'

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

function newBlock(type: BlockType): Block {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  switch (type) {
    case 'heading': return { id, type, content: '', level: 1, align: 'right' }
    case 'text':    return { id, type, content: '', align: 'right' }
    case 'image':   return { id, type, src: '', alt: '' }
    case 'button':  return { id, type, label: 'לחצו כאן', url: '', color: GOLD }
    case 'spacer':  return { id, type, height: 20 }
    default:        return { id, type }
  }
}

type FieldRef = React.MutableRefObject<HTMLTextAreaElement | HTMLInputElement | null>

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

export default function BlockEditor({
  blocks, onChange, mode, onModeChange, rawHtml, onRawHtmlChange,
}: {
  blocks: Block[]
  onChange: (b: Block[]) => void
  mode: 'blocks' | 'html'
  onModeChange: (m: 'blocks' | 'html') => void
  rawHtml: string
  onRawHtmlChange: (h: string) => void
}) {
  const lastField: FieldRef = useRef(null)

  function update(id: string, patch: Partial<Block>) {
    onChange(blocks.map(b => (b.id === id ? { ...b, ...patch } : b)))
  }
  function remove(id: string) {
    onChange(blocks.filter(b => b.id !== id))
  }
  function move(id: string, dir: -1 | 1) {
    const i = blocks.findIndex(b => b.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= blocks.length) return
    const next = [...blocks]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  function switchMode(m: 'blocks' | 'html') {
    if (m === 'html' && mode === 'blocks') {
      if (!confirm('מעבר לעריכת HTML הוא חד-כיווני — לא ניתן לחזור לעריכת בלוקים. להמשיך?')) return
    }
    onModeChange(m)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {/* סרגל */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div className="flex rounded-xl bg-slate-100 p-0.5">
          <ModeBtn active={mode === 'blocks'} onClick={() => switchMode('blocks')} icon={LayoutList} label="בלוקים" />
          <ModeBtn active={mode === 'html'} onClick={() => switchMode('html')} icon={Code} label="HTML" />
        </div>
        <MergeTagPicker onPick={t => insertAtCursor(lastField.current, `{{${t}}}`)} />
      </div>

      {mode === 'html' ? (
        <div className="p-4">
          <textarea
            value={rawHtml}
            onChange={e => onRawHtmlChange(e.target.value)}
            onFocus={e => { lastField.current = e.target }}
            rows={20}
            dir="ltr"
            placeholder="<table>…</table>"
            className="w-full rounded-xl border border-slate-300 p-3 font-mono text-xs
                       focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-700">
            <strong>שימו לב:</strong> תוכנות מייל תומכות רק בטבלאות ובעיצוב inline.
            <code className="mx-1 rounded bg-amber-100 px-1">flex</code> ו-
            <code className="mx-1 rounded bg-amber-100 px-1">grid</code> לא יעבדו ב-Outlook.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 border-b border-slate-100 bg-slate-50 p-3">
            <span className="mr-1 self-center text-xs font-semibold text-slate-400">הוספה:</span>
            {ADD_ORDER.map(type => {
              const { label, icon: Icon } = BLOCK_META[type]
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onChange([...blocks, newBlock(type)])}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white
                             px-3 py-1.5 text-xs font-semibold text-slate-600 transition
                             hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  <Icon size={13} /> {label}
                </button>
              )
            })}
          </div>

          <div className="flex flex-col gap-3 bg-slate-50/50 p-4">
            {!blocks.length && (
              <p className="py-12 text-center text-sm text-slate-400">
                המייל ריק — הוסיפו בלוק כדי להתחיל
              </p>
            )}
            {blocks.map((b, i) => (
              <BlockCard
                key={b.id}
                block={b}
                first={i === 0}
                last={i === blocks.length - 1}
                onUpdate={p => update(b.id, p)}
                onRemove={() => remove(b.id)}
                onMove={d => move(b.id, d)}
                fieldRef={lastField}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ModeBtn({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: React.ElementType; label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
        active ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      <Icon size={14} /> {label}
    </button>
  )
}

function BlockCard({ block: b, first, last, onUpdate, onRemove, onMove, fieldRef }: {
  block: Block
  first: boolean
  last: boolean
  onUpdate: (p: Partial<Block>) => void
  onRemove: () => void
  onMove: (d: -1 | 1) => void
  fieldRef: FieldRef
}) {
  const { label, icon: Icon } = BLOCK_META[b.type]
  const focus = (e: React.FocusEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    fieldRef.current = e.target
  }

  return (
    <div className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition
                    hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
          <Icon size={13} /> {label}
        </span>
        <div className="flex items-center gap-0.5 opacity-40 transition group-hover:opacity-100">
          <IconBtn onClick={() => onMove(-1)} disabled={first} title="למעלה"><ChevronUp size={15} /></IconBtn>
          <IconBtn onClick={() => onMove(1)} disabled={last} title="למטה"><ChevronDown size={15} /></IconBtn>
          <IconBtn onClick={onRemove} title="מחיקה" danger><Trash2 size={14} /></IconBtn>
        </div>
      </div>

      <div className="p-3">
        {b.type === 'heading' && (
          <>
            <textarea
              value={b.content ?? ''}
              onChange={e => onUpdate({ content: e.target.value })}
              onFocus={focus}
              rows={2}
              placeholder="כותרת…"
              className="mb-2.5 w-full resize-none rounded-lg border border-slate-200 p-2.5 text-lg font-bold
                         focus:border-indigo-400 focus:outline-none"
            />
            <div className="flex flex-wrap gap-3">
              <Segmented
                options={[{ v: 1, l: 'ראשית' }, { v: 2, l: 'משנית' }]}
                value={b.level ?? 1}
                onChange={v => onUpdate({ level: v as 1 | 2 })}
              />
              <AlignPicker value={b.align} onChange={a => onUpdate({ align: a })} />
            </div>
          </>
        )}

        {b.type === 'text' && (
          <>
            <textarea
              value={b.content ?? ''}
              onChange={e => onUpdate({ content: e.target.value })}
              onFocus={focus}
              rows={4}
              placeholder="כתבו כאן…"
              className="mb-2.5 w-full rounded-lg border border-slate-200 p-2.5 text-sm leading-relaxed
                         focus:border-indigo-400 focus:outline-none"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AlignPicker value={b.align} onChange={a => onUpdate({ align: a })} />
              <span className="text-[11px] text-slate-400">
                תגי HTML בסיסיים נתמכים: <code className="rounded bg-slate-100 px-1">&lt;b&gt;</code>
                <code className="mr-1 rounded bg-slate-100 px-1">&lt;a href=&quot;…&quot;&gt;</code>
              </span>
            </div>
          </>
        )}

        {b.type === 'image' && <ImageBlock block={b} onUpdate={onUpdate} onFocus={focus} />}
        {b.type === 'button' && <ButtonBlock block={b} onUpdate={onUpdate} onFocus={focus} />}

        {b.type === 'divider' && (
          <div className="py-2"><div className="h-0.5 rounded" style={{ background: GOLD }} /></div>
        )}

        {b.type === 'spacer' && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">גובה</span>
            <input
              type="number" min={4} max={80}
              value={b.height ?? 20}
              onChange={e => onUpdate({ height: Number(e.target.value) })}
              className="w-20 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm
                         focus:border-indigo-400 focus:outline-none"
            />
            <span className="text-slate-400">px</span>
          </label>
        )}
      </div>
    </div>
  )
}

// ── תמונה: העלאה מהמחשב ──
function ImageBlock({ block: b, onUpdate, onFocus }: {
  block: Block
  onUpdate: (p: Partial<Block>) => void
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void
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
      {b.src ? (
        <div className="mb-2.5 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={b.src} alt="" className="max-h-48 w-full object-contain" />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="mb-2.5 flex w-full flex-col items-center gap-1.5 rounded-lg border-2 border-dashed
                     border-slate-200 py-8 transition hover:border-indigo-300 hover:bg-indigo-50/40
                     disabled:opacity-50"
        >
          {uploading
            ? <Loader2 size={22} className="animate-spin text-indigo-500" />
            : <Upload size={22} className="text-slate-300" />}
          <span className="text-sm font-semibold text-slate-600">
            {uploading ? 'מעלה…' : 'העלאת תמונה מהמחשב'}
          </span>
          <span className="text-xs text-slate-400">JPG · PNG · GIF · WEBP · עד 5MB</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }}
        className="hidden"
      />

      <div className="flex flex-wrap gap-2">
        {b.src && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold
                       text-slate-600 transition hover:bg-slate-50"
          >
            החלפת תמונה
          </button>
        )}
        <input
          value={b.alt ?? ''}
          onChange={e => onUpdate({ alt: e.target.value })}
          onFocus={onFocus}
          placeholder="טקסט חלופי"
          className="min-w-32 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm
                     focus:border-indigo-400 focus:outline-none"
        />
        <input
          value={b.href ?? ''}
          onChange={e => onUpdate({ href: e.target.value })}
          onFocus={onFocus}
          dir="ltr"
          placeholder="קישור בלחיצה (אופציונלי)"
          className="min-w-40 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm
                     focus:border-indigo-400 focus:outline-none"
        />
      </div>
    </>
  )
}

// ── כפתור: רשימת פעולות מוכנות ──
function ButtonBlock({ block: b, onUpdate, onFocus }: {
  block: Block
  onUpdate: (p: Partial<Block>) => void
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="relative mb-2.5">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="inline-flex w-full items-center justify-between gap-2 rounded-lg border
                     border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700
                     transition hover:bg-indigo-100"
        >
          <span className="inline-flex items-center gap-1.5"><Link2 size={14} /> בחירת פעולה מוכנה</span>
          <ChevronDown size={14} />
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
                  className="flex w-full items-center gap-2.5 border-b border-slate-50 px-3 py-2.5
                             text-right transition last:border-0 hover:bg-slate-50"
                >
                  <span className="h-7 w-1.5 flex-shrink-0 rounded-full" style={{ background: a.color }} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-700">{a.label}</span>
                    <span className="block truncate text-xs text-slate-400">{a.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={b.label ?? ''}
          onChange={e => onUpdate({ label: e.target.value })}
          onFocus={onFocus}
          placeholder="טקסט הכפתור"
          className="min-w-32 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-semibold
                     focus:border-indigo-400 focus:outline-none"
        />
        <input
          value={b.url ?? ''}
          onChange={e => onUpdate({ url: e.target.value })}
          onFocus={onFocus}
          dir="ltr"
          placeholder="https://…"
          className="min-w-40 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm
                     focus:border-indigo-400 focus:outline-none"
        />
        <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1">
          <input
            type="color"
            value={b.color ?? GOLD}
            onChange={e => onUpdate({ color: e.target.value })}
            className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          <span className="text-xs text-slate-400">צבע</span>
        </label>
      </div>

      {b.label && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3">
          <div
            className="mx-auto max-w-xs rounded-xl px-5 py-3 text-center text-sm font-bold text-white"
            style={{ background: b.color ?? GOLD }}
          >
            {b.label}
          </div>
        </div>
      )}
    </>
  )
}

function IconBtn({ children, onClick, disabled, title, danger }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; title: string; danger?: boolean
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title}
      className={`rounded p-1 transition disabled:opacity-20 ${
        danger ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
               : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
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
          className={`rounded px-3 py-1 text-xs font-semibold transition ${
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
            className={`rounded p-1.5 transition ${
              value === o.v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'
            }`}
          >
            <Icon size={14} />
          </button>
        )
      })}
    </div>
  )
}
