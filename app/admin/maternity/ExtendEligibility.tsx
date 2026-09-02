'use client'

// ─────────────────────────────────────────────────────────────────────────────
// הארכת זכאות יולדת.
//
// 🔴 שני שירותים נפרדים: כרטיס המזון (6 שבועות) ובית ההחלמה (5 שבועות).
// עד כה הארכה חלה תמיד על שניהם, כי שניהם נגזרו מ-six_weeks_end. בפועל
// יש מקרים שמצדיקים רק אחד מהם — ולכן המסך שואל מה מאריכים.
//
// הזרימה: היקף → תאריך אחד או נפרד → לוח שנה → "סיימתי" → אישור מפורט.
//
// ⚠️ האישור מפרט מה בוצע ולא אומר "נשמר": הפעולה משנה זכאות של משפחה,
// והמזכירה צריכה לראות שחור על גבי לבן מה השתנה ומה לא.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  CalendarClock, Loader2, Check, AlertTriangle, RotateCcw, Info,
  CreditCard, Home, ArrowRight,
} from 'lucide-react'
import { format, addWeeks } from 'date-fns'
import { he } from 'date-fns/locale'
import Modal from '@/components/ui/Modal'
import HebrewDatePicker from '@/components/ui/HebrewDatePicker'
import { toHebrewDate } from '@/lib/hebrewDate'
import { useCan } from '@/components/StaffPermissions'
import type { MaternityAid } from '@/types'

const fmt = (d?: string | null) => (d ? format(new Date(d), 'dd/MM/yyyy', { locale: he }) : '—')
const toIso = (d: Date) => d.toISOString().split('T')[0]

type Scope = 'card' | 'recovery' | 'both'

interface ExtendResult {
  action: 'extend' | 'reset'
  scope?: Scope
  cardFrom?: string | null
  cardTo?: string | null
  cardChanged?: boolean
  recoveryFrom?: string | null
  recoveryTo?: string | null
  recoveryChanged?: boolean
  cardEnd?: string | null
  recoveryEnd?: string | null
}

type AidLike = Pick<MaternityAid,
  'id' | 'birth_date' | 'six_weeks_end' | 'eligibility_extended' | 'eligibility_extension_reason'
> & { recovery_end_override?: string | null }

export default function ExtendEligibility({
  aid, variant = 'button', onDone,
}: {
  aid: AidLike
  variant?: 'button' | 'icon'
  onDone?: () => void
}) {
  const canEdit = useCan('maternity', 'edit')
  const router = useRouter()

  const defaultEnd = aid.birth_date ? toIso(addWeeks(new Date(aid.birth_date), 6)) : ''
  const currentCardEnd = aid.six_weeks_end || defaultEnd
  // בית ההחלמה: הדריסה אם קיימת, אחרת נגזר מהכרטיס — כמו recoveryWindowEnd.
  const currentRecoveryEnd = aid.recovery_end_override || currentCardEnd
  const extended = !!aid.eligibility_extended

  const [open, setOpen] = useState(false)
  // 🔴 שלב אחד בכל פעם: היקף → תאריכים → אישור. מסך אחד עמוס בכל
  // האפשרויות היה מזמין בחירה לא מכוונת בפעולה שמשנה זכאות.
  const [step, setStep] = useState<'scope' | 'dates' | 'done'>('scope')
  const [scope, setScope] = useState<Scope>('both')
  const [separate, setSeparate] = useState(false)
  const [cardDate, setCardDate] = useState('')
  const [recoveryDate, setRecoveryDate] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState<'extend' | 'reset' | null>(null)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<ExtendResult | null>(null)

  const openModal = () => {
    setStep('scope')
    setScope('both')
    setSeparate(false)
    setCardDate(currentCardEnd)
    setRecoveryDate(currentRecoveryEnd)
    setReason(aid.eligibility_extension_reason ?? '')
    setResult(null)
    setErr('')
    setOpen(true)
  }

  const submit = async (action: 'extend' | 'reset') => {
    setErr(''); setSaving(action)
    try {
      const res = await fetch('/api/admin/maternity/extend-eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'reset'
          ? { aidId: aid.id, action: 'reset' }
          : {
            aidId: aid.id, action: 'extend', scope, reason,
            // ⚠️ endDate הוא התאריך של מה שנבחר: בהיקף 'recovery' הוא
            // תאריך בית ההחלמה, אחרת של הכרטיס.
            endDate: scope === 'recovery' ? recoveryDate : cardDate,
            recoveryEndDate: scope === 'both' && separate ? recoveryDate : undefined,
          }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) { setErr(data.error || 'הפעולה נכשלה'); setSaving(null); return }
      setResult(data.result ?? null)
      setStep('done')
      // ⚠️ הרענון מיד, כדי שהמסך שמאחורי החלונית כבר יציג את המצב החדש
      // כשהמזכירה סוגרת אותה.
      if (onDone) onDone(); else router.refresh()
    } catch {
      setErr('שגיאת רשת — נסה שוב')
    } finally {
      setSaving(null)
    }
  }

  const activeDate = scope === 'recovery' ? recoveryDate : cardDate
  const canFinish = scope === 'both' && separate
    ? !!cardDate && !!recoveryDate
    : !!activeDate

  const SCOPES: { key: Scope; label: string; hint: string; Icon: typeof CreditCard }[] = [
    { key: 'card', label: 'כרטיס המזון', hint: 'תוקף הכרטיס והפריקה האוטומטית', Icon: CreditCard },
    { key: 'recovery', label: 'בית החלמה', hint: 'הזכאות לשהות ולהחזר', Icon: Home },
    { key: 'both', label: 'שניהם', hint: 'כרטיס המזון וגם בית החלמה', Icon: Check },
  ]

  return (
    <>
      {canEdit && (
        <button
          onClick={openModal}
          title="הארכת זכאות"
          className={variant === 'icon'
            ? 'inline-flex items-center gap-1 text-xs font-medium text-indigo-700 border border-indigo-200 hover:bg-indigo-50 rounded-lg px-2.5 py-1.5 transition-colors'
            : 'flex items-center gap-1.5 text-sm text-indigo-700 border border-indigo-200 hover:bg-indigo-50 rounded-lg px-3 py-1.5 transition-colors'}
        >
          <CalendarClock size={variant === 'icon' ? 13 : 14} /> הארכת זכאות
        </button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={step === 'done' ? 'הזכאות עודכנה' : 'הארכת זכאות יולדת'}
        size="md"
      >
        {/* ─── שלב 3: מה בוצע ─── */}
        {step === 'done' && result ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2 py-2 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <Check size={24} className="text-emerald-600" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                {result.action === 'reset' ? 'הזכאות הוחזרה לברירת המחדל' : 'ההארכה בוצעה'}
              </p>
            </div>

            {/* פירוט — מה השתנה ומה לא */}
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              <ResultRow
                Icon={CreditCard} label="כרטיס המזון"
                from={result.action === 'reset' ? undefined : result.cardFrom}
                to={result.action === 'reset' ? result.cardEnd : result.cardTo}
                changed={result.action === 'reset' ? true : !!result.cardChanged}
              />
              <ResultRow
                Icon={Home} label="בית החלמה"
                from={result.action === 'reset' ? undefined : result.recoveryFrom}
                to={result.action === 'reset' ? result.recoveryEnd : result.recoveryTo}
                changed={result.action === 'reset' ? true : !!result.recoveryChanged}
              />
            </div>

            <p className="text-[11px] leading-relaxed text-slate-500">
              התאריכים חלים על כל הערוצים — פריקת הכרטיס האוטומטית, פורטל בתי ההחלמה
              ושלוחת הטלפון.
            </p>

            <button
              onClick={() => setOpen(false)}
              className="w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-900"
            >
              סגירה
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* המצב הנוכחי — תמיד גלוי */}
            <div className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm">
              <CurrentRow label="ברירת מחדל (6 שבועות)" value={defaultEnd} muted />
              <CurrentRow label="כרטיס המזון — סיום נוכחי" value={currentCardEnd} highlight={extended} />
              <CurrentRow label="בית החלמה — סיום נוכחי" value={currentRecoveryEnd} highlight={extended} />
            </div>

            {/* ─── שלב 1: מה מאריכים ─── */}
            {step === 'scope' && (
              <>
                <p className="text-sm font-semibold text-slate-700">מה להאריך?</p>
                <div className="grid gap-2">
                  {SCOPES.map(s => (
                    <button
                      key={s.key}
                      onClick={() => setScope(s.key)}
                      className={`flex items-center gap-3 rounded-xl border-2 p-3 text-right transition-colors ${
                        scope === s.key
                          ? 'border-indigo-400 bg-indigo-50'
                          : 'border-slate-200 hover:border-indigo-200'
                      }`}
                    >
                      <s.Icon size={18} className={scope === s.key ? 'text-indigo-600' : 'text-slate-400'} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm font-bold ${scope === s.key ? 'text-indigo-900' : 'text-slate-700'}`}>
                          {s.label}
                        </span>
                        <span className="block text-[11px] text-slate-500">{s.hint}</span>
                      </span>
                      {scope === s.key && <Check size={16} className="text-indigo-600" />}
                    </button>
                  ))}
                </div>

                {/* ⚠️ שאלת התאריך הנפרד עולה רק כשנבחרו שניהם — אחרת אין
                    לה משמעות והיא רק מסיחה. */}
                {scope === 'both' && (
                  <div className="rounded-xl border border-slate-200 p-3">
                    <p className="mb-2 text-xs font-bold text-slate-600">תאריך הסיום</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <ChoiceChip active={!separate} onClick={() => setSeparate(false)}
                        label="תאריך אחד לשניהם" />
                      <ChoiceChip active={separate} onClick={() => setSeparate(true)}
                        label="תאריך נפרד לכל אחד" />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  {extended ? (
                    <button
                      onClick={() => submit('reset')}
                      disabled={saving !== null}
                      className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                    >
                      {saving === 'reset' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                      החזרה ל-6 שבועות
                    </button>
                  ) : <span />}
                  <button
                    onClick={() => setStep('dates')}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                  >
                    המשך <ArrowRight size={15} />
                  </button>
                </div>
              </>
            )}

            {/* ─── שלב 2: התאריכים ─── */}
            {step === 'dates' && (
              <>
                {(scope === 'card' || (scope === 'both' && !separate)) && (
                  <DateField
                    label={scope === 'both' ? 'תאריך סיום לשני השירותים' : 'תאריך סיום — כרטיס המזון'}
                    value={cardDate} onChange={setCardDate} defaultEnd={defaultEnd}
                  />
                )}
                {scope === 'both' && separate && (
                  <>
                    <DateField label="תאריך סיום — כרטיס המזון" value={cardDate}
                      onChange={setCardDate} defaultEnd={defaultEnd} Icon={CreditCard} />
                    <DateField label="תאריך סיום — בית החלמה" value={recoveryDate}
                      onChange={setRecoveryDate} defaultEnd={defaultEnd} Icon={Home} />
                  </>
                )}
                {scope === 'recovery' && (
                  <DateField label="תאריך סיום — בית החלמה" value={recoveryDate}
                    onChange={setRecoveryDate} defaultEnd={defaultEnd} Icon={Home} />
                )}

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-slate-600">
                    סיבת ההארכה <span className="font-normal text-slate-400">(לא חובה)</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={2}
                    placeholder="לדוגמה: אשפוז ממושך, מקרה חריג שאושר…"
                    className="resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {err && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <AlertTriangle size={14} /> {err}
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    onClick={() => setStep('scope')}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    חזרה
                  </button>
                  <button
                    onClick={() => submit('extend')}
                    disabled={saving !== null || !canFinish}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-6 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:bg-indigo-300"
                  >
                    {saving === 'extend' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    סיימתי
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </>
  )
}

// ─── רכיבי עזר ────────────────────────────────────────────────────────────────

function CurrentRow({ label, value, muted, highlight }: {
  label: string; value: string; muted?: boolean; highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-500">{label}:</span>
      <span className={`text-left ${muted ? 'font-medium text-slate-600' : highlight ? 'font-semibold text-indigo-700' : 'font-semibold text-slate-800'}`}>
        <span className="ltr-num">{fmt(value)}</span>
        {toHebrewDate(value) && (
          <span className="block text-[11px] font-normal text-slate-400">{toHebrewDate(value)}</span>
        )}
      </span>
    </div>
  )
}

function ChoiceChip({ active, onClick, label }: {
  active: boolean; onClick: () => void; label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border-2 px-3 py-2 text-xs font-bold transition-colors ${
        active ? 'border-indigo-400 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600 hover:border-indigo-200'
      }`}
    >
      {label}
    </button>
  )
}

function DateField({ label, value, onChange, defaultEnd, Icon }: {
  label: string; value: string; onChange: (v: string) => void
  defaultEnd: string; Icon?: typeof CreditCard
}) {
  const earlier = !!value && !!defaultEnd && value < defaultEnd
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
        {Icon && <Icon size={13} className="text-slate-400" />} {label}
      </label>
      <HebrewDatePicker value={value} onChange={onChange} maxToday={false} />
      {earlier && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700">
          <Info size={13} /> התאריך מוקדם מברירת המחדל (קיצור הזכאות).
        </p>
      )}
    </div>
  )
}

function ResultRow({ Icon, label, from, to, changed }: {
  Icon: typeof CreditCard; label: string
  from?: string | null; to?: string | null; changed: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <span className="flex items-center gap-2 text-sm text-slate-700">
        <Icon size={15} className={changed ? 'text-emerald-600' : 'text-slate-300'} />
        {label}
      </span>
      {changed ? (
        <span className="text-left text-sm">
          {from && from !== to && (
            <span className="ltr-num text-[11px] text-slate-400 line-through">{fmt(from)}</span>
          )}
          <span className="ltr-num mr-1.5 font-bold text-emerald-700">{fmt(to)}</span>
        </span>
      ) : (
        // ⚠️ "ללא שינוי" מפורש: היעדר שורה היה נקרא כאילו השירות בוטל.
        <span className="text-xs font-medium text-slate-400">ללא שינוי</span>
      )}
    </div>
  )
}
