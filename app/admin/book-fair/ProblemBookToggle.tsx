'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Flag, Loader2 } from 'lucide-react'
import { useCan } from '@/components/StaffPermissions'

// ─────────────────────────────────────────────────────────────────────────────
// כפתור "ספר בעייתי במלאי" — בקטלוג ובכרטיס ההזמנה (בקשת המשתמש 07.10).
// מסך ההזמנות מסנן אחר כך את כל ההזמנות שהספר הזה בתוכן.
// ─────────────────────────────────────────────────────────────────────────────

export default function ProblemBookToggle({ bookId, problem, note, compact }: {
  bookId: string
  problem: boolean
  note?: string | null
  /** אייקון בלבד — לשורות טבלה צפופות. */
  compact?: boolean
}) {
  const router = useRouter()
  const canEdit = useCan('book_fair', 'edit')
  const [busy, setBusy] = useState(false)

  async function toggle(e: React.MouseEvent) {
    // ⚠️ השורה שמכילה את הכפתור עשויה להיות לחיצה בעצמה.
    e.stopPropagation()
    let newNote: string | null = null
    if (!problem) {
      const ans = window.prompt('לסמן את הספר כבעייתי במלאי?\n\nסיבה (לא חובה) — למשל: חסר, פגום, מתעכב אצל המו״ל:', '')
      if (ans === null) return
      newNote = ans.trim() || null
    } else if (!window.confirm('להסיר את סימון "בעייתי במלאי" מהספר?')) {
      return
    }

    setBusy(true)
    try {
      const res = await fetch('/api/admin/book-fair/problem-books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, problem: !problem, note: newNote }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { alert(json.error ?? 'שמירת הסימון נכשלה'); return }
      router.refresh()
    } catch {
      alert('שמירת הסימון נכשלה — בדקו את החיבור')
    } finally {
      setBusy(false)
    }
  }

  const title = problem
    ? `סומן כבעייתי במלאי${note ? ` — ${note}` : ''}. לחיצה להסרת הסימון`
    : 'סימון כבעייתי במלאי'

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!canEdit || busy}
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition disabled:opacity-40 ${
        problem
          ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
          : 'border-slate-200 bg-white text-slate-400 hover:border-red-200 hover:text-red-600'}`}
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <Flag size={12} className={problem ? 'fill-red-600' : ''} />}
      {!compact && (problem ? 'בעייתי במלאי' : 'סימון בעייתי')}
    </button>
  )
}
