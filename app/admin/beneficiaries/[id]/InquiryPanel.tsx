'use client'
import { docKeysToHebrew } from '@/lib/docKeysHebrew'
import { MessageSquare, XCircle, FileWarning, Search, AlertTriangle, Clock } from 'lucide-react'
import BeneficiaryNotesChat from './BeneficiaryNotesChat'

// ─────────────────────────────────────────────────────────────────────────────
// "בירורים והתכתבות" — חלון אחד שעונה על השאלה שנשאלת בכל פנייה:
// **למה דחו, מי דחה, ומה נכתב למשפחה.**
//
// 🔴 המידע הזה היה קיים, אבל פזור: סיבת הדחייה בבאנר בראש הדף, בקשות
// השלמת המסמכים בציר הזמן, ההתכתבות בלשונית נפרדת, והערות הצוות במקום
// רביעי. מזכיר שנשאל "למה דחיתם אותי?" נאלץ לעבור בין ארבעה מקומות —
// וזה בדיוק הרגע שבו הוא צריך תשובה מיידית.
//
// ⚠️ הרכיב מציג ולא כותב סטטוסים: השינוי נעשה ב-StatusControl, ומסך
// שמאפשר לשנות סטטוס משני מקומות שונים מזמין מצבים סותרים.
// ─────────────────────────────────────────────────────────────────────────────

const fmtWhen = (iso?: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export interface InquiryState {
  status?: string | null
  rejectionReason?: string | null
  rejectedAt?: string | null
  rejectedBy?: string | null
  docsNotes?: string | null
  requiredDocs?: string | null
  deepReviewReason?: string | null
  lineageFixNote?: string | null
}

export default function InquiryPanel({ beneficiaryId, state }: {
  beneficiaryId: string
  state: InquiryState
}) {
  const { status, rejectionReason, rejectedAt, rejectedBy,
    docsNotes, requiredDocs, deepReviewReason, lineageFixNote } = state

  const isRejected = status === 'rejected'
  const isDocsPending = status === 'docs_pending' || status === 'docs_returned'
  const isDeepReview = status === 'deep_review'
  // ⚠️ נבדק לפי תוכן ולא לפי סטטוס בלבד: סיבת דחייה נשמרת גם אחרי שינוי
  // סטטוס, והיא רלוונטית להיסטוריה גם כשהמשפחה כבר אושרה מחדש.
  const hasAnyReason = !!(rejectionReason?.trim() || docsNotes?.trim()
    || requiredDocs?.trim() || deepReviewReason?.trim() || lineageFixNote?.trim())

  return (
    <div className="flex flex-col gap-4">
      {/* ── מצב הבירור הנוכחי ── */}
      {/* ⚠️ מוצג רק כשיש מה לומר: כרטיס ריק "אין בירור" הוא רעש. */}
      {hasAnyReason && (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
            <Search size={14} className="text-slate-400" />
            <span className="text-[11px] font-bold text-slate-500 uppercase">מצב הבירור</span>
          </div>
          <div className="p-4 flex flex-col gap-3">

            {rejectionReason?.trim() && (
              <Block
                tone="rose"
                icon={<XCircle size={14} />}
                title="סיבת הדחייה"
                // 🔴 מי דחה ומתי — בדיוק מה שנשאל, ולא היה במקום אחד עם הסיבה.
                meta={[rejectedBy ? `נדחה ע״י ${rejectedBy}` : null, fmtWhen(rejectedAt)]
                  .filter(Boolean).join(' · ')}
                body={rejectionReason}
                stale={!isRejected}
              />
            )}

            {(requiredDocs?.trim() || docsNotes?.trim()) && (
              <Block
                tone="blue"
                icon={<FileWarning size={14} />}
                title="מסמכים שנדרשו"
                // 🔴 תוויות בעברית ולא המפתחות הגולמיים: "id_husband,
                // id_husband_appx,id_wife" אינו קריא למזכירה, והוא מה
                // שהוצג כאן עד כה.
                body={[docKeysToHebrew(requiredDocs), docsNotes?.trim()].filter(Boolean).join('\n')}
                stale={!isDocsPending}
              />
            )}

            {deepReviewReason?.trim() && (
              <Block
                tone="orange"
                icon={<AlertTriangle size={14} />}
                title="סיבת הבדיקה המעמיקה"
                body={deepReviewReason}
                stale={!isDeepReview}
              />
            )}

            {lineageFixNote?.trim() && (
              <Block
                tone="violet"
                icon={<AlertTriangle size={14} />}
                title="תיקון ייחוס שנדרש"
                body={lineageFixNote}
              />
            )}
          </div>
        </div>
      )}

      {/* ── שרשור ההערות ── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
          <MessageSquare size={14} className="text-slate-400" />
          <span className="text-[11px] font-bold text-slate-500 uppercase">התכתבות פנימית</span>
        </div>
        <div className="p-4">
          <BeneficiaryNotesChat beneficiaryId={beneficiaryId} />
        </div>
      </div>
    </div>
  )
}

const TONES: Record<string, string> = {
  rose: 'border-rose-200 bg-rose-50 text-rose-900',
  blue: 'border-blue-200 bg-blue-50 text-blue-900',
  orange: 'border-orange-200 bg-orange-50 text-orange-900',
  violet: 'border-violet-200 bg-violet-50 text-violet-900',
}

function Block({ tone, icon, title, meta, body, stale }: {
  tone: keyof typeof TONES | string
  icon: React.ReactNode
  title: string
  meta?: string
  body: string
  /** הסיבה נשמרה אך הסטטוס כבר השתנה — היסטוריה, לא מצב פעיל. */
  stale?: boolean
}) {
  return (
    // ⚠️ "היסטורי" מסומן ומעומעם ולא מוסתר: מזכיר שנשאל "למה דחיתם
    // בפעם הקודמת" צריך לראות את הסיבה גם אחרי שהמשפחה אושרה מחדש.
    <div className={`rounded-xl border px-3.5 py-2.5 ${TONES[tone] ?? TONES.rose} ${stale ? 'opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase opacity-80">
          {icon}{title}
        </span>
        {stale && (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold opacity-70">
            <Clock size={9} /> היסטורי
          </span>
        )}
      </div>
      {meta && <p className="text-[11px] opacity-70 mb-1">{meta}</p>}
      <p className="text-sm font-medium whitespace-pre-wrap leading-relaxed">{body}</p>
    </div>
  )
}
