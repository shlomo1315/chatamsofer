'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, Pencil, Phone, Mail, Calendar, MapPin } from 'lucide-react'
import type { BookFairOrder, BookFairRecording } from '@/types/bookFair'
import { BOOK_FAIR_DELIVERY_LABELS } from '@/types/bookFair'
import { ilDateTime } from '@/lib/israelTime'
import { useCan } from '@/components/StaffPermissions'
import AudioFromData from '@/components/ui/AudioFromData'

// ─────────────────────────────────────────────────────────────────────────────
// כרטיס "פרטי הלקוח" בהזמנה — שם, כתובת, הקלטות ותמלולים במקום אחד
// (מוקאפ שאושר 05.10).
//
// 🔴 עד היום אותו מידע ישב בשלושה כרטיסים: פרטים סטטיים כאן, "הקלטות
// השיחה" ו"אימות כתובת" בטור הצדדי — והצוות קפץ ביניהם. בכל שדה עכשיו:
// הקלטה, תמלול, ושני כפתורים — "המלל תקין" (נשמר כמות שהוא) ו"עריכה".
//
// ⚠️ כתובת שנשמרת כאן מסומנת "אומתה": מי שלחץ ראה את הטקסט והחליט.
// ─────────────────────────────────────────────────────────────────────────────

type FieldKey = 'name' | 'address'

export default function CustomerCard({ order, recordings, cities }: {
  order: BookFairOrder
  recordings: BookFairRecording[]
  cities: { id: string; name: string }[]
}) {
  const router = useRouter()
  const canEdit = useCan('book_fair', 'edit')
  const [editing, setEditing] = useState<FieldKey | null>(null)
  const [text, setText] = useState('')
  const [cityId, setCityId] = useState(order.city_id ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const shipping = order.delivery_method === 'shipping'
  // איסוף עצמי ששולם ולא נאסף — ניתן להעביר למשלוח (ראו למטה).
  const pickupOpen = order.delivery_method === 'pickup' && order.channel !== 'fair' &&
    !order.picked_up_at && ['paid', 'picking', 'packed'].includes(order.status)
  const nameRec = recordings.find(r => r.kind === 'name')
  const addrRec = recordings.find(r => r.kind === 'address')
  // ⚠️ הקלטה מסוג לא מוכר לעולם אינה מוסתרת בשקט — כך נעלמה פעם הקלטת השם.
  const otherRecs = recordings.filter(r => r.kind !== 'name' && r.kind !== 'address')
  const cityName = cities.find(c => c.id === order.city_id)?.name ?? null

  const nameDone = !!order.customer_name
  const addrDone = !shipping || order.address_confirmed
  const total = shipping ? 2 : 1
  const done = (nameDone ? 1 : 0) + (shipping && addrDone ? 1 : 0)

  async function save(body: Record<string, unknown>, tag: string): Promise<boolean> {
    setBusy(tag); setError('')
    try {
      const res = await fetch(`/api/admin/book-fair/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'השמירה נכשלה'); return false }
      setEditing(null)
      router.refresh()
      return true
    } catch {
      setError('השמירה נכשלה — בדקו את החיבור')
      return false
    } finally {
      setBusy(null)
    }
  }

  function startEdit(key: FieldKey) {
    setError('')
    setText(key === 'name'
      ? (order.customer_name || nameRec?.transcript || '')
      : (order.address_text || addrRec?.transcript || ''))
    setCityId(order.city_id ?? '')
    setEditing(key)
  }

  const recUrl = (rec: BookFairRecording) => `/api/admin/book-fair/orders/${order.id}/recording?rec=${rec.id}`

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h2 className="font-semibold text-slate-900">פרטי הלקוח</h2>
        <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          done === total ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
          {done} מתוך {total} אומתו
        </span>
      </header>

      {/* ── שם מלא ── */}
      <Field
        label="שם מלא"
        chip={editing === 'name' ? 'edit' : nameDone ? 'ok' : 'warn'}
        chipText={editing === 'name' ? 'בעריכה' : nameDone ? 'נשמר' : 'טרם נשמר'}
      >
        {nameRec && <AudioFromData url={recUrl(nameRec)} />}
        {editing === 'name' ? (
          <Editor
            text={text} setText={setText} rows={1} placeholder="שם מלא"
            busy={busy === 'name'} disabled={!!busy || text.trim().length < 2}
            onSave={() => save({ customer_name: text }, 'name')}
            onCancel={() => setEditing(null)}
          />
        ) : nameDone ? (
          <SavedRow value={order.customer_name!} canEdit={canEdit} onEdit={() => startEdit('name')} />
        ) : (
          <Pending
            transcript={nameRec?.transcript ?? ''}
            hasRec={!!nameRec}
            canEdit={canEdit}
            busy={busy === 'name-ok'}
            typeLabel="הקלדת השם"
            onOk={() => save({ customer_name: nameRec?.transcript ?? '' }, 'name-ok')}
            onEdit={() => startEdit('name')}
            minLen={2}
            disabled={!!busy}
          />
        )}
      </Field>

      {/* ── כתובת למשלוח ── */}
      {shipping && (
        <Field
          label="כתובת למשלוח"
          chip={editing === 'address' ? 'edit' : addrDone ? 'ok' : 'warn'}
          chipText={editing === 'address' ? 'בעריכה' : addrDone ? 'מאומתת' : 'ממתינה לאימות'}
        >
          {editing !== 'address' && (
            <p className="text-sm text-slate-500">עיר: <b className="font-semibold text-slate-800">{cityName ?? 'לא נבחרה'}</b></p>
          )}
          {addrRec && <AudioFromData url={recUrl(addrRec)} />}
          {editing === 'address' ? (
            <div className="flex flex-col gap-2">
              <select
                value={cityId} onChange={e => setCityId(e.target.value)}
                aria-label="עיר"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">בחרו עיר</option>
                {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Editor
                text={text} setText={setText} rows={2} placeholder="רחוב, מספר בית ודירה"
                busy={busy === 'address'} disabled={!!busy || text.trim().length < 5 || !cityId}
                onSave={() => save({ address_text: text, city_id: cityId, address_confirmed: true }, 'address')}
                onCancel={() => setEditing(null)}
              />
            </div>
          ) : addrDone ? (
            <SavedRow value={order.address_text || '—'} canEdit={canEdit} onEdit={() => startEdit('address')} />
          ) : (
            <Pending
              // ⚠️ בהזמנה טלפונית address_text כבר מכיל את התמלול; ההקלטה היא המקור.
              transcript={addrRec?.transcript || order.address_text || ''}
              hasRec={!!addrRec}
              canEdit={canEdit}
              busy={busy === 'address-ok'}
              typeLabel="הקלדת הכתובת"
              // ⚠️ "המלל תקין" רק כשיש עיר — אחרת חייבים לבחור אותה בעריכה.
              onOk={order.city_id
                ? () => save({ address_text: addrRec?.transcript || order.address_text || '', address_confirmed: true }, 'address-ok')
                : null}
              onEdit={() => startEdit('address')}
              minLen={5}
              disabled={!!busy}
            />
          )}
        </Field>
      )}

      {/* ── איסוף עצמי שלא נאסף → העברה למשלוח (בקשת המשתמש 08.10) ──
          🔴 היריד נסגר לעונה: ללקוח אין מאיפה לאסוף, ובהזמנת איסוף לא היה
          שדה כתובת בכלל. ⚠️ לא בדוכן — שם הספרים נמסרו ביד. */}
      {!shipping && pickupOpen && (
        <Field
          label="איסוף עצמי — טרם נאסף"
          chip={editing === 'address' ? 'edit' : 'warn'}
          chipText={editing === 'address' ? 'העברה למשלוח' : 'לא נאסף'}
        >
          {editing === 'address' ? (
            <div className="flex flex-col gap-2">
              <select
                value={cityId} onChange={e => setCityId(e.target.value)}
                aria-label="עיר"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">בחרו עיר</option>
                {cities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <Editor
                text={text} setText={setText} rows={2} placeholder="רחוב, מספר בית ודירה"
                busy={busy === 'address'} disabled={!!busy || text.trim().length < 5 || !cityId}
                onSave={() => save({ delivery_method: 'shipping', address_text: text, city_id: cityId, address_confirmed: true }, 'address')}
                onCancel={() => setEditing(null)}
              />
              <p className="text-xs text-slate-500">דמי המשלוח לא ייגבו — ההזמנה כבר שולמה.</p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-600">ההזמנה בוצעה לאיסוף עצמי מהדוכן ועדיין לא נאספה.</p>
              {canEdit && (
                <button
                  onClick={() => startEdit('address')}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  <MapPin size={15} /> העברה למשלוח
                </button>
              )}
            </div>
          )}
        </Field>
      )}

      {/* ── הקלטות נוספות (פנייה וכו') ── */}
      {otherRecs.map(rec => (
        <Field key={rec.id} label="הקלטה נוספת" chip={null} chipText="">
          <AudioFromData url={recUrl(rec)} />
          {rec.transcript && <p className="text-sm text-slate-700">{rec.transcript}</p>}
        </Field>
      ))}

      {error && (
        <p className="mx-5 mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* ── פרטי קשר ומסירה ── */}
      <dl className="grid grid-cols-1 gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-4 text-sm sm:grid-cols-2">
        <Info icon={Phone} label="טלפון">
          {order.customer_phone
            ? <a href={`tel:${order.customer_phone}`} dir="ltr" className="font-mono text-indigo-700 hover:underline">{order.customer_phone}</a>
            : '—'}
        </Info>
        <Info icon={Mail} label="אימייל">
          {order.customer_email
            ? <a href={`mailto:${order.customer_email}`} dir="ltr" className="break-all text-indigo-700 hover:underline">{order.customer_email}</a>
            : '—'}
        </Info>
        <Info icon={Calendar} label="שולם">{order.paid_at ? ilDateTime(order.paid_at) : 'טרם'}</Info>
        <Info icon={MapPin} label="מסירה">{BOOK_FAIR_DELIVERY_LABELS[order.delivery_method]}</Info>
      </dl>
    </section>
  )
}

function Field({ label, chip, chipText, children }: {
  label: string
  chip: 'ok' | 'warn' | 'edit' | null
  chipText: string
  children: React.ReactNode
}) {
  const cls = chip === 'ok' ? 'bg-emerald-50 text-emerald-700'
    : chip === 'warn' ? 'bg-amber-50 text-amber-700'
    : 'bg-indigo-50 text-indigo-700'
  return (
    <div className="flex flex-col gap-2.5 border-b border-slate-100 px-5 py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold tracking-wide text-slate-500">{label}</span>
        {chip && <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{chipText}</span>}
      </div>
      {children}
    </div>
  )
}

function SavedRow({ value, canEdit, onEdit }: { value: string; canEdit: boolean; onEdit: () => void }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <p className="min-w-0 break-words text-base font-semibold text-slate-900">{value}</p>
      {canEdit && (
        <button onClick={onEdit} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-indigo-700 hover:underline">
          <Pencil size={13} /> עריכה
        </button>
      )}
    </div>
  )
}

function Pending({ transcript, hasRec, canEdit, busy, typeLabel, onOk, onEdit, minLen, disabled }: {
  transcript: string
  hasRec: boolean
  canEdit: boolean
  busy: boolean
  typeLabel: string
  onOk: (() => void) | null
  onEdit: () => void
  minLen: number
  disabled: boolean
}) {
  const hasText = transcript.trim().length >= minLen
  return (
    <>
      {hasText ? (
        <p className="text-sm text-slate-800">
          <span className="mb-0.5 block text-[11px] font-semibold tracking-wide text-slate-400">תמלול</span>
          {transcript}
        </p>
      ) : hasRec ? (
        <p className="text-sm text-amber-700">לא התקבל תמלול. האזינו להקלטה והקלידו.</p>
      ) : (
        <p className="text-sm text-slate-500">אין הקלטה לשדה זה.</p>
      )}
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {hasText && onOk && (
            <button
              onClick={onOk} disabled={disabled}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              המלל תקין
            </button>
          )}
          <button
            onClick={onEdit} disabled={disabled}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
          >
            <Pencil size={14} /> {hasText ? 'עריכה' : typeLabel}
          </button>
        </div>
      )}
    </>
  )
}

function Editor({ text, setText, rows, placeholder, busy, disabled, onSave, onCancel }: {
  text: string
  setText: (v: string) => void
  rows: number
  placeholder: string
  busy: boolean
  disabled: boolean
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text} onChange={e => setText(e.target.value)}
        rows={rows} autoFocus placeholder={placeholder} aria-label={placeholder}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400"
      />
      <div className="flex gap-2">
        <button
          onClick={onSave} disabled={disabled}
          className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          שמירה ואישור
        </button>
        <button
          onClick={onCancel}
          className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          ביטול
        </button>
      </div>
    </div>
  )
}

function Info({ icon: Icon, label, children }: {
  icon: React.ElementType; label: string; children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon size={15} className="mt-0.5 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="text-slate-800">{children}</dd>
      </div>
    </div>
  )
}
