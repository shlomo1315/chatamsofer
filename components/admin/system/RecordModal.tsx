'use client'
import { useEffect, useState, type ReactNode } from 'react'
import { X, ChevronUp, ChevronDown, Lock, Check, Copy } from 'lucide-react'

// כרטסת קופצת אחידה לכל מחלקות הניהול: חלונית במרכז המסך על רקע מטושטש.
// כל מחלקה מעבירה רק הגדרות (שדות, שלבים, מספרים, לשוניות ופעולות). עיצוב ומקלדת כאן, במקום אחד.
// מבנה (לפי מוקאפ v4): ראש עם חותמת סטטוס ופס שלבים · פס מספרים · פרטים גלויים בסעיפים · עמודת פעילות בצד.

export type RecordTone = 'new' | 'wait' | 'chk' | 'ok' | 'no'
export type RecordField = {
  label: string
  value?: string | null
  ltr?: boolean
  lock?: string
  copy?: boolean
  full?: boolean
  chain?: string[]
}
export type RecordSection = { title: string; fields: RecordField[]; wide?: boolean }
export type RecordTab = { key: string; label: string; count?: number; content: ReactNode }
export type RecordFact = { label: string; value: string; ltr?: boolean; hl?: boolean }
export type RecordSteps = { labels: string[]; current: number; rejected?: boolean; dates?: (string | undefined)[] }
export type RecordCheck = { label: string; ok: boolean; onAsk?: () => void }

const TONE: Record<RecordTone, { chip: string; color: string }> = {
  new: { chip: 'bg-[#F6EBD2] text-[#87600F]', color: '#A87A1C' },
  wait: { chip: 'bg-[#E7EBF3] text-[#34477A]', color: '#3F548C' },
  chk: { chip: 'bg-[#FBE6D6] text-[#9A4314]', color: '#B5571C' },
  ok: { chip: 'bg-[#E0EFE4] text-[#22663A]', color: '#2E7A47' },
  no: { chip: 'bg-[#F6E0DE] text-[#9A2F24]', color: '#A33A2E' },
}

const navBtn = 'grid h-[38px] w-[38px] place-items-center rounded-lg text-[#C9D0E2] hover:bg-[#22345E] hover:text-white'
const kbd = 'rounded border border-b-2 border-[#E6DFCF] bg-white px-1.5 text-[11px]'

function CopyBtn({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      aria-label={`העתקת ${text}`}
      title="העתקה"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) }).catch(() => {})
      }}
      className="grid h-7 w-7 flex-none place-items-center rounded-md text-[#6B6352] opacity-0 transition-opacity hover:bg-[#F4E9CF] hover:text-[#8A6316] focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
    >
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

function Field({ f }: { f: RecordField }) {
  const has = !!f.value
  return (
    <div className={`group relative min-w-0 border-b border-[#EFE9DC] py-3 ${f.full ? 'col-span-full' : ''}`}>
      <small className="flex items-center gap-1.5 text-xs font-light text-[#6B6352]">
        {f.label}
        {f.lock && <span className="inline-flex items-center gap-[3px] text-[10.5px] font-normal text-[#958C78]"><Lock size={11} />{f.lock}</span>}
      </small>
      <div className="mt-[3px] flex min-w-0 items-center gap-1 break-words text-base font-medium leading-snug text-[#1B2338] md:text-[17px]">
        {f.chain && f.chain.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1.5 text-sm">
            {f.chain.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <i className="text-xs not-italic text-[#958C78]">←</i>}
                <span className={`rounded-[5px] px-[11px] py-1 ${i === 0 ? 'bg-[#14213D] font-bold text-[#C0912F]' : i === f.chain!.length - 1 ? 'bg-[#F4E9CF] font-bold text-[#8A6316] outline outline-1 outline-[#E3C98A]' : 'bg-[#F1ECE0]'}`}>{c}</span>
              </span>
            ))}
          </span>
        ) : has ? (
          <>
            <span dir={f.ltr ? 'ltr' : undefined} className={`min-w-0 tabular-nums ${f.ltr ? 'text-right [unicode-bidi:isolate]' : ''}`}>{f.value}</span>
            {(f.copy || f.ltr) && <CopyBtn text={f.value!} />}
          </>
        ) : (
          <span className="text-[15px] font-light text-[#958C78]">—</span>
        )}
      </div>
    </div>
  )
}

export default function RecordModal(props: {
  title: string
  meta?: { label: string; value: string; ltr?: boolean }[]
  statusLabel: string
  statusTone: RecordTone
  stampDate?: string
  crumb?: string
  facts?: RecordFact[]
  readiness?: RecordCheck[]
  steps?: RecordSteps
  sections: RecordSection[]
  note?: { title: string; text: string }
  tabs?: RecordTab[]
  // לשונית ראשית נוספת בצד הפרטים (למשל כרטיסים); כשיש, מוצג פס לשוניות מעל הפרטים
  mainTab?: { label: string; content: ReactNode }
  // מצב סקירה אחת: בלי לשוניות. מסמך חי בצד, קובייה ראשית (כרטיס) ליד, ושאר הסעיפים בקוביות; below מוצג מתחת
  overview?: { doc: ReactNode; main: ReactNode; below?: ReactNode }
  actions?: ReactNode
  kind: string
  index: number
  total: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const { title, meta, statusLabel, statusTone, stampDate, crumb, facts, readiness, steps, sections, note, tabs, mainTab, overview, actions, kind, index, total, onIndex, onClose } = props
  const [tab, setTab] = useState(0)
  const [view, setView] = useState(0)
  const [prevIndex, setPrevIndex] = useState(index)
  if (prevIndex !== index) { setPrevIndex(index); setTab(0); setView(0) }

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
  const tone = TONE[statusTone]
  const done = readiness?.filter((c) => c.ok).length ?? 0
  const missing = (readiness?.length ?? 0) - done


  const renderSection = (sec: RecordSection, i: number, cls = '') => (
    <section key={sec.title} className={`rounded-xl border border-[#E6DFCF] bg-[#FFFDF8] px-5 pb-2 pt-1 shadow-[0_1px_2px_rgba(20,33,61,.05),0_8px_24px_rgba(20,33,61,.06)] ${cls || (sec.wide ? 'md:col-span-full' : '')}`}>
      <h3 className="flex items-baseline gap-2.5 border-b-[1.5px] border-[#14213D] pb-2.5 pt-3.5 text-[15px] font-bold text-[#14213D]">
        <em className="text-[22px] font-black not-italic leading-none tabular-nums text-[#C0912F]">{i + 1}</em>{sec.title}
      </h3>
      <div className={`grid grid-cols-1 gap-x-7 ${sec.wide ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
        {sec.fields.map((f) => <Field key={f.label} f={f} />)}
      </div>
    </section>
  )

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-[#0D1730]/45 backdrop-blur-[9px] md:p-5"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label={`כרטסת ${kind}`}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#FFFDF8] shadow-[0_50px_120px_rgba(13,23,48,.5),0_0_0_1px_rgba(13,23,48,.08)] md:h-[min(calc(100vh-40px),900px)] md:max-w-[1240px] md:rounded-[18px]">
        {/* 1. ראש: מי זה ואיפה הוא בתהליך */}
        <div className="relative flex-none bg-[#14213D] px-3 pt-1.5 text-white md:px-7 md:pt-3">
          <div className="flex items-center gap-1 text-xs text-[#8F9AB5]">
            <span className="hidden md:inline">{crumb ?? kind}</span>
            <span className="mr-auto px-2 tabular-nums md:mr-auto">{index + 1} מתוך {total}</span>
            <button onClick={() => onIndex((index - 1 + total) % total)} title="הקודם (↑)" aria-label="הקודם" className={navBtn}><ChevronUp size={18} /></button>
            <button onClick={() => onIndex((index + 1) % total)} title="הבא (↓)" aria-label="הבא" className={navBtn}><ChevronDown size={18} /></button>
            <button onClick={onClose} title="סגירה (Esc)" aria-label="סגירה" className={`${navBtn} mr-1.5 border border-[#2F4170]`}><X size={18} /></button>
          </div>

          <div className="mt-1 flex items-center gap-3 md:gap-[18px] md:pl-[150px]">
            <div className="relative grid h-[46px] w-[46px] flex-none place-items-center rounded-full border-[1.5px] border-[#C0912F] text-xl font-black text-[#C0912F] md:h-[62px] md:w-[62px] md:text-[27px]">
              <span aria-hidden className="absolute inset-[3px] rounded-full border border-dashed border-[#C0912F]/45" />
              {title.charAt(0)}
            </div>
            <div className="min-w-0">
              <h2 className="text-[23px] font-black leading-[1.05] tracking-[-.01em] md:text-[34px]">{title}</h2>
              {meta && meta.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-x-[18px] gap-y-0.5 text-[12.5px] text-[#B7BFD3] md:text-[13.5px]">
                  {meta.map((m, i) => (
                    <span key={i}><small className="ml-[5px] text-[11.5px] text-[#6F7A96]">{m.label}</small><span dir={m.ltr ? 'ltr' : undefined} className="tabular-nums [unicode-bidi:isolate]">{m.value}</span></span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border-[1.5px] bg-[#FFFDF8] px-2.5 py-0.5 md:absolute md:left-[34px] md:top-[46px] md:mt-0 md:grid md:h-[108px] md:w-[108px] md:-rotate-[11deg] md:place-items-center md:gap-0 md:rounded-full md:border-[2.5px] md:p-0 md:text-center md:shadow-[0_0_0_4px_#FFFDF8,0_0_0_5px_var(--c)]"
            style={{ color: tone.color, borderColor: tone.color, ['--c' as string]: tone.color }}
          >
            <span aria-hidden className="absolute inset-[7px] hidden rounded-full border border-dashed border-current opacity-60 md:block" />
            <div>
              <b className="block max-w-[80px] text-xs font-black leading-[1.1] md:text-sm">{statusLabel}</b>
              {stampDate && <small className="hidden text-[10px] font-medium tracking-[.08em] md:block">{stampDate}</small>}
            </div>
          </div>

          {steps && (
            <ol className="mt-3 flex pb-3.5 md:mt-4 md:pl-[150px]">
              {steps.labels.map((l, i) => {
                const cur = i === steps.current
                const isDone = i < steps.current
                const rej = !!steps.rejected && cur
                const last = i === steps.labels.length - 1
                const date = steps.dates?.[i]
                return (
                  <li key={i} className={`relative flex-1 pt-7 text-[10.5px] md:text-xs ${rej ? 'font-bold text-[#F1A39A]' : cur ? 'font-bold text-white' : isDone ? 'text-[#D9D4C6]' : 'text-[#7D89A8]'}`}>
                    <span aria-hidden className={`absolute top-2.5 h-0.5 ${last ? 'right-0 w-3' : 'inset-x-0'} ${isDone ? 'bg-[#C0912F]' : 'bg-[#2B3B62]'}`} />
                    <i className={`absolute right-0 top-0 z-[1] grid h-[22px] w-[22px] place-items-center rounded-full border-2 text-[10.5px] font-bold not-italic ${rej ? 'border-[#B04A3E] bg-[#B04A3E] text-white' : isDone ? 'border-[#C0912F] bg-[#C0912F] text-[#14213D]' : cur ? 'border-[#C0912F] bg-[#14213D] text-[#C0912F] shadow-[0_0_0_4px_rgba(192,145,47,.22)]' : 'border-[#34466F] bg-[#14213D]'}`}>
                      {isDone ? <Check size={12} strokeWidth={3} /> : rej ? '✕' : i + 1}
                    </i>
                    {rej ? 'נדחה' : l}
                    {date && i <= steps.current && <small className="mr-1.5 hidden text-[10.5px] text-[#5F6C8E] md:inline">{date}</small>}
                  </li>
                )
              })}
            </ol>
          )}
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-[#C0912F]" />
        </div>

        {/* 2+3. גוף: בנייד הכול בגלילה אחת, בדסקטופ פרטים וצד נגללים בנפרד */}
        <div className="flex min-h-0 flex-1 flex-col overflow-auto md:overflow-hidden">
          {(facts?.length || readiness?.length) ? (
            <div className="grid flex-none grid-cols-2 border-b border-[#E6DFCF] bg-[#FFFDF8] md:flex">
              {facts?.map((f, i) => (
                <div key={i} className={`min-w-0 flex-1 border-b border-[#EFE9DC] px-3.5 py-2.5 md:border-b-0 md:border-l md:px-6 md:pb-[13px] md:pt-3.5 md:last:border-l-0 ${f.hl ? 'bg-[#FFF8E6]' : ''}`}>
                  <small className="block text-xs text-[#6B6352]">{f.label}</small>
                  <b dir={f.ltr ? 'ltr' : undefined} className={`block truncate text-[22px] font-black leading-[1.15] tabular-nums md:text-[30px] ${f.hl ? 'text-[#8A6316]' : 'text-[#14213D]'} ${f.ltr ? 'text-right' : ''}`}>{f.value}</b>
                </div>
              ))}
              {readiness && readiness.length > 0 && (
                <div className="order-first col-span-2 bg-[#FBF6EA] px-3.5 py-2.5 md:order-none md:flex-[1.5] md:px-6 md:pb-[13px] md:pt-3.5">
                  <small className="block text-xs text-[#6B6352]">מוכנות לאישור</small>
                  <b className="block text-[22px] font-black leading-[1.15] tabular-nums text-[#8A6316] md:text-[30px]">
                    {done}/{readiness.length}
                    <span className="mr-1.5 text-[15px] font-light text-[#6B6352]">{missing === 0 ? 'אפשר לאשר' : `חסרים ${missing}`}</span>
                  </b>
                  <span className="mt-1.5 block h-[5px] overflow-hidden rounded-[3px] bg-[#EBDFC2]"><i className="block h-full bg-[#C0912F]" style={{ width: `${(done / readiness.length) * 100}%` }} /></span>
                </div>
              )}
            </div>
          ) : null}

          {overview ? (
            <div className="grid min-h-0 flex-1 content-start gap-3 bg-[#F7F3EA] p-3 md:gap-4 md:overflow-auto md:p-5">
              {readiness && readiness.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-[10px] border border-[#E8D4A2] border-r-4 border-r-[#C0912F] bg-[#FFF9EA] px-4 py-3">
                  <b className="whitespace-nowrap text-[13px] font-bold text-[#8A6316]">לפני אישור</b>
                  <ul className="flex flex-1 flex-wrap gap-1.5">
                    {readiness.map((c) => c.ok ? (
                      <li key={c.label} className="flex items-center gap-1.5 px-1.5 text-[13px] text-[#958C78]"><Check size={14} strokeWidth={2.6} className="text-[#2E7A47]" />{c.label}</li>
                    ) : (
                      <li key={c.label} className="flex min-h-8 items-center gap-1.5 rounded-2xl border border-[#E6DFCF] bg-white py-0 pl-1 pr-2.5 text-[13px]">
                        {c.label}
                        {c.onAsk && <button type="button" onClick={c.onAsk} className="min-h-[26px] rounded-[13px] bg-[#F4E9CF] px-2.5 text-xs font-medium text-[#8A6316] hover:bg-[#ECD9A8]">בקש</button>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-12 md:gap-4">
                <div className="min-w-0 md:col-span-4 md:row-span-2">{overview.doc}</div>
                {overview.main}
                {sections.slice(0, 2).map((sec, i) => renderSection(sec, i, 'md:col-span-4'))}
                {sections.slice(2).map((sec, i) => renderSection(sec, i + 2, 'md:col-span-full'))}
              </div>
              {note && note.text && (
                <div className="relative whitespace-pre-line rounded-[10px] border border-[#EFDCAE] bg-[#FFF8E6] px-4 py-3.5 text-[13.5px] leading-[1.6] text-[#5C4512]">
                  <span aria-hidden className="absolute -top-px right-5 h-[7px] w-[46px] rounded-b-[3px] bg-[#E8D29C]" />
                  <b>{note.title}:</b> {note.text}
                </div>
              )}
              {overview.below}
            </div>
          ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[1fr_390px] max-lg:md:grid-cols-[1fr_330px]">
            <div className="grid content-start gap-3 bg-[#F7F3EA] p-3 md:grid-cols-2 md:gap-4 md:overflow-auto md:px-6 md:pb-7 md:pt-5">
              {mainTab && (
                <div role="tablist" className="flex border-b border-[#E6DFCF] md:col-span-full">
                  {['פרטי התיק', mainTab.label].map((l, i) => (
                    <button key={l} role="tab" aria-selected={view === i} onClick={() => setView(i)}
                      className={`-mb-px min-h-[44px] px-5 text-sm border-b-[3px] ${view === i ? 'border-[#C0912F] font-bold text-[#14213D]' : 'border-transparent text-[#6B6352]'}`}>{l}</button>
                  ))}
                </div>
              )}
              {mainTab && view === 1 ? <div className="md:col-span-full">{mainTab.content}</div> : <>
              {readiness && readiness.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 rounded-[10px] border border-[#E8D4A2] border-r-4 border-r-[#C0912F] bg-[#FFF9EA] px-4 py-3 md:col-span-full">
                  <b className="whitespace-nowrap text-[13px] font-bold text-[#8A6316]">לפני אישור</b>
                  <ul className="flex flex-1 flex-wrap gap-1.5">
                    {readiness.map((c) => c.ok ? (
                      <li key={c.label} className="flex items-center gap-1.5 px-1.5 text-[13px] text-[#958C78]"><Check size={14} strokeWidth={2.6} className="text-[#2E7A47]" />{c.label}</li>
                    ) : (
                      <li key={c.label} className="flex min-h-8 items-center gap-1.5 rounded-2xl border border-[#E6DFCF] bg-white py-0 pl-1 pr-2.5 text-[13px]">
                        {c.label}
                        {c.onAsk && <button type="button" onClick={c.onAsk} className="min-h-[26px] rounded-[13px] bg-[#F4E9CF] px-2.5 text-xs font-medium text-[#8A6316] hover:bg-[#ECD9A8]">בקש</button>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {sections.map((sec, i) => renderSection(sec, i))}

              {note && note.text && (
                <div className="relative whitespace-pre-line rounded-[10px] border border-[#EFDCAE] bg-[#FFF8E6] px-4 py-3.5 text-[13.5px] leading-[1.6] text-[#5C4512] md:col-span-full">
                  <span aria-hidden className="absolute -top-px right-5 h-[7px] w-[46px] rounded-b-[3px] bg-[#E8D29C]" />
                  <b>{note.title}:</b> {note.text}
                </div>
              )}
              </>}
            </div>

            <aside className="flex min-h-[60vh] flex-col border-t border-[#E6DFCF] bg-[#FFFDF8] md:min-h-0 md:overflow-hidden md:border-r md:border-t-0">
              {tabs && tabs.length > 0 && (
                <>
                  <div className="sticky top-0 z-[1] flex flex-none border-b border-[#E6DFCF] bg-[#FFFDF8] px-1.5 pt-1.5 md:px-4">
                    {tabs.map((t, i) => (
                      <button key={t.key} onClick={() => setTab(i)}
                        className={`-mb-px flex min-h-[46px] flex-1 items-center justify-center gap-1.5 border-b-2 text-[13.5px] ${activeTab === t ? 'border-[#C0912F] font-bold text-[#14213D]' : 'border-transparent text-[#6B6352]'}`}>
                        {t.label}
                        {!!t.count && <b className={`rounded-lg px-1.5 text-[10.5px] ${activeTab === t ? 'bg-[#C0912F] text-[#14213D]' : 'bg-[#E9E1CF] text-[#6B6352]'}`}>{t.count}</b>}
                      </button>
                    ))}
                  </div>
                  <div className="min-h-0 flex-1 px-[18px] pb-5 pt-1 md:overflow-auto">{activeTab?.content}</div>
                </>
              )}
            </aside>
          </div>
          )}
        </div>

        <div className="flex min-h-[70px] flex-none flex-wrap items-center gap-2 border-t border-[#E6DFCF] bg-[#FFFDF8] px-3 py-3 max-md:sticky max-md:bottom-0 md:px-6">
          {actions}
          <small className="mr-auto hidden text-[11.5px] text-[#958C78] md:block">
            <kbd className={kbd}>↑</kbd> <kbd className={kbd}>↓</kbd> רשומה הבאה · <kbd className={kbd}>Esc</kbd> סגירה
          </small>
        </div>
      </div>
    </div>
  )
}

// כפתורי פעולה אחידים לתחתית הכרטסת
export const modalBtn = {
  primary: 'inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-[9px] bg-[#14213D] px-4 text-sm font-bold text-white hover:bg-[#22345E] max-md:flex-1 md:min-w-[220px]',
  ghost: 'inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-[9px] border border-[#D9CFB9] bg-[#FFFDF8] px-4 text-sm font-medium text-[#1B2338] hover:border-[#14213D] max-md:flex-1',
}
