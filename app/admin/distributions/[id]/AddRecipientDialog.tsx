'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2, UserPlus, Check, AlertCircle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'

// ─────────────────────────────────────────────────────────────────────────────
// הוספה ידנית של משפחה לחלוקת חגים.
//
// המקרה: משפחה שלא נרשמה בזמן והמשרד רוצה לצרף אותה — בלי לפתוח מחדש את
// הרישום לכולם.
//
// ⚠️ החיפוש עובר דרך /api/admin/beneficiary-search הקיים ולא דרך מסלול חדש:
// הוא כבר יודע לחפש בשם, בטלפון ובת"ז, ומטפל בת"ז שנשמרה עם אפס מוביל
// ובלעדיו. מסלול חדש היה נולד בלי הטיפול הזה.
//
// 🔴 רק מי שרשום כצאצא מופיע כאן — זו כל רשימת המקור. אין מסלול להוסיף
// משפחה שאינה במאגר, וזו הדרישה: קודם רושמים כצאצא, אחר כך מצרפים לחלוקה.
// ─────────────────────────────────────────────────────────────────────────────

interface Result {
  id: string
  name: string
  full_name?: string | null
  family_name?: string | null
  phone?: string | null
  city?: string | null
  eligibility_status?: string | null
  children_count?: number | null
}

const STATUS_HE: Record<string, string> = {
  approved: 'מאושר', pending: 'ממתין', rejected: 'נדחה',
}

export default function AddRecipientDialog({
  distributionId, existingIds,
}: {
  distributionId: string
  /** מזהי המשפחות שכבר רשומות — כדי לסמן אותן ברשימה במקום לגלות בלחיצה. */
  existingIds: Set<string>
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [searching, setSearching] = useState(false)
  const [addingId, setAddingId] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  // ⚠️ מזהה הבקשה האחרונה: תשובה של חיפוש קודם שחוזרת באיחור הייתה דורסת
  // תוצאה חדשה יותר, והמסך היה מציג שמות שאינם תואמים למה שהוקלד.
  const reqRef = useRef(0)

  // ── חיפוש עם השהיה ──
  // ⚠️ 300ms ולא חיפוש בכל הקלדה: החיפוש פוגע במסד, והקלדת שם מלא הייתה
  // מייצרת שאילתה לכל אות.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); setSearching(false); return }

    setSearching(true)
    const myReq = ++reqRef.current
    const t = setTimeout(() => {
      fetch(`/api/admin/beneficiary-search?q=${encodeURIComponent(q)}&limit=15`)
        .then(r => r.ok ? r.json() : { results: [] })
        .then(d => {
          if (myReq !== reqRef.current) return   // תשובה מיושנת — מתעלמים
          setResults(Array.isArray(d.results) ? d.results : [])
          setTouched(true)
        })
        .catch(() => { if (myReq === reqRef.current) setResults([]) })
        .finally(() => { if (myReq === reqRef.current) setSearching(false) })
    }, 300)

    return () => clearTimeout(t)
  }, [query])

  const add = async (b: Result) => {
    setAddingId(b.id)
    try {
      const res = await fetch('/api/admin/distributions/recipients/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distribution_id: distributionId, beneficiary_id: b.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'ההוספה נכשלה'); return }

      // ⚠️ "כבר רשומה" אינה שגיאה: המזכיר צריך לדעת שהמצב תקין, לא לחשוב
      // שמשהו נכשל.
      if (data.already) {
        toast.info(`${data.name || b.name} כבר רשומה בחלוקה`)
      } else {
        toast.success(`${data.name || b.name} נוספה לחלוקה`)
        router.refresh()
      }
      setOpen(false)
      setQuery('')
      setResults([])
      setTouched(false)
    } catch {
      toast.error('ההוספה נכשלה')
    } finally {
      setAddingId(null)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-3.5 py-2 text-xs font-bold text-white transition">
        <UserPlus size={14} /> הוספה ידנית
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="הוספת משפחה לחלוקה" size="lg">
        <div className="flex flex-col gap-3">
          {/* ⚠️ נאמר מראש ולא רק בשגיאה: מי שמחפש משפחה שאינה במאגר צריך
              לדעת מדוע אינה מופיעה, במקום להניח שהחיפוש תקול. */}
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            ניתן להוסיף רק משפחה הרשומה במאגר הצאצאים. משפחה שאינה במאגר —
            יש לרשום אותה תחילה כצאצא.
          </p>

          <div className="relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="חיפוש לפי שם, טלפון או תעודת זהות..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pr-10 pl-3 text-sm outline-none focus:border-indigo-400"
            />
            {searching && (
              <Loader2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-indigo-500" />
            )}
          </div>

          <div className="max-h-[50vh] overflow-y-auto flex flex-col gap-1.5">
            {query.trim().length < 2 && (
              <p className="text-center text-sm text-slate-400 py-8">
                הקלידו לפחות שתי אותיות לחיפוש
              </p>
            )}

            {query.trim().length >= 2 && !searching && touched && results.length === 0 && (
              <div className="flex flex-col items-center gap-1.5 py-8 text-center">
                <AlertCircle size={22} className="text-slate-300" />
                <p className="text-sm text-slate-500">לא נמצאה משפחה מתאימה</p>
                <p className="text-xs text-slate-400">ייתכן שהמשפחה אינה רשומה במאגר הצאצאים</p>
              </div>
            )}

            {results.map(b => {
              const already = existingIds.has(String(b.id))
              return (
                <div key={b.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 hover:border-indigo-300 transition">
                  <div className="min-w-0 flex flex-col">
                    <span className="text-sm font-bold text-slate-800 truncate">{b.name || '—'}</span>
                    <span className="text-[11px] text-slate-500 truncate">
                      {[
                        b.phone,
                        b.city,
                        b.eligibility_status ? STATUS_HE[b.eligibility_status] ?? b.eligibility_status : null,
                      ].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </div>

                  {/* ⚠️ מסומן כרשום מראש ולא נחשף רק בלחיצה: המזכיר רואה מיד
                      מי כבר בפנים במקום לנסות ולקבל הודעה. */}
                  {already ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 flex-shrink-0">
                      <Check size={12} /> כבר רשומה
                    </span>
                  ) : (
                    <button type="button" onClick={() => add(b)} disabled={addingId !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 text-[11px] font-bold text-white transition disabled:opacity-50 flex-shrink-0">
                      {addingId === b.id ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
                      הוספה
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </Modal>
    </>
  )
}
