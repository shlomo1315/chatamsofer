import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

// רכיבי תצוגה משותפים לאגף הגיליונות: כרטיס, כותרת, תג, הודעה וכפתורים.
// צבע המותג אחד (כחול-נייבי), וכל השאר ניטרלי, כדי שהפעולה העיקרית תבלוט.

export const NAVY = '#1B3256'
export const input = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-[0_1px_0_rgba(15,23,42,0.03)] placeholder:text-slate-400 transition-colors hover:border-slate-300 focus:border-[#1B3256] focus:outline-none focus:ring-4 focus:ring-[#1B3256]/10'
const btn = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-[background-color,box-shadow,color] duration-150 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#1B3256]/20 disabled:cursor-not-allowed disabled:opacity-50'
export const btnPrimary = `${btn} bg-[#1B3256] text-white shadow-sm shadow-[#1B3256]/20 hover:bg-[#142844]`
export const btnGhost = `${btn} border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50`
export const btnDanger = `${btn} border border-rose-200 bg-white text-rose-700 hover:bg-rose-50`
export const link = 'font-medium text-[#1B3256] underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none'

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return <section {...rest} className={`rounded-2xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.06] ${className}`}>{children}</section>
}

/** כותרת של כרטיס: אייקון בעיגול, כותרת, שורת הסבר, ופעולות בצד השני. */
export function CardHeader({ icon, title, hint, children }: { icon?: ReactNode; title: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {icon && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1B3256]/[0.07] text-[#1B3256]">{icon}</div>}
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          {hint && <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{hint}</p>}
        </div>
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-2">{children}</div>}
    </div>
  )
}

const TONES = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-500/10',
  navy: 'bg-[#1B3256]/[0.07] text-[#1B3256] ring-[#1B3256]/10',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-600/15',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  sky: 'bg-sky-50 text-sky-800 ring-sky-600/15',
  rose: 'bg-rose-50 text-rose-800 ring-rose-600/15',
} as const
export type Tone = keyof typeof TONES

export function Badge({ tone = 'neutral', dot, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}

/** הודעת הצלחה או שגיאה אחרי פעולה. */
export function Notice({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null
  const Icon = msg.ok ? CheckCircle2 : AlertCircle
  return (
    <p role={msg.ok ? 'status' : 'alert'} className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm leading-relaxed ring-1 ring-inset ${msg.ok ? 'bg-emerald-50 text-emerald-900 ring-emerald-600/15' : 'bg-rose-50 text-rose-900 ring-rose-600/15'}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{msg.text}
    </p>
  )
}

/** מספר גדול עם תווית, לשורות הנתונים. */
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'green' | 'rose' }) {
  return (
    <div className="rounded-xl bg-slate-50/80 px-4 py-3 ring-1 ring-inset ring-slate-900/[0.04]">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className={`mt-1 text-xl font-bold tabular-nums ${tone === 'green' ? 'text-emerald-700' : tone === 'rose' ? 'text-rose-700' : 'text-slate-900'}`}>{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-slate-500">{sub}</dd>}
    </div>
  )
}

/** פס התקדמות דק לאחוזי פתיחה והורדה. */
export function Meter({ value, of }: { value: number; of: number }) {
  const p = of ? Math.min(100, Math.round((value / of) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-xs tabular-nums text-slate-900">{p}%</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <span className="block h-full rounded-full bg-[#1B3256]" style={{ width: `${p}%` }} />
      </span>
    </div>
  )
}

/** מספר שלב בעיגול, להנחיות "1, 2, 3". */
export function StepNum({ n, done }: { n: number; done?: boolean }) {
  return (
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${done ? 'bg-emerald-600 text-white' : 'bg-[#1B3256] text-white'}`}>
      {done ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : n}
    </span>
  )
}
