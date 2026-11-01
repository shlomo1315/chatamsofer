'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { X, ChevronUp, ChevronDown, Lock } from 'lucide-react'

// כרטסת קופצת אחידה לכל מחלקות הניהול: חלונית במרכז המסך על רקע מטושטש.
// כל מחלקה מעבירה רק הגדרות (שדות, שלבים, לשוניות ופעולות). עיצוב ומקלדת כאן, במקום אחד.

export type RecordTone = 'new' | 'wait' | 'chk' | 'ok' | 'no'
export type RecordField = { label: string; value?: string | null; ltr?: boolean; lock?: string }
export type RecordSection = { title: string; fields: RecordField[] }
export type RecordTab = { key: string; label: string; count?: number; content: ReactNode }
export type RecordSummary = { label: string; value: string }
export type RecordSteps = { labels: string[]; current: number; rejected?: boolean }

const TONE: Record<RecordTone, string> = {
  new: 'bg-[#F6EBD2] text-[#87600F]',
  wait: 'bg-[#E7EBF3] text-[#34477A]',
  chk: 'bg-[#FBE6D6] text-[#9A4314]',
  ok: 'bg-[#E0EFE4] text-[#22663A]',
  no: 'bg-[#F6E0DE] text-[#9A2F24]',
}

export default function RecordModal(props: {
  title: string
  subtitle?: string
  statusLabel: string
  statusTone: RecordTone
  summary?: RecordSummary[]
  steps?: RecordSteps
  sections: RecordSection[]
  note?: { title: string; text: string }
  tabs?: RecordTab[]
  actions?: ReactNode
  kind: string
  index: number
  total: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const { title, subtitle, statusLabel, statusTone, summary, steps, sections, note, tabs, actions, kind, index, total, onIndex, onClose } = props
  const [tab, setTab] = useState(0)
  const [prevIndex, setPrevIndex] = useState(index)
  if (prevIndex !== index) { setPrevIndex(index); setTab(0) }

  useEffect(() => {
    const go = (s: number) => onIndex((index + s + total) % total)
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) { if (e.key === 'Escape') onClose(); return }
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); go(1) }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); go(-1) }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [index, total, onIndex, onClose])

  const activeTab = tabs?.[Math.min(tab, (tabs?.length ?? 1) - 1)]

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-[#0D1730]/40 p-[2vw] backdrop-blur-[8px] md:p-6"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={`כרטסת ${kind}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex h-[92vh] w-full max-w-[1020px] flex-col overflow-hidden rounded-2xl bg-[#FFFDF8] shadow-[0_40px_100px_rgba(13,23,48,.45)] md:h-[min(88vh,800px)]">
        <div className="relative flex-none bg-[#14213D] px-4 pt-3 text-white md:px-[26px]">
          <div className="flex items-center gap-1 text-xs text-[#8F9AB5]">
            <span>כרטסת {kind} · {index + 1} מתוך {total}</span>
            <button onClick={() => onIndex((index - 1 + total) % total)} title="הקודם" aria-label="הקודם" className="grid h-9 w-9 place-items-center rounded-lg text-[#C9D0E2] hover:bg-[#22345E]"><ChevronUp size={18} /></button>
            <button onClick={() => onIndex((index + 1) % total)} title="הבא" aria-label="הבא" className="grid h-9 w-9 place-items-center rounded-lg text-[#C9D0E2] hover:bg-[#22345E]"><ChevronDown size={18} /></button>
            <button onClick={onClose} title="סגירה (Esc)" aria-label="סגירה" className="mr-auto grid h-9 w-9 place-items-center rounded-lg text-[#C9D0E2] hover:bg-[#22345E]"><X size={18} /></button>
          </div>
          <div className="mt-2 flex items-center gap-4">
            <div className="relative grid h-[46px] w-[46px] flex-none place-items-center rounded-full border-[1.5px] border-[#C0912F] text-[19px] font-black text-[#C0912F] md:h-[58px] md:w-[58px] md:text-2xl">
              <span aria-hidden className="absolute inset-[3px] rounded-full border border-dashed border-[#C0912F]/45" />
              {title.charAt(0)}
            </div>
            <div className="min-w-0">
              <h2 className="text-[21px] font-black leading-tight md:text-[28px]">{title}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-2.5 text-[13px] text-[#9AA5C0]">
                <span className={`inline-flex items-center gap-1.5 rounded-[5px] px-2.5 py-[3px] text-xs font-medium ${TONE[statusTone]}`}>
                  <i className="h-1.5 w-1.5 rounded-full bg-current" />{statusLabel}
                </span>
                {subtitle && <span>{subtitle}</span>}
              </p>
            </div>
          </div>
          {summary && summary.length > 0 && (
            <div className="mt-[18px] flex flex-wrap border-t border-[#26365C]">
              {summary.map((s, i) => (
                <div key={i} className="min-w-[45%] flex-1 border-[#26365C] py-3 pr-4 text-[11.5px] text-[#8F9AB5] first:pr-0 md:min-w-0 md:border-l md:last:border-l-0">
                  {s.label}
                  <b className="mt-0.5 block text-[17px] font-bold tabular-nums text-white">{s.value}</b>
                </div>
              ))}
            </div>
          )}
          {steps && (
            <div className="flex pb-4 pt-1">
              {steps.labels.map((l, i) => {
                const cur = i === steps.current
                const done = i < steps.current
                const rej = steps.rejected && cur
                const bar = rej ? 'bg-[#B04A3E]' : done || cur ? 'bg-[#C0912F]' : 'bg-[#2B3B62]'
                const txt = rej ? 'font-bold text-[#F1A39A]' : cur ? 'font-bold text-white' : done ? 'text-[#D9D4C6]' : 'text-[#7D89A8]'
                return (
                  <div key={i} className={`flex-1 text-right text-[10.5px] md:text-xs ${txt}`}>
                    <div className={`mb-2 ml-1 h-1 rounded-sm ${bar} ${cur && !rej ? 'shadow-[0_0_0_3px_rgba(192,145,47,.25)]' : ''}`} />
                    {rej ? 'נדחה' : l}
                  </div>
                )
              })}
            </div>
          )}
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-[#C0912F]" />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto md:grid-cols-[1.2fr_1fr] md:overflow-hidden">
          <div className="px-4 pb-5 pt-1 md:overflow-auto md:px-[26px]">
            {sections.map((sec) => (
              <div key={sec.title}>
                <div className="mb-1 mt-5 flex items-center gap-2 text-[11.5px] font-medium tracking-[.1em] text-[#8A6316]">
                  {sec.title}<span className="h-px flex-1 bg-[#EFE9DC]" />
                </div>
                {sec.fields.map((f) => (
                  <div key={f.label} className="grid grid-cols-[100px_1fr] items-center gap-2.5 border-b border-dashed border-[#E4DCCB] py-2.5 text-sm md:grid-cols-[130px_1fr_auto]">
                    <span className="text-[13px] font-light text-[#6B6352]">{f.label}</span>
                    <b dir={f.ltr ? 'ltr' : undefined} className={`min-w-0 break-words font-medium tabular-nums ${f.ltr ? 'text-right' : ''}`}>{f.value || '—'}</b>
                    {f.lock ? <span className="hidden items-center gap-1 text-[11px] text-[#958C78] md:flex"><Lock size={13} />{f.lock}</span> : <span />}
                  </div>
                ))}
              </div>
            ))}
            {note && note.text && (
              <div className="mt-4 whitespace-pre-line rounded-lg border-r-[3px] border-[#C0912F] bg-[#F4E9CF] px-3.5 py-3 text-[13px] leading-[1.55] text-[#5C4512]">
                <b>{note.title}:</b> {note.text}
              </div>
            )}
          </div>
          <div className="border-t border-[#E6DFCF] bg-[#FAF6EC] md:overflow-auto md:border-r md:border-t-0">
            {tabs && tabs.length > 0 && (
              <>
                <div className="sticky top-0 z-[1] flex gap-0.5 border-b border-[#E6DFCF] bg-[#FAF6EC] px-2 md:px-5">
                  {tabs.map((t, i) => (
                    <button key={t.key} onClick={() => setTab(i)}
                      className={`-mb-px min-h-12 border-b-2 px-3 text-sm ${activeTab === t ? 'border-[#C0912F] font-bold text-[#14213D]' : 'border-transparent text-[#6B6352]'}`}>
                      {t.label}
                      {!!t.count && <b className="mr-1 rounded-lg bg-[#C0912F] px-1.5 text-[10.5px] text-[#14213D]">{t.count}</b>}
                    </button>
                  ))}
                </div>
                <div className="px-4 pb-5 pt-1 md:px-[26px]">{activeTab?.content}</div>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-none flex-wrap items-center gap-2 border-t border-[#E6DFCF] bg-[#FFFDF8] px-3 py-3 md:px-[26px] md:py-3.5">
          {actions}
          <small className="mr-auto hidden text-[11.5px] text-[#958C78] md:block">
            <kbd className="rounded border border-[#E6DFCF] bg-white px-1.5 text-[11px]">↑</kbd> <kbd className="rounded border border-[#E6DFCF] bg-white px-1.5 text-[11px]">↓</kbd> רשומה הבאה · <kbd className="rounded border border-[#E6DFCF] bg-white px-1.5 text-[11px]">Esc</kbd> סגירה
          </small>
        </div>
      </div>
    </div>
  )
}

// כפתורי פעולה אחידים לתחתית הכרטסת
export const modalBtn = {
  primary: 'inline-flex min-h-[42px] items-center justify-center gap-2 whitespace-nowrap rounded-[9px] bg-[#14213D] px-4 text-sm font-medium text-white hover:bg-[#22345E] md:min-w-[200px]',
  ghost: 'inline-flex min-h-[42px] items-center justify-center gap-2 whitespace-nowrap rounded-[9px] border border-[#D9CFB9] bg-[#FFFDF8] px-4 text-sm font-medium text-[#1B2338] hover:border-[#14213D]',
}
