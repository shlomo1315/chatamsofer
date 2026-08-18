'use client'
import { Gift, Baby, Landmark, GitBranch, ArrowLeft } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// מסך הבית של דף השיתוף — שלוש מחלקות, כניסה אחת לכל אחת.
//
// ⚠️ הקוביות אינן "כפתורי ניווט עם אייקון": כל אחת נושאת את מספר הליבה של
// המחלקה ואת פילוח המצב שלה. מי שרק פותח את הדף כבר מקבל תשובה, ורק מי
// שרוצה פירוט נכנס פנימה.
//
// ⚠️ הפס התחתון הוא נתון ולא קישוט: הוא מציג את היחס בין מה שהושלם למה
// שממתין. מילוי דקורטיבי היה הופך את הכרטיס לבאנר.
// ─────────────────────────────────────────────────────────────────────────────

export interface DeptSummary {
  key: 'holidays' | 'maternity' | 'loans' | 'tree'
  /** המספר הראשי — מה שההנהלה מסתכלת עליו. */
  headline: number
  headlineLabel: string
  /** שורות משנה: תווית + ערך מוכן לתצוגה. */
  rows: { label: string; value: string }[]
  /** יחס ההשלמה 0–1 — מזין את הפס התחתון. */
  progress: number
  progressLabel: string
}

const META = {
  holidays: {
    title: 'חלוקות חגים',
    subtitle: 'רישום, אישורים וכרטיסי מזון',
    Icon: Gift,
    ink: '#b45309', tint: '#fef6ec', ring: '#f3dcc0',
  },
  maternity: {
    title: 'עזר יולדות',
    subtitle: 'בתי החלמה, שוברים וכרטיסים',
    Icon: Baby,
    ink: '#0f766e', tint: '#eefaf8', ring: '#c7e9e4',
  },
  loans: {
    title: 'גמ״ח הלוואות',
    subtitle: 'בקשות, אישורים ומסירת שטרות',
    Icon: Landmark,
    ink: '#1d4ed8', tint: '#eff4ff', ring: '#cfdcfa',
  },
  // ⚠️ עץ הדורות כמחלקה עצמאית ולא כלשונית בתוך חלוקות חגים: אין ביניהם
  // שום קשר, והוא גם הכבד ביותר לטעינה — ולכן נטען רק בכניסה אליו.
  tree: {
    title: 'צאצאים ועץ הדורות',
    subtitle: 'שרשרת היוחסין המלאה',
    Icon: GitBranch,
    ink: '#7c3aed', tint: '#f5f0ff', ring: '#ddd0fa',
  },
} as const

export default function Home({ summaries, onOpen }: {
  summaries: DeptSummary[]
  onOpen: (key: DeptSummary['key']) => void
}) {
  return (
    <div className="flex flex-col gap-8">
      {/* ── כותרת ── */}
      {/* ⚠️ הברכה גדולה ושקטה, בלי תת-כותרת שיווקית: זה דף פנימי להנהלה
          ולא עמוד נחיתה. */}
      <div className="text-center pt-2">
        <p className="text-[12px] font-bold tracking-[0.2em] text-[#b08d3f] mb-3">
          ברוכים הבאים
        </p>
        <h1 className="text-3xl sm:text-[42px] font-extrabold text-[#3a3630] leading-tight">
          איגוד הצאצאים של
          <span className="block text-[#8a6a24]">היכל החתם סופר</span>
        </h1>
        <div className="mx-auto mt-5 h-px w-24 bg-gradient-to-l from-transparent via-[#d9b95c] to-transparent" />
        <p className="mt-4 text-sm text-[#8a7a56]">
          בחרו מחלקה לצפייה בנתונים המלאים
        </p>
      </div>

      {/* ── שלוש המחלקות ── */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {summaries.map(s => {
          const m = META[s.key]
          const { Icon } = m
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onOpen(s.key)}
              className="group relative flex flex-col overflow-hidden rounded-3xl border bg-white p-6 text-right transition-all duration-200 hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ borderColor: m.ring, boxShadow: '0 1px 16px -10px rgba(58,54,48,0.35)' }}
            >
              {/* פס הצבע של המחלקה — מזהה, לא קישוט */}
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: m.ink }} />

              <div className="flex items-start justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-lg font-extrabold text-[#3a3630]">{m.title}</h2>
                  <p className="text-[11px] text-[#a08a5a] mt-0.5">{m.subtitle}</p>
                </div>
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 transition-transform duration-200 group-hover:scale-105"
                  style={{ background: m.tint, color: m.ink, borderColor: m.ring }}
                >
                  <Icon size={20} />
                </span>
              </div>

              {/* המספר הראשי */}
              <p className="text-[44px] font-extrabold leading-none ltr-num" style={{ color: m.ink }}>
                {s.headline.toLocaleString('he-IL')}
              </p>
              <p className="mt-1 text-[11px] font-bold text-[#8a7a56]">{s.headlineLabel}</p>

              {/* שורות המשנה */}
              <dl className="mt-5 flex flex-col gap-1.5 border-t border-dashed pt-4" style={{ borderColor: m.ring }}>
                {s.rows.map(r => (
                  <div key={r.label} className="flex items-baseline justify-between gap-2">
                    <dt className="text-[11px] text-[#8a7a56]">{r.label}</dt>
                    <dd className="text-[13px] font-bold text-[#3a3630] ltr-num">{r.value}</dd>
                  </div>
                ))}
              </dl>

              {/* ⚠️ הפס הוא נתון: היחס בין מה שהושלם למה שממתין. */}
              <div className="mt-5">
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[10px] font-bold text-[#a08a5a]">{s.progressLabel}</span>
                  <span className="text-[10px] font-bold ltr-num" style={{ color: m.ink }}>
                    {Math.round(s.progress * 100)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: m.tint }}>
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{ width: `${Math.max(s.progress * 100, 1.5)}%`, background: m.ink }}
                  />
                </div>
              </div>

              <span
                className="mt-5 inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-bold text-white transition-opacity group-hover:opacity-90"
                style={{ background: m.ink }}
              >
                לצפייה בנתונים <ArrowLeft size={13} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
