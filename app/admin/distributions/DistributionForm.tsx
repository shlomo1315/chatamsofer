'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import HebrewDatePicker from '@/components/ui/HebrewDatePicker'

// ─────────────────────────────────────────────────────────────────────────────
// טופס חלוקת חגים — יצירה ועריכה באותו רכיב.
//
// ⚠️ הסכום למשפחה אינו שדה נוח-לנוי: ממנו נגזר הצפי התקציבי בזמן אמת (נרשמים ×
// סכום), וזו כל מטרת שלב הרישום — לדעת מראש למה להיערך. לכן הוא מוצג בבירור
// ומוסבר במקום.
// ─────────────────────────────────────────────────────────────────────────────
export interface DistributionFormValues {
  id?: string
  name?: string | null
  year?: string | null
  description?: string | null
  amount_per_family?: number | null
  distribution_date?: string | null
}

export default function DistributionForm({ initial }: { initial?: DistributionFormValues }) {
  const router = useRouter()
  const toast = useToast()
  const isEdit = !!initial?.id
  const [name, setName] = useState(initial?.name ?? '')
  const [year, setYear] = useState(initial?.year ?? '')
  const [amount, setAmount] = useState(initial?.amount_per_family != null ? String(initial.amount_per_family) : '')
  const [date, setDate] = useState(initial?.distribution_date ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!name.trim()) { setErr('שם החלוקה חובה'); return }
    const amountNum = amount.trim() ? Number(amount.replace(/[^\d.]/g, '')) : null
    if (amountNum != null && (!Number.isFinite(amountNum) || amountNum < 0)) { setErr('סכום לא תקין'); return }
    setErr(''); setSaving(true)
    try {
      const res = await fetch('/api/admin/distributions', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEdit ? { id: initial!.id } : {}),
          name: name.trim(), year: year.trim(), description: description.trim(),
          amount_per_family: amountNum, distribution_date: date || null,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'השמירה נכשלה'); setSaving(false); return }
      toast.success(isEdit ? 'החלוקה עודכנה' : 'החלוקה נוצרה')
      router.push(`/admin/distributions/${isEdit ? initial!.id : d.id}`)
    } catch { setErr('שגיאת רשת'); setSaving(false) }
  }

  const field = 'w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100'

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-1">
          <label className="mb-1.5 block text-xs font-bold text-slate-600">שם החלוקה <span className="text-red-500">*</span></label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="למשל: חלוקת חג תשרי" className={field} />
        </div>
        <div className="sm:col-span-1">
          <label className="mb-1.5 block text-xs font-bold text-slate-600">שנה</label>
          <input value={year} onChange={e => setYear(e.target.value)} placeholder='למשל: תשפ"ו' className={field} />
        </div>
        <div className="sm:col-span-1">
          <label className="mb-1.5 block text-xs font-bold text-slate-600">סכום לכל משפחה (₪)</label>
          <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="numeric" placeholder="500" dir="ltr" className={`${field} text-left`} />
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            לפי הסכום הזה המערכת מחשבת בזמן אמת את הצפי התקציבי — נרשמים × סכום.
          </p>
        </div>
        <div className="sm:col-span-1">
          <label className="mb-1.5 block text-xs font-bold text-slate-600">תאריך החלוקה (לא חובה)</label>
          <HebrewDatePicker value={date} onChange={setDate} yearFirst />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-bold text-slate-600">תיאור / הערות</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
            placeholder="פרטים פנימיים על החלוקה" className={`${field} resize-none`} />
        </div>
      </div>

      {!isEdit && (
        <p className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[12px] leading-relaxed text-slate-500">
          החלוקה נוצרת <strong>סגורה לרישום</strong>. פתיחת הרישום נעשית ממסך החלוקה — ואז שלושת הערוצים
          (ממשק דיגיטלי, טלפון, מייל) מתחילים לקבל רישומים.
        </p>
      )}

      {err && <p className="text-sm font-bold text-red-600">{err}</p>}

      <div className="flex gap-2">
        <button type="button" onClick={submit} disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {isEdit ? 'שמירת שינויים' : 'יצירת החלוקה'}
        </button>
        <button type="button" onClick={() => router.back()}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
          ביטול
        </button>
      </div>
    </div>
  )
}
