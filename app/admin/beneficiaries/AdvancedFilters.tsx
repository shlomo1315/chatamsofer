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

/** מספר ילדים — קבוצות מוכנות, באותו דפוס של הגיל. */
const KIDS_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: 'ללא', max: 0 },
  { label: '1–3', min: 1, max: 3 },
  { label: '4–6', min: 4, max: 6 },
  { label: '7–9', min: 7, max: 9 },
  { label: '10+', min: 10 },
]

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 סגנון אחיד לכל הפאנל.
//
// ⚠️ הכפתורים כאן זהים לאלה שבסרגל הראשי (מצב משפחתי, מייל) — אותה
// עיגוליות, אותו גודל, אותם צבעים. פאנל שנראה אחרת מהסרגל שמעליו נקרא
// כאזור זר, והמשתמש מחפש בו מחדש בכל פעם.
//
// שני מצבי "פעיל": CHIP_ON לבחירה יחידה (הכל/זכר/נקבה), ו-CHIP_PICK
// לסימון בתוך קבוצה — בדיוק כמו ההבחנה בסרגל מצב משפחתי.
// ─────────────────────────────────────────────────────────────────────────────
const CHIP = 'px-3 py-1.5 rounded-full text-xs font-medium border transition-all'
const CHIP_ON = 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
const CHIP_PICK = 'bg-indigo-100 border-indigo-300 text-indigo-700 shadow-sm'
const CHIP_OFF = 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600'
const FIELD = 'px-2.5 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300'

/**
 * שורת סינון אחת: תווית ברוחב קבוע מימין, והפקדים אחריה.
 *
 * 🔴 התווית ברוחב קבוע (w-24) — זה כל ההבדל. קודם כל קבוצה סודרה אחרת
 * (חלק זו על זו, חלק ב-grid של שתי עמודות), והעין נאלצה לחפש את תחילת
 * כל שורה מחדש. עמודה אחת ישרה הופכת את הפאנל לרשימה שנסרקת במבט.
 */
function Row({ label, children, onReset }: {
  label: string
  children: React.ReactNode
  onReset?: () => void
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <span className="w-24 shrink-0 pt-1.5 text-xs font-semibold text-slate-600">{label}</span>
      <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">{children}</div>
      {/* ⚠️ ניקוי לכל שורה בנפרד: "ניקוי הכל" לבדו הכריח לוותר על כל
          הסינון כדי לשנות קריטריון אחד. מוצג רק כשיש מה לנקות. */}
      {onReset && (
        <button
          type="button" onClick={onReset} title={`ניקוי ${label}`}
          className="shrink-0 mt-1 text-slate-300 hover:text-red-600 transition-colors"
        ><X size={13} /></button>
      )}
    </div>
  )
}

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
  const kidsIsPreset = (p: { min?: number; max?: number }) =>
    draft.kidsMin === p.min && draft.kidsMax === p.max

  // האם לשורה יש מה לנקות — קובע אם כפתור ה-✗ שלה מוצג.
  const hasAge = draft.ageMin !== undefined || draft.ageMax !== undefined
  const hasKids = draft.kidsMin !== undefined || draft.kidsMax !== undefined
  const hasReg = !!draft.regFrom || !!draft.regTo

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
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm px-4 py-1">
          {/* ── גיל ── */}
          <Row label="גיל" onReset={hasAge ? () => apply({ ageMin: undefined, ageMax: undefined }) : undefined}>
            {AGE_PRESETS.map((p) => {
              const on = ageIsPreset(p)
              return (
                <button
                  key={p.label}
                  type="button"
                  // לחיצה על קבוצה פעילה מבטלת אותה — אחרת אין דרך לחזור ל"כל הגילים".
                  onClick={() => apply(on ? { ageMin: undefined, ageMax: undefined } : { ageMin: p.min, ageMax: p.max })}
                  className={`${CHIP} ${on ? CHIP_PICK : CHIP_OFF}`}
                >
                  {p.label}
                </button>
              )
            })}
            <span className="mx-1 h-4 w-px bg-slate-200" />
            <input
              type="number" min={0} max={120} inputMode="numeric"
              placeholder="מגיל"
              value={draft.ageMin ?? ''}
              onChange={(e) => setDraft({ ...draft, ageMin: num(e.target.value) })}
              onBlur={applyDraft}
              onKeyDown={(e) => { if (e.key === 'Enter') applyDraft() }}
              className={`${FIELD} w-[4.5rem]`}
            />
            <span className="text-slate-400 text-xs">–</span>
            <input
              type="number" min={0} max={120} inputMode="numeric"
              placeholder="עד"
              value={draft.ageMax ?? ''}
              onChange={(e) => setDraft({ ...draft, ageMax: num(e.target.value) })}
              onBlur={applyDraft}
              onKeyDown={(e) => { if (e.key === 'Enter') applyDraft() }}
              className={`${FIELD} w-[4.5rem]`}
            />
          </Row>

          {/* ── מספר ילדים ── */}
          {/* ⚠️ קבוצות מוכנות כמו בגיל: קודם היו כאן שני שדות מספר בלבד,
              והשורה נראתה אחרת מכל השאר בלי סיבה. */}
          <Row label="מספר ילדים" onReset={hasKids ? () => apply({ kidsMin: undefined, kidsMax: undefined }) : undefined}>
            {KIDS_PRESETS.map((p) => {
              const on = kidsIsPreset(p)
              return (
                <button
                  key={p.label} type="button"
                  onClick={() => apply(on ? { kidsMin: undefined, kidsMax: undefined } : { kidsMin: p.min, kidsMax: p.max })}
                  className={`${CHIP} ${on ? CHIP_PICK : CHIP_OFF}`}
                >{p.label}</button>
              )
            })}
            <span className="mx-1 h-4 w-px bg-slate-200" />
            <input
              type="number" min={0} max={30} inputMode="numeric" placeholder="מ-"
              value={draft.kidsMin ?? ''}
              onChange={(e) => setDraft({ ...draft, kidsMin: num(e.target.value) })}
              onBlur={applyDraft}
              onKeyDown={(e) => { if (e.key === 'Enter') applyDraft() }}
              className={`${FIELD} w-[4.5rem]`}
            />
            <span className="text-slate-400 text-xs">–</span>
            <input
              type="number" min={0} max={30} inputMode="numeric" placeholder="עד"
              value={draft.kidsMax ?? ''}
              onChange={(e) => setDraft({ ...draft, kidsMax: num(e.target.value) })}
              onBlur={applyDraft}
              onKeyDown={(e) => { if (e.key === 'Enter') applyDraft() }}
              className={`${FIELD} w-[4.5rem]`}
            />
          </Row>

          {/* ── מין ── */}
          <Row label="מין">
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
          </Row>

          {/* ── עץ הדורות ── */}
          <Row label="עץ הדורות">
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
          </Row>

          {/* ── קהילה ── */}
          {/* 🔴 חיפוש "מכיל" ולא רשימת בחירה: השדה טקסט חופשי עם 1,838 ערכים
              שונים, מהם 1,478 חד-פעמיים. "ויזניץ" מופיעה גם כ"ויזניץ מרכז"
              וכ"קהילת ויזניץ" — בחירה מדויקת הייתה מחמיצה את רובן. */}
          <Row label="קהילה" onReset={draft.community ? () => apply({ community: undefined }) : undefined}>
            <input
              type="text"
              placeholder="הקלד שם קהילה (מכיל)…"
              value={draft.community ?? ''}
              onChange={(e) => setDraft({ ...draft, community: e.target.value })}
              onBlur={applyDraft}
              onKeyDown={(e) => { if (e.key === 'Enter') applyDraft() }}
              className={`${FIELD} w-52`}
            />
            {communities.length > 0 && (
              <>
                <span className="mx-1 h-4 w-px bg-slate-200" />
                {communities.map((c) => {
                  const on = draft.community === c.value
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => apply({ community: on ? undefined : c.value })}
                      title={`${c.value} — ${c.count.toLocaleString('he-IL')} רשומות`}
                      className={`${CHIP} ${on ? CHIP_PICK : CHIP_OFF}`}
                    >
                      {c.value}
                      <span className="opacity-60 mr-1 tabular-nums">{c.count.toLocaleString('he-IL')}</span>
                    </button>
                  )
                })}
              </>
            )}
          </Row>

          {/* ── תאריך הרשמה ── */}
          <Row label="תאריך הרשמה" onReset={hasReg ? () => apply({ regFrom: undefined, regTo: undefined }) : undefined}>
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
          </Row>
        </div>
      )}
    </div>
  )
}
