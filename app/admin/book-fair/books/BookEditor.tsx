'use client'
import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { BookFairBook } from '@/types/bookFair'
import { agorotToShekels, bookImageUrl } from '@/lib/bookFairPricing'

// עורך ספר — יצירה ועריכה.
//
// 🔴 המלאי אינו נערך כאן, ובכוונה: כל תנועת מלאי חייבת לעבור דרך היומן
// (מסך המלאי / העברה בין ערוצים), אחרת ההתאמה בין העמודה לתנועות נשברת
// והבאג שקט לחלוטין. ביצירה *כן* נקבע מלאי פתיחה — הוא נרשם ביומן.

export default function BookEditor({ book, onClose, onSaved }: {
  book: BookFairBook | null
  onClose: () => void
  onSaved: () => void
}) {
  const isNew = !book
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    sku:       book?.sku ?? '',
    title:     book?.title ?? '',
    author:    book?.author ?? '',
    publisher: book?.publisher ?? '',
    volumes:   String(book?.volumes ?? 1),
    // ⚠️ המחיר מוצג ונערך בשקלים; ההמרה לאגורות בשרת, בנקודה אחת.
    price:     book ? String(agorotToShekels(book.price_agorot)) : '',
    phone_code: book?.phone_code != null ? String(book.phone_code) : '',
    stock_web:   '0',
    stock_phone: '0',
    is_active: book?.is_active ?? true,
  })

  const set = (k: keyof typeof form, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  // ── תמונת כריכה ──
  const [imgUrl, setImgUrl] = useState<string | null>(bookImageUrl(book?.image_path))
  const [imgBusy, setImgBusy] = useState(false)

  async function uploadImage(file: File) {
    if (!book) return
    setImgBusy(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/admin/book-fair/books/${book.id}/image`, { method: 'POST', body: fd })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'העלאת התמונה נכשלה'); return }
      // ⚠️ הכתובת מהשרת ולא נתיב שנבנה בלקוח: שם הקובץ נקבע בשרת
      // (חותמת זמן ייחודית, כדי שהחלפה לא תציג את הישנה מהמטמון).
      setImgUrl(json.url)
    } catch {
      setError('העלאת התמונה נכשלה')
    } finally {
      setImgBusy(false)
    }
  }

  async function removeImage() {
    if (!book) return
    setImgBusy(true); setError('')
    try {
      const res = await fetch(`/api/admin/book-fair/books/${book.id}/image`, { method: 'DELETE' })
      if (!res.ok) { setError('הסרת התמונה נכשלה'); return }
      setImgUrl(null)
    } finally {
      setImgBusy(false)
    }
  }

  async function save() {
    setError('')
    if (!form.sku.trim())   return setError('יש להזין מק"ט')
    if (!form.title.trim()) return setError('יש להזין שם ספר')
    if (!form.price.trim()) return setError('יש להזין מחיר')

    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        sku: form.sku, title: form.title,
        author: form.author, publisher: form.publisher,
        volumes: Number(form.volumes) || 1,
        price: form.price,
        phone_code: form.phone_code,
        is_active: form.is_active,
      }
      // מלאי פתיחה נשלח רק ביצירה
      if (isNew) {
        body.stock_web = Number(form.stock_web) || 0
        body.stock_phone = Number(form.stock_phone) || 0
      }

      const res = await fetch(
        isNew ? '/api/admin/book-fair/books' : `/api/admin/book-fair/books/${book!.id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'השמירה נכשלה'); return }
      onSaved()
    } catch {
      setError('השמירה נכשלה — בדקו את החיבור')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">{isNew ? 'ספר חדש' : 'עריכת ספר'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-5">
          <Field label='מק"ט' required hint="לפיו הלקוח מאתר באתר ובטלפון">
            <input value={form.sku} onChange={e => set('sku', e.target.value)} className={INPUT} dir="ltr" />
          </Field>
          <Field label="מחיר בשקלים" required hint="למשל 45.90">
            <input value={form.price} onChange={e => set('price', e.target.value)} className={INPUT} dir="ltr" inputMode="decimal" />
          </Field>
          <Field label="שם הספר" required className="sm:col-span-2">
            <input value={form.title} onChange={e => set('title', e.target.value)} className={INPUT} />
          </Field>
          <Field label="מחבר">
            <input value={form.author} onChange={e => set('author', e.target.value)} className={INPUT} />
          </Field>
          <Field label="הוצאה">
            <input value={form.publisher} onChange={e => set('publisher', e.target.value)} className={INPUT} />
          </Field>
          <Field label="מספר כרכים" hint="משמש לאריזה">
            <input value={form.volumes} onChange={e => set('volumes', e.target.value)} className={INPUT} dir="ltr" inputMode="numeric" />
          </Field>
          <Field label="קוד טלפוני" hint="ריק = לא נמכר בטלפון">
            <input value={form.phone_code} onChange={e => set('phone_code', e.target.value)} className={INPUT} dir="ltr" inputMode="numeric" />
          </Field>

          {isNew ? (
            <>
              <Field label="מלאי פתיחה — אתר" hint="עותקים למכירה באתר">
                <input value={form.stock_web} onChange={e => set('stock_web', e.target.value)} className={INPUT} dir="ltr" inputMode="numeric" />
              </Field>
              <Field label="מלאי פתיחה — טלפון" hint="מכסה נפרדת לחלוטין">
                <input value={form.stock_phone} onChange={e => set('stock_phone', e.target.value)} className={INPUT} dir="ltr" inputMode="numeric" />
              </Field>
            </>
          ) : (
            <p className="sm:col-span-2 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
              המלאי נערך במסך המלאי, כדי שכל תנועה תירשם ביומן.
              כרגע: <b>{book!.stock_web}</b> באתר, <b>{book!.stock_phone}</b> בטלפון.
            </p>
          )}

          {/* ── תמונת כריכה ──
              ⚠️ זמינה רק בעריכה ולא ביצירה: ההעלאה דורשת מזהה ספר
              קיים כדי לשייך אליו את הקובץ. */}
          {!isNew && (
            <div className="sm:col-span-2 flex flex-col gap-2 rounded-xl border border-slate-200 p-4">
              <span className="text-sm font-medium text-slate-700">תמונת כריכה</span>
              <div className="flex items-start gap-4">
                {imgUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgUrl} alt="" className="h-28 w-20 rounded border border-slate-200 object-contain" />
                ) : (
                  <div className="flex h-28 w-20 items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-400">
                    אין
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(f) }}
                    disabled={imgBusy}
                    className="text-sm file:ml-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:text-slate-700"
                  />
                  <span className="text-xs text-slate-400">JPG, PNG או WEBP · עד 5MB</span>
                  {imgUrl && (
                    <button
                      onClick={removeImage}
                      disabled={imgBusy}
                      className="self-start text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      הסרת התמונה
                    </button>
                  )}
                  {imgBusy && <span className="text-xs text-indigo-600">מעלה…</span>}
                </div>
              </div>
            </div>
          )}

          <label className="sm:col-span-2 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => set('is_active', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            פעיל — מוצג בקטלוג וניתן להזמנה
          </label>

          {error && (
            <p className="sm:col-span-2 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
            ביטול
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            {isNew ? 'הוספה' : 'שמירה'}
          </button>
        </div>
      </div>
    </div>
  )
}

const INPUT = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100'

function Field({ label, required, hint, className, children }: {
  label: string; required?: boolean; hint?: string; className?: string; children: React.ReactNode
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <span className="text-sm font-medium text-slate-700">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </label>
  )
}
