'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Loader2, ExternalLink, Banknote, Baby } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// "קפיצה לרשומה" — הבקשות של שולח המייל, ישירות מתיבת הדואר.
//
// מזכיר שקורא "מה קורה עם ההלוואה שלי?" צריך להגיע לכרטסת בלחיצה אחת,
// במקום לחפש את האדם לפי שם ברשימה ואז לזהות את הבקשה הנכונה.
//
// ⚠️ בקשות פעילות מוצגות ראשונות ומודגשות: זו כמעט תמיד הבקשה שהשאלה
// עליה. בקשות סגורות נשארות זמינות אך מעומעמות.
// ─────────────────────────────────────────────────────────────────────────────

interface LoanRow { id: string; name: string; amount: number | null; status: string; createdAt: string; open: boolean }
interface MatRow { id: string; name: string; babyName: string | null; status: string; createdAt: string; open: boolean }

const LOAN_STATUS: Record<string, string> = {
  pending: 'ממתינה', inquiry: 'בבירור', approved: 'אושרה', active: 'בוצעה',
  completed: 'הושלמה', rejected: 'נדחתה', defaulted: 'בפיגור',
  awaiting_rabbi_form: 'ממתינה לטופס רב',
}
const MAT_STATUS: Record<string, string> = {
  pending: 'ממתינה', approved: 'אושרה', active: 'פעילה',
  completed: 'הושלמה', cancelled: 'בוטלה',
}

const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' }) }
  catch { return '' }
}

export default function RelatedRecords({ email }: { email: string }) {
  // ⚠️ מצב אחד ולא שלושה: setLoading(true) בגוף ה-effect הוא רינדור
  // מדורג מיותר. הקומפוננטה מאותחלת מחדש בכל כתובת דרך key שבצד הקורא,
  // ולכן די באתחול הראשוני.
  const [data, setData] = useState<{ loans: LoanRow[]; maternity: MatRow[] } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/mail/related-records?email=${encodeURIComponent(email)}`)
      .then(r => r.json())
      .then(d => {
        if (!cancelled) setData({ loans: d.loans ?? [], maternity: d.maternity ?? [] })
      })
      // פאנל עזר — כשל אינו מפיל את התיבה, רק לא מציג קיצורים
      .catch(() => { if (!cancelled) setData({ loans: [], maternity: [] }) })
    return () => { cancelled = true }
  }, [email])

  const loading = data === null
  const loans = data?.loans ?? []
  const maternity = data?.maternity ?? []

  if (loading) {
    return <span className="flex items-center gap-1 text-[11px] text-slate-400"><Loader2 size={11} className="animate-spin" /> מחפש בקשות…</span>
  }
  if (!loans.length && !maternity.length) return null

  // ⚠️ פעילות ראשונות — הן כמעט תמיד נושא הפנייה.
  const sortedLoans = [...loans].sort((a, b) => Number(b.open) - Number(a.open))
  const sortedMat = [...maternity].sort((a, b) => Number(b.open) - Number(a.open))

  const chip = (open: boolean) =>
    `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
      open
        ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
        : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
    }`

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {sortedLoans.map(l => (
        <Link key={l.id} href={`/admin/loans/${l.id}`} target="_blank" className={chip(l.open)}
          title={`${l.name} · ${fmtDate(l.createdAt)}`}>
          <Banknote size={11} />
          הלוואה
          {l.amount != null && <span className="ltr-num">${Math.round(Number(l.amount)).toLocaleString('he-IL')}</span>}
          <span className="opacity-70">· {LOAN_STATUS[l.status] ?? l.status}</span>
          <ExternalLink size={9} className="opacity-50" />
        </Link>
      ))}
      {sortedMat.map(m => (
        <Link key={m.id} href={`/admin/maternity/${m.id}`} target="_blank" className={chip(m.open)}
          title={`${m.name} · ${fmtDate(m.createdAt)}`}>
          <Baby size={11} />
          לידה
          {m.babyName && <span className="opacity-80">{m.babyName}</span>}
          <span className="opacity-70">· {MAT_STATUS[m.status] ?? m.status}</span>
          <ExternalLink size={9} className="opacity-50" />
        </Link>
      ))}
    </div>
  )
}
