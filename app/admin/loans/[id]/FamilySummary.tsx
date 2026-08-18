'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Users, Loader2, ArrowLeft, GitBranch, Banknote, IdCard, ExternalLink } from 'lucide-react'
import { registrationSourceLabel } from '@/lib/distributionSources'

// ─────────────────────────────────────────────────────────────────────────────
// סיכום המשפחה שמאחורי הבקשה — כדי שההחלטה תתקבל עם כל התמונה, בלי לצאת
// מהמסך: פרטי ההורים וגילם, ילדים (כולל כמה נשואים — חישוב אוטומטי),
// סדר הדורות, צילומי ת"ז, והיסטוריית ההלוואות הקודמות.
// ─────────────────────────────────────────────────────────────────────────────

interface Summary {
  beneficiary: {
    id: string
    familyName?: string | null
    husbandName?: string | null
    husbandAge?: number | null
    wifeName?: string | null
    wifeAge?: number | null
    phone?: string | null
    city?: string | null
    address?: string | null
    community?: string | null
    registrationSource?: string | null
    eligibilityStatus?: string | null
  }
  children: { total: number; married: number; atHome: number }
  lineage: string[]
  idDocs: { type: string; name?: string | null; url: string | null }[]
  loanHistory: {
    count: number
    approvedCount: number
    approvedNotDisbursed?: number
    totalApproved: number
    loans: { id: string; amount: number; approved_amount?: number | null; status: string; created_at: string }[]
  }
  /** הלוואות מהמערכת הקודמת, משויכות לפי ת"ז. ראה lib/legacyLoans. */
  legacyLoans?: {
    count: number
    takenCount: number
    totalApproved: number
    totalTaken: number
    loans: {
      id: string
      fileNumber: string | null
      borrowerName: string | null
      approvedAmount: number | null
      /** ⚠️ null = אושר ומעולם לא נלקח. אפס = בוצע בסכום אפס. */
      takenAmount: number | null
      installments: number | null
    }[]
  }
}

const STATUS_HE: Record<string, string> = {
  pending: 'ממתין', inquiry: 'בתהליך בירור', approved: 'מאושר',
  active: 'פעיל', completed: 'הושלם', rejected: 'נדחה', defaulted: 'בפיגור',
}

const fmtCur = (n: number) => `$${Math.round(n).toLocaleString('he-IL')}`
const fmtDate = (d: string) => new Date(d).toLocaleDateString('he-IL')

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-slate-800 text-left">{value}</span>
    </div>
  )
}

export default function FamilySummary({ loanId, section = 'all' }: { loanId: string; section?: 'all' | 'family' | 'history' }) {
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/admin/loans/${loanId}/summary`)
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [loanId])

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center justify-center">
        <Loader2 size={18} className="animate-spin text-slate-400" />
      </div>
    )
  }
  if (!data) return null

  const { beneficiary: b, children, lineage, idDocs, loanHistory } = data
  // ⚠️ ברירת מחדל: תשובה מ-API ישן (לפני המיגרציה) אינה כוללת את השדה.
  const legacy = data.legacyLoans ?? { count: 0, takenCount: 0, totalApproved: 0, totalTaken: 0, loans: [] }
  // 🔴 "בקשה ראשונה" חייב להביא בחשבון גם את הישנות — אחרת המסך מצהיר
  // "זו הבקשה הראשונה" למשפחה שכבר לקחה הלוואה במערכת הקודמת.
  const anyHistory = loanHistory.count > 0 || legacy.count > 0
  const family = [b.familyName, b.husbandName].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-4">
      {/* פרטי המשפחה */}
      {section !== 'history' && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-indigo-600" />
            <h3 className="font-semibold text-slate-900 text-sm">סיכום המשפחה</h3>
          </div>
          {/* מעבר לכרטסת המלאה */}
          <Link
            href={`/admin/beneficiaries/${b.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg px-2.5 py-1.5 hover:bg-indigo-100 transition-colors"
          >
            לכרטסת המלאה <ArrowLeft size={13} />
          </Link>
        </div>

        <div className="px-4 py-3">
          <Row label="בעל" value={b.husbandName ? `${b.husbandName}${b.husbandAge != null ? ` · בן ${b.husbandAge}` : ''}` : null} />
          <Row label="אשה" value={b.wifeName ? `${b.wifeName}${b.wifeAge != null ? ` · בת ${b.wifeAge}` : ''}` : null} />
          <Row label="כתובת" value={[b.address, b.city].filter(Boolean).join(', ')} />
          <Row label="קהילה" value={b.community?.trim() || null} />
          <Row label="אופן ההרשמה" value={registrationSourceLabel(b.registrationSource)} />
          <Row label="טלפון" value={b.phone ? <span dir="ltr" className="tabular-nums">{b.phone}</span> : null} />
        </div>

        {/* ילדים — הפילוח שמשפיע על ההחלטה */}
        <div className="px-4 pb-4 grid grid-cols-3 gap-2">
          {[
            { label: 'סה״כ ילדים', value: children.total, color: 'bg-slate-50 text-slate-800 border-slate-200' },
            { label: 'נשואים', value: children.married, color: 'bg-violet-50 text-violet-800 border-violet-200' },
            { label: 'בבית', value: children.atHome, color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
          ].map(c => (
            <div key={c.label} className={`rounded-xl border px-3 py-2.5 text-center ${c.color}`}>
              <p className="text-2xl font-extrabold leading-none">{c.value}</p>
              <p className="text-[11px] mt-1 opacity-80">{c.label}</p>
            </div>
          ))}
        </div>

        {/* סדר הדורות */}
        {lineage.length > 0 && (
          <div className="px-4 pb-4">
            <div className="flex items-start gap-2 bg-violet-50/60 border border-violet-100 rounded-xl px-3 py-2.5">
              <GitBranch size={14} className="text-violet-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[11px] text-violet-700 font-semibold mb-0.5">סדר הדורות</p>
                <p className="text-xs text-violet-900 leading-relaxed">{lineage.join(' ← ')}</p>
              </div>
            </div>
          </div>
        )}

        {/* צילומי ת"ז */}
        {idDocs.length > 0 && (
          <div className="px-4 pb-4 flex flex-wrap gap-2">
            {idDocs.map((d, i) => (
              <a
                key={i}
                href={d.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-100 hover:border-slate-300 transition-colors"
              >
                <IdCard size={13} className="text-slate-500" />
                {d.type}
                <ExternalLink size={11} className="text-slate-400" />
              </a>
            ))}
          </div>
        )}
      </div>
      )}

      {/* היסטוריית הלוואות */}
      {/* ⚠️ מהבהב רק כשיש היסטוריה: זו העובדה שצריך לשים לב אליה — משפחה
          שכבר קיבלה או ביקשה בעבר. על בקשה ראשונה ההבהוב היה רעש. */}
      {section !== 'family' && (
      <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
        anyHistory ? 'border-amber-300 animate-soft-attention' : 'border-slate-200'
      }`}>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Banknote size={16} className="text-emerald-600" />
            <h3 className="font-semibold text-slate-900 text-sm">היסטוריית הלוואות</h3>
          </div>
          {loanHistory.count > 0 && (
            <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-800">
              {loanHistory.count} בקשות קודמות
            </span>
          )}
        </div>

        {!anyHistory ? (
          <p className="px-4 py-5 text-center text-sm text-slate-400">
            זו הבקשה הראשונה של המשפחה
          </p>
        ) : loanHistory.count === 0 ? (
          // ⚠️ יש היסטוריה ישנה בלבד — נאמר במפורש, כדי שהמזכיר לא יסיק
          // מהיעדר בקשות במערכת שזו משפחה חדשה.
          <p className="px-4 py-3 text-center text-xs text-slate-500">
            אין בקשות במערכת הנוכחית — ראו הלוואות קודמות למטה
          </p>
        ) : (
          <>
            <div className="px-4 py-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-center">
                <p className="text-xl font-extrabold text-slate-800 leading-none">{loanHistory.approvedCount}</p>
                <p className="text-[11px] text-slate-500 mt-1">הלוואות שהועבר בהן כסף</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-center">
                <p className="text-xl font-extrabold text-emerald-800 leading-none tabular-nums">
                  {fmtCur(loanHistory.totalApproved)}
                </p>
                <p className="text-[11px] text-emerald-700 mt-1">סה״כ שהועבר בפועל</p>
              </div>
            </div>

            {/* ⚠️ אישור שאין מאחוריו העברת כסף אינו נספר במונים, אבל גם לא
                נעלם: בלי השורה הזו בקשה מאושרת שתקועה לפני הביצוע הייתה
                נראית כאילו לא הוגשה מעולם. */}
            {(loanHistory.approvedNotDisbursed ?? 0) > 0 && (
              <p className="px-4 pb-1 text-[11px] text-amber-700">
                ועוד {loanHistory.approvedNotDisbursed} שאושרו וטרם הועבר בהן כסף — ראו ברשימה
              </p>
            )}

            <div className="px-4 pb-4 flex flex-col gap-1.5">
              {loanHistory.loans.map(l => (
                <Link
                  key={l.id}
                  href={`/admin/loans/${l.id}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50 hover:border-slate-200 transition-colors"
                >
                  <span className="text-xs text-slate-500">{fmtDate(l.created_at)}</span>
                  <span className="text-sm font-semibold text-slate-800 tabular-nums">
                    {fmtCur(Number(l.approved_amount ?? l.amount))}
                  </span>
                  <span className="text-[11px] font-medium text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">
                    {STATUS_HE[l.status] ?? l.status}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* ── הלוואות מהמערכת הקודמת ── */}
        {/* ⚠️ בתוך אותו כרטיס אבל מופרד בקו: מבחינת המזכיר זו אותה שאלה
            ("מה היה עם המשפחה הזו"), אבל אלה רשומות היסטוריות בלי סטטוס
            חי ובלי כרטסת לפתוח — ולכן אינן נראות כבקשות פעילות. */}
        {legacy.count > 0 && (
          <div className="border-t border-slate-100 bg-slate-50/60">
            <div className="px-4 py-2.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase">
                הלוואות במערכת הקודמת
              </span>
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-extrabold text-slate-700">
                {legacy.count}
              </span>
            </div>

            {/* 🔴 שתי הקוביות שמסבירות את ההבחנה: אושר מול נלקח בפועל.
                כמעט מחצית מההלוואות ההיסטוריות אושרו ומעולם לא נלקחו,
                וסכום אחד מאוחד היה מטשטש בדיוק את זה. */}
            <div className="px-4 pb-2.5 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center">
                <p className="text-base font-extrabold text-slate-800 leading-none tabular-nums">
                  {fmtCur(legacy.totalApproved)}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">אושר · {legacy.count} הלוואות</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-center">
                <p className="text-base font-extrabold text-emerald-800 leading-none tabular-nums">
                  {fmtCur(legacy.totalTaken)}
                </p>
                <p className="text-[10px] text-emerald-700 mt-1">נלקח בפועל · {legacy.takenCount} הלוואות</p>
              </div>
            </div>

            <div className="px-4 pb-4 flex flex-col gap-1.5">
              {legacy.loans.map(l => {
                // ⚠️ null בלבד = לא נלקח. אפס הוא ערך אמיתי ("בוצע בסכום
                // אפס") ואינו אותו דבר.
                const taken = l.takenAmount !== null && l.takenAmount !== undefined
                return (
                  <div key={l.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2">
                    <span className="text-[11px] text-slate-400 tabular-nums flex-shrink-0">
                      {l.fileNumber ? `תיק ${l.fileNumber}` : '—'}
                    </span>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <span className="text-xs text-slate-500 tabular-nums">
                        אושר {fmtCur(Number(l.approvedAmount ?? 0))}
                      </span>
                      {taken ? (
                        <span className="text-xs font-semibold text-emerald-700 tabular-nums">
                          בוצע {fmtCur(Number(l.takenAmount))}
                        </span>
                      ) : (
                        // 🔴 העובדה שביקשת שתהיה גלויה: אושר ולא נלקח.
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">
                          לא נלקח
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
