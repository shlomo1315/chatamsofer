'use client'
import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal, X, RotateCcw } from 'lucide-react'
import type { AdvFilters } from '@/lib/listParams'

// ─────────────────────────────────────────────────────────────────────────────
// פאנל הסינון המתקדם של רשימת הצאצאים.
//
// 🔴 כל הסינון כאן רץ *במסד* (ראו applyAdvFilters). הפאנל רק כותב ל-URL,
// והשרת מסנן — הדף מחזיק 50 שורות מתוך 7,196, וסינון בזיכרון היה מסנן את
// העמוד בתוך עצמו ומציג תוצאה שנראית תקינה לחלוטין ואינה.
//
// ⚠️ הכפתור "ייצוא לאקסל" גורר את אותם פרמטרים מה-URL, ולכן הקובץ שיורד
// זהה למה שמוצג. ראו ExportExcelButton.
// ─────────────────────────────────────────────────────────────────────────────

/** קבוצות גיל מוכנות — קיצור ללחיצה אחת. הטווח החופשי נשאר זמין לצדן. */
const AGE_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: 'עד 29', max: 29 },
  { label: '30–39', min: 30, max: 39 },
  { label: '40–49', min: 40, max: 49 },
  { label: '50–59', min: 50, max: 59 },
  { label: '60+', min: 60 },
]

const CHIP = 'px-3 py-1.5 rounded-full text-xs font-medium border transition-all'
const CHIP_ON = 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
const CHIP_OFF = 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
const FIELD = 'w-full px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300'
const LABEL = 'text-[11px] font-medium text-slate-500 mb-1 block'

/** ריק → undefined. מונע שמירת מחרוזת ריקה כערך סינון. */
const num = (s: string): number | undefined => {
  const t = s.trim()
  if (!t) return undefined
  const n = parseInt(t, 10)
  return Number.isFinite(n) ? n : undefined
}
const str = (s: string): string | undefined => s.trim() || undefined

export interface CommunityOption { value: string; count: number }

export default function AdvancedFilters({
  value,
  onChange,
  onClear,
  communities = [],
  activeCount,
}: {
  value: AdvFilters
  onChange: (next: AdvFilters) => void
  onClear: () => void
  /** הקהילות הנפוצות — לצ'יפס לחיצה. ראו getCommunityOptions. */
  communities?: CommunityOption[]
  /** מספר הסינונים הפעילים — מוצג על הכפתור. */
  activeCount: number
}) {
  // ⚠️ נפתח מעצמו אם יש סינון פעיל (למשל בכניסה מקישור משותף), אחרת
  // המשתמש רואה רשימה מסוננת בלי לדעת למה.
  const [open, setOpen] = useState(activeCount > 0)

  // ── טיוטה מקומית ──
  // 🔴 שדות הטקסט/מספר אינם כותבים ל-URL על כל הקשה: כל כתיבה היא ניווט
  // ושאילתת מסד מחדש. הטיוטה מוחלת ב-onBlur / Enter.
  const [draft, setDraft] = useState<AdvFilters>(value)

  // 🔴 סנכרון לפי *תוכן* ולא לפי זהות האובייקט.
  // value הוא אובייקט חדש בכל רינדור של האב; useEffect עם [value] היה נורה
  // בכל רינדור ומפיל את המסך ללולאה אינסופית (React #301) — בדיוק הבאג
  // שכבר הפיל את מסך החלוקה. המפתח הוא מחרוזת יציבה, ולכן ה-effect רץ רק
  // כשהסינון עצמו באמת השתנה (ניווט אחורה, ניקוי, כניסה מקישור משותף).
  const valueKey = JSON.stringify(value)
  const lastKey = useRef(valueKey)
  useEffect(() => {
    if (lastKey.current === valueKey) return
    lastKey.current = valueKey
    setDraft(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueKey])

  const apply = (patch: Partial<AdvFilters>) => {
    const next = { ...draft, ...patch }
    setDraft(next)
    onChange(next)
  }
  /** החלת הטיוטה כמות שהיא (מ-blur/Enter/כפתור). */
  const applyDraft = () => onChange(draft)

  const ageIsPreset = (p: { min?: number; max?: number }) =>
    draft.ageMin === p.min && draft.ageMax === p.max

  return (
    <div className="flex flex-col gap-2">
      {/* ── שורת הכפתור + סיכום הפעילים ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={`inline-flex items-center gap-1.5 ${CHIP} ${open || activeCount ? CHIP_ON : CHIP_OFF}`}
        >
          <SlidersHorizontal size={13} />
          סינון מתקדם
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-white/25 text-[10px] font-bold tabular-nums">
              {activeCount}
            </span>
          )}
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            title="ניקוי כל הסינון המתקדם"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 transition-colors"
          >
            <RotateCcw size={12} /> ניקוי
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 flex flex-col gap-4">
          {/* ── גיל ── */}
          <div className="flex flex-col gap-2">
            <span className={LABEL}>גיל</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {AGE_PRESETS.map((p) => {
                const on = ageIsPreset(p)
                return (
                  <button
                    key={p.label}
                    type="button"
                    // לחיצה על קבוצה פעילה מבטלת אותה — אחרת אין דרך לחזור ל"כל הגילים".
                    onClick={() => apply(on ? { ageMin: undefined, ageMax: undefined } : { ageMin: p.min, ageMax: p.max })}
                    className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
                  >
                    {p.label}
                  </button>
                )
              })}
              <span className="text-[11px] text-slate-400 mx-1">או טווח:</span>
              <input
                type="number" min={0} max={120} inputMode="numeric"
                placeholder="מגיל"
                value={draft.ageMin ?? ''}
                onChange={(e) => setDraft({ ...draft, ageMin: num(e.target.value) })}
                onBlur={applyDraft}
                onKeyDown={(e) => { if (e.key === 'Enter') applyDraft() }}
                className={`${FIELD} w-20`}
              />
              <span className="text-slate-400 text-xs">–</span>
              <input
                type="number" min={0} max={120} inputMode="numeric"
                placeholder="עד גיל"
                value={draft.ageMax ?? ''}
                onChange={(e) => setDraft({ ...draft, ageMax: num(e.target.value) })}
                onBlur={applyDraft}
                onKeyDown={(e) => { if (e.key === 'Enter') applyDraft() }}
                className={`${FIELD} w-20`}
              />
            </div>
          </div>

          {/* ── קהילה ── */}
          {/* 🔴 חיפוש "מכיל" ולא רשימת בחירה: השדה טקסט חופשי עם 1,838 ערכים
              שונים, מהם 1,478 חד-פעמיים. "ויזניץ" מופיעה גם כ"ויזניץ מרכז"
              וכ"קהילת ויזניץ" — בחירה מדויקת הייתה מחמיצה את רובן. */}
          <div className="flex flex-col gap-2">
            <span className={LABEL}>קהילה</span>
            <div className="relative max-w-xs">
              <input
                type="text"
                placeholder="הקלד שם קהילה (מכיל)…"
                value={draft.community ?? ''}
                onChange={(e) => setDraft({ ...draft, community: e.target.value })}
                onBlur={applyDraft}
                onKeyDown={(e) => { if (e.key === 'Enter') applyDraft() }}
                className={`${FIELD} pl-7`}
              />
              {draft.community && (
                <button
                  type="button"
                  onClick={() => apply({ community: undefined })}
                  title="ניקוי"
                  className="absolute top-1/2 -translate-y-1/2 left-2 text-slate-400 hover:text-red-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            {communities.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {communities.map((c) => {
                  const on = draft.community === c.value
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => apply({ community: on ? undefined : c.value })}
                      title={`${c.value} — ${c.count.toLocaleString('he-IL')} רשומות`}
                      className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
                    >
                      {c.value}
                      <span className="opacity-60 mr-1 tabular-nums">{c.count.toLocaleString('he-IL')}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── מספר ילדים · תאריך הרשמה ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className={LABEL}>מספר ילדים</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number" min={0} max={30} inputMode="numeric" placeholder="מ-"
                  value={draft.kidsMin ?? ''}
                  onChange={(e) => setDraft({ ...draft, kidsMin: num(e.target.value) })}
                  onBlur={applyDraft}
                  onKeyDown={(e) => { if (e.key === 'Enter') applyDraft() }}
                  className={`${FIELD} w-20`}
                />
                <span className="text-slate-400 text-xs">–</span>
                <input
                  type="number" min={0} max={30} inputMode="numeric" placeholder="עד"
                  value={draft.kidsMax ?? ''}
                  onChange={(e) => setDraft({ ...draft, kidsMax: num(e.target.value) })}
                  onBlur={applyDraft}
                  onKeyDown={(e) => { if (e.key === 'Enter') applyDraft() }}
                  className={`${FIELD} w-20`}
                />
              </div>
            </div>
            <div>
              <span className={LABEL}>תאריך הרשמה</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <input
                  type="date"
                  value={draft.regFrom ?? ''}
                  onChange={(e) => apply({ regFrom: str(e.target.value) })}
                  className={`${FIELD} w-36`}
                />
                <span className="text-slate-400 text-xs">–</span>
                <input
                  type="date"
                  value={draft.regTo ?? ''}
                  onChange={(e) => apply({ regTo: str(e.target.value) })}
                  className={`${FIELD} w-36`}
                />
              </div>
            </div>
          </div>

          {/* ── מין · עץ הדורות ── */}
          <div className="flex flex-wrap items-start gap-6">
            <div>
              <span className={LABEL}>מין</span>
              <div className="flex items-center gap-1.5">
                {([
                  { v: undefined, l: 'הכל' },
                  { v: 'male', l: 'זכר' },
                  { v: 'female', l: 'נקבה' },
                ] as const).map((o) => (
                  <button
                    key={o.l} type="button"
                    onClick={() => apply({ gender: o.v })}
                    className={`${CHIP} ${(draft.gender ?? undefined) === o.v ? CHIP_ON : CHIP_OFF}`}
                  >{o.l}</button>
                ))}
              </div>
            </div>
            <div>
              <span className={LABEL}>עץ הדורות</span>
              <div className="flex items-center gap-1.5">
                {([
                  { v: undefined, l: 'הכל' },
                  { v: 'linked', l: 'משויך' },
                  { v: 'unlinked', l: 'חסר בעץ' },
                ] as const).map((o) => (
                  <button
                    key={o.l} type="button"
                    onClick={() => apply({ lineage: o.v })}
                    className={`${CHIP} ${(draft.lineage ?? undefined) === o.v ? CHIP_ON : CHIP_OFF}`}
                  >{o.l}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
