'use client'
// ─────────────────────────────────────────────────────────────────────────────
// מעטפת אחידה לטפסי הבקשה בפורטל (יולדת + הלוואה) — "כיוון ג׳ · סיכום חי",
// לפי המוקאפ שאושר ב-22.11.2026 (portal-forms-c.html).
//
// פאנל כחול בצד ימין: פרטי המשפחה המחוברת + "מה יישלח" (מתמלא תוך כדי מילוי)
// + כפתור השליחה. לצידו הטופס, בכרטיסים ממוספרים עם סטטוס "חסר"/"הושלם".
// בנייד: הפאנל מצטמצם לכותרת, ובתחתית פס קבוע עם שם המשפחה + כפתור שליחה.
//
// ⚠️ הרכיב תצוגתי בלבד. כל הלוגיקה (אימות, העלאה, שליחה) נשארת בדף —
// הכפתור כאן הוא submit של הטופס העוטף, או onClick שהדף מעביר.
// ─────────────────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react'
import { ArrowRight, Check, Loader2, Upload, X, CheckCircle2 } from 'lucide-react'

export type FamilyInfo = {
  familyName: string
  husband?: string; husbandId?: string
  wife?: string; wifeId?: string
  phone?: string; email?: string; address?: string
}

export type SummaryRow = [label: string, value: string]

export function RequestShell({
  dept, title, intro, family, summary, submitLabel, loading, disabled,
  onSubmitClick, onBack, onEditDetails, children, footer,
}: {
  dept: string
  title: ReactNode
  intro?: ReactNode
  family: FamilyInfo
  summary: SummaryRow[]
  submitLabel: string
  loading?: boolean
  disabled?: boolean
  // בלי onSubmitClick הכפתור הוא submit של הטופס העוטף
  onSubmitClick?: () => void
  onBack: () => void
  onEditDetails?: () => void
  children: ReactNode
  // תוכן מתחת לכרטיסים (שגיאה, אזהרות, קישורים) — לפני פס השליחה בנייד
  footer?: ReactNode
}) {
  const submitBtn = (cls: string, label = submitLabel) => (
    <button type={onSubmitClick ? 'button' : 'submit'} onClick={onSubmitClick} disabled={loading || disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-bold transition active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}>
      {loading ? <Loader2 size={18} className="animate-spin" /> : null}
      {loading ? 'שולח...' : `${label} ←`}
    </button>
  )
  const famRows: [string, string | undefined, boolean?][] = [
    ['הבעל', family.husband], ['ת״ז', family.husbandId, true],
    ['האשה', family.wife], ['ת״ז', family.wifeId, true],
    ['טלפון', family.phone, true],
  ]
  return (
    <div dir="rtl" className="lg:grid lg:grid-cols-[minmax(320px,400px)_1fr] lg:gap-0 lg:rounded-2xl lg:overflow-hidden lg:border lg:border-[#e3dbcc] bg-[#f2efe8]">
      {/* ── הפאנל הכחול ── */}
      <aside className="bg-[#132a52] text-[#dfe4ee] px-4 py-4 lg:px-8 lg:py-8 lg:sticky lg:top-0 lg:self-start lg:min-h-[calc(100vh-120px)] flex flex-col bg-[radial-gradient(120%_60%_at_100%_0%,rgba(217,181,110,0.10),transparent_60%)]">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="איגוד הצאצאים" className="w-10 h-10 lg:w-14 lg:h-14 object-contain" />
          <div className="leading-tight">
            <div className="font-extrabold text-white">איגוד הצאצאים</div>
            <div className="text-xs text-[#9aa6bf]">של רבינו החתם סופר</div>
          </div>
        </div>

        <div className="hidden lg:block mt-8 rounded-2xl border border-[rgba(217,181,110,0.35)] bg-white/[0.04] px-5 py-4">
          <div className="flex items-baseline justify-between text-xs font-bold text-[#d9b56e]">
            <span>פרטי המשפחה</span>
            {onEditDetails && (
              <button type="button" onClick={onEditDetails} className="font-medium text-[#c9d2e4] underline underline-offset-[3px] hover:text-white">עדכון פרטים</button>
            )}
          </div>
          <div className="text-[27px] font-extrabold text-white mt-1 mb-3">{family.familyName}</div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 m-0">
            {famRows.filter(([, v]) => v).map(([l, v, ltr], i) => (
              <div key={i}>
                <dt className="text-xs text-[#8f9bb5]">{l}</dt>
                <dd className={`m-0 text-white font-semibold text-[15px] ${ltr ? 'tabular-nums' : ''}`} dir={ltr ? 'ltr' : undefined} style={ltr ? { textAlign: 'right' } : undefined}>{v}</dd>
              </div>
            ))}
            {family.email && (
              <div className="col-span-2">
                <dt className="text-xs text-[#8f9bb5]">מייל</dt>
                <dd className="m-0 text-white font-semibold text-[15px] break-all" dir="ltr" style={{ textAlign: 'right' }}>{family.email}</dd>
              </div>
            )}
            {family.address && (
              <div className="col-span-2">
                <dt className="text-xs text-[#8f9bb5]">כתובת</dt>
                <dd className="m-0 text-white font-semibold text-[15px]">{family.address}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="hidden lg:block mt-6">
          <div className="text-xs font-bold text-[#d9b56e] mb-2">מה יישלח</div>
          <dl className="m-0 border-t border-white/[0.14]">
            {summary.map(([l, v], i) => (
              <div key={i} className="flex justify-between gap-4 py-3 border-b border-white/[0.08] text-[15px]">
                <dt className="text-[#9aa6bf]">{l}</dt>
                <dd className={`m-0 text-left ${v ? 'text-white font-semibold' : 'text-[#6c7895]'}`}>{v || 'טרם מולא'}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="hidden lg:block mt-auto pt-8">
          {submitBtn('w-full min-h-[52px] px-6 text-[17px] bg-[#d9b56e] text-[#132a52] hover:bg-[#e6c788]')}
          <p className="text-xs text-[#8592ad] mt-3 text-center">אישור יישלח למייל הרשום אצלנו</p>
        </div>
      </aside>

      {/* ── הטופס ── */}
      <div className="min-w-0 px-4 pt-5 pb-28 lg:px-12 lg:pt-10 lg:pb-16">
        <button type="button" onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1e3d73] hover:text-[#132a52] mb-4">
          <ArrowRight size={16} /> חזרה לאזור האישי
        </button>
        <div className="text-[13px] font-bold tracking-wide text-[#a87a2f]">{dept}</div>
        <h1 className="text-[27px] lg:text-[34px] font-extrabold text-[#16213a] mt-1 mb-2 leading-tight">{title}</h1>
        {intro && <p className="text-[17px] text-[#465068] mb-6 lg:mb-8 max-w-[60ch]">{intro}</p>}
        <div className="flex flex-col gap-4">{children}</div>
        {footer && <div className="flex flex-col gap-3 mt-4">{footer}</div>}
        {/* כפתור שליחה גם בסוף הטופס במחשב בינוני (בלי הפאנל הרחב) */}
        <div className="hidden md:block lg:hidden mt-6">
          {submitBtn('w-full min-h-[52px] px-6 text-[17px] bg-[#132a52] text-white hover:bg-[#1e3d73]')}
        </div>
      </div>

      {/* ── פס תחתון בנייד ── */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 px-4 py-3 bg-[#132a52] text-white">
        <div className="min-w-0">
          <div className="font-extrabold truncate">{family.familyName}</div>
          {family.phone && <div className="text-xs text-[#9aa6bf] tabular-nums" dir="ltr" style={{ textAlign: 'right' }}>{family.phone}</div>}
        </div>
        {submitBtn('ms-auto min-h-[46px] px-5 text-[15px] bg-[#d9b56e] text-[#132a52]', 'שליחה')}
      </div>
    </div>
  )
}

// כרטיס ממוספר בטופס, עם סטטוס חסר/הושלם
export function RequestSection({ n, title, done, children }: { n: number; title: ReactNode; done: boolean; children: ReactNode }) {
  return (
    <section className="bg-[#fffdf8] border border-[#e3dbcc] rounded-[14px]">
      <div className="flex items-center gap-3 px-4 py-3 lg:px-6 lg:py-4 border-b border-[#e3dbcc]">
        <span className={`w-7 h-7 rounded-full grid place-items-center text-[13px] font-bold border transition ${done ? 'bg-[#2c6a4e] border-[#2c6a4e] text-white' : 'border-[#cbbfa8] text-[#465068]'}`}>
          {done ? <Check size={15} strokeWidth={3} /> : n}
        </span>
        <h2 className="m-0 text-[17px] font-bold text-[#16213a]">{title}</h2>
        <span className={`ms-auto text-xs font-semibold px-2.5 py-0.5 rounded-full ${done ? 'bg-[#e3efe8] text-[#2c6a4e]' : 'bg-[#fbf0d9] text-[#7d5310]'}`}>
          {done ? 'הושלם' : 'חסר'}
        </span>
      </div>
      <div className="p-4 lg:p-6">{children}</div>
    </section>
  )
}

// משבצת העלאה אחידה — "לחצו להעלאה"
export function UploadBox({ file, onFile, onClear, accept, hint }: {
  file: File | null; onFile: (f: File | null) => void; onClear: () => void; accept: string; hint?: string
}) {
  if (file) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 border border-[#2c6a4e] bg-[#e3efe8] rounded-md">
        <span className="w-9 h-9 rounded-full bg-[#2c6a4e] text-white grid place-items-center flex-none"><CheckCircle2 size={18} /></span>
        <span className="min-w-0 flex-1">
          <b className="block font-semibold truncate text-[#16213a]">{file.name}</b>
          <small className="text-[13px] text-[#465068]">הקובץ צורף</small>
        </span>
        <button type="button" onClick={onClear} aria-label="הסרת הקובץ" className="text-[#9b2c2c] hover:bg-white/60 rounded p-1.5"><X size={16} /></button>
      </div>
    )
  }
  return (
    <label className="flex items-center gap-3 px-4 py-3 border border-dashed border-[#cbbfa8] bg-white rounded-md cursor-pointer hover:border-[#1e3d73] transition">
      <span className="w-9 h-9 rounded-full bg-[#e9edf5] text-[#132a52] grid place-items-center flex-none"><Upload size={17} /></span>
      <span className="min-w-0">
        <b className="block font-semibold text-[#16213a]">לחצו להעלאה</b>
        {hint && <small className="text-[13px] text-[#6f6a5e]">{hint}</small>}
      </span>
      <input type="file" accept={accept} className="hidden" onChange={e => { onFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
    </label>
  )
}

// חלונית התראה באמצע המסך עם טשטוש
export function CenterAlert({ open, title, text, onClose }: { open: boolean; title: string; text: string; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[110] grid place-items-center p-4 bg-[rgba(19,26,42,0.32)] backdrop-blur-[8px]" dir="rtl" onClick={onClose}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="center-alert-title"
        className="w-full max-w-[460px] bg-[#fffdf8] rounded-[14px] p-8 text-center shadow-[0_30px_60px_-20px_rgba(19,26,42,0.45)]"
        onClick={e => e.stopPropagation()}>
        <div className="w-14 h-14 rounded-full bg-[#fbf0d9] text-[#7d5310] border border-[#ecd6a6] grid place-items-center mx-auto mb-4 text-2xl font-black">!</div>
        <h3 id="center-alert-title" className="m-0 mb-2 text-[27px] font-extrabold text-[#7d5310]">{title}</h3>
        <p className="m-0 mb-6 text-[#465068]">{text}</p>
        <button type="button" autoFocus onClick={onClose}
          className="w-full min-h-[52px] rounded-md bg-[#132a52] hover:bg-[#1e3d73] text-white font-bold text-[17px]">הבנתי</button>
      </div>
    </div>
  )
}

// אפשרויות בחירה כאריחים עם תיבת סימון ברורה (checkbox/radio)
export function ChoiceTile({ checked, onClick, label, desc, radio }: { checked: boolean; onClick: () => void; label: string; desc?: string; radio?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={checked}
      className={`flex items-center gap-3 min-h-[64px] px-4 py-3.5 rounded-md border text-right transition ${
        checked ? 'border-[#132a52] bg-[#e9edf5] shadow-[inset_0_0_0_1px_#132a52]' : 'border-[#cbbfa8] bg-white hover:border-[#1e3d73]'
      }`}>
      <span className={`flex-none w-[26px] h-[26px] border-2 grid place-items-center transition ${radio ? 'rounded-full' : 'rounded-md'} ${
        checked ? 'bg-[#132a52] border-[#132a52]' : 'bg-white border-[#b3a88f]'
      }`}>
        {radio
          ? <span className={`w-2.5 h-2.5 rounded-full bg-white transition ${checked ? 'opacity-100' : 'opacity-0'}`} />
          : <Check size={16} strokeWidth={3.2} className={`text-white transition ${checked ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`} />}
      </span>
      <span>
        <b className={`block font-semibold ${checked ? 'text-[#132a52]' : 'text-[#16213a]'}`}>{label}</b>
        {desc && <small className="block text-[13px] text-[#6f6a5e] mt-0.5">{desc}</small>}
      </span>
    </button>
  )
}
