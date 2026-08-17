// ─────────────────────────────────────────────────────────────────────────────
// טבלת נרשמי חלוקת חגים — קומפוננטה *אחת* משותפת למסך הניהול ולדף השיתוף,
// כדי ששתיהן יהיו זהות בדיוק ולא יתפצלו.
//
// 🔴 אין גלילה לרוחב. בשום מצב. (הוראה חד-משמעית מהמשתמש, 18.08.)
//
// ⚠️ קודם היה כאן `w-max` + `overflow-x-auto` — הטבלה התרחבה חופשי וגללה
// בתוך עצמה. הדף אמנם לא גלל, אבל העמודות האחרונות ("תאריך", "הודעה")
// נחתכו ולא נראו. גלילה בתוך הכרטיס היא עדיין גלילה — והמשתמש פסל אותה.
//
// ✅ הפתרון: **איחוד עמודות במקום הרחבה**. 16 עמודות הפכו ל-9, על ידי
// צימוד ערכים שממילא נקראים יחד לתא אחד בשתי שורות (ראשי מודגש + משני
// קטן ואפור מתחתיו):
//     שם משפחה + שם פרטי  ·  ת"ז + בן/בת זוג  ·  טלפון + מייל
//     עיר + כתובת  ·  גיל + ילדים  ·  ערוץ + תאריך
// זה גם קריא יותר: הזוגות האלה שייכים זה לזה מבחינת מי שקורא את השורה.
//
// ⚠️ `table-fixed` + אחוזים נוסה בעבר ונכשל — דוחס ושובר תוכן. כאן
// table-auto נשאר, אבל מספר העמודות קטן מספיק כדי שייכנס.
// ─────────────────────────────────────────────────────────────────────────────
'use client'
import Link from 'next/link'
import { Monitor, Phone, Mail, CreditCard, Pencil, Check, X, Loader2 } from 'lucide-react'
import { SOURCE_LABEL, type RegisterSource } from '@/lib/distributionSources'
import { useIncrementalRows } from '@/lib/useIncrementalRows'

export interface HolidayRow {
  id: string
  source: RegisterSource
  registered_at: string | null
  phone: string | null
  notified_at: string | null
  notify_error: string | null
  beneficiary_id: string | null
  approval_status: 'pending' | 'approved' | 'rejected'
  card_number: string | null
  card_linked_at: string | null
  card_link_error?: string | null
  name: string
  /** ⚠️ נשמרים בנפרד ולא מפוצלים מ-name: פיצול לפי רווח היה שובר שמות
   *  משפחה מורכבים ("בן דוד", "אבו חצירא"). */
  family_name?: string | null
  first_name?: string | null
  id_number: string | null
  spouse_name: string | null
  ben_phone: string | null
  email: string | null
  address: string | null
  city: string | null
  age: number | null
  children_count: number | null
}

const APPROVAL_LABEL: Record<string, string> = { pending: 'ממתין לאישור', approved: 'מאושר', rejected: 'נדחה' }
const APPROVAL_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-green-50 text-green-800 border-green-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
}
const SOURCE_ICON: Record<RegisterSource, typeof Monitor> = {
  portal: Monitor, phone: Phone, email: Mail, nedarim: CreditCard, admin: Pencil,
}

// עמודות משתנות לפי מצב: במסך הניהול (canEdit) יש checkbox ופעולות אישור/דחייה
// והודעה; בדף השיתוף (view-only) אין. הסכום מוצג רק אם amountPerFamily קיים.
export interface HolidayTableControls {
  canEdit?: boolean
  selected?: Set<string>
  toggleRow?: (id: string) => void
  allShownSelected?: boolean
  toggleAllShown?: () => void
  busyId?: string | null
  setApprovalFor?: (ids: string[], status: 'approved' | 'rejected') => void
  clearCard?: (id: string) => void
  showMessage?: boolean     // עמודת "הודעה" (נשלח/נכשל) — רק בניהול
  hideApproval?: boolean    // הסתרת עמודת "אישור הבקשה" — בדף השיתוף
  hideCard?: boolean        // הסתרת עמודת "כרטיס" — בדף השיתוף
  hideSource?: boolean      // הסתרת עמודת "ערוץ" — בדף השיתוף
}

export default function HolidayRecipientsTable({
  rows, amountPerFamily, fmtDateTime, fmtCur, controls = {},
}: {
  rows: HolidayRow[]
  amountPerFamily: number | null
  fmtDateTime: (d?: string | null) => string
  fmtCur: (n: number) => string
  controls?: HolidayTableControls
}) {
  const { canEdit = false, selected, toggleRow, allShownSelected, toggleAllShown,
    busyId, setApprovalFor, clearCard, showMessage = false,
    hideApproval = false, hideCard = false, hideSource = false } = controls

  // ⚡ גלילה אינסופית: בחלוקת חג יש אלפי נרשמים, ורינדור כולם בבת אחת בנה
  // עשרות אלפי תאים ב-DOM והקפיא את הדפדפן — גם בכל סינון/מיון מחדש. מרנדרים
  // מנה ומוסיפים בגלילה. הנתונים כבר בזיכרון; אין כאן שאילתות נוספות.
  // ⚠️ הקריאה חייבת להיות לפני כל return מוקדם (חוקי ה-hooks).
  const { rows: visibleRows, sentinelRef, hasMore, shown, total } = useIncrementalRows(rows)

  if (!rows.length) {
    return <p className="px-4 py-10 text-center text-slate-400 text-sm font-medium">אין נרשמים לחלוקה זו</p>
  }

  return (
    // ⚠️ w-full ולא w-max, ובלי overflow-x: הטבלה חייבת להיכנס לרוחב הזמין.
    <div className="w-full">
      <table className="w-full table-auto text-[12px] border-collapse">
        <thead className="bg-slate-50 text-slate-500">
          <tr className="[&>th]:px-2.5 [&>th]:py-2.5 [&>th]:font-bold [&>th]:text-right [&>th]:border-l [&>th]:border-slate-200 [&>th:last-child]:border-l-0">
            {canEdit && (
              <th>
                <input type="checkbox" checked={!!allShownSelected} onChange={toggleAllShown}
                  className="h-4 w-4 accent-indigo-600" aria-label="סימון כל המוצגים" />
              </th>
            )}
            {/* ⚠️ כותרות מאוחדות — כל אחת מתארת את *שתי* השורות שבתא. */}
            <th>שם ובן/בת זוג</th>
            <th>ת״ז</th>
            {!hideApproval && <th>אישור הבקשה</th>}
            {!hideCard && <th>כרטיס</th>}
            <th>טלפון ומייל</th>
            <th>עיר וכתובת</th>
            <th className="text-center">גיל · ילדים</th>
            <th>{hideSource ? 'תאריך רישום' : 'ערוץ ותאריך'}</th>
            {amountPerFamily != null && <th>סכום</th>}
            {showMessage && <th>הודעה</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {visibleRows.map(r => {
            const I = SOURCE_ICON[r.source] ?? Pencil
            return (
              <tr key={r.id} className="hover:bg-indigo-50/40 [&>td]:px-2.5 [&>td]:py-2 [&>td]:border-l [&>td]:border-slate-100 [&>td:last-child]:border-l-0 align-middle">
                {canEdit && (
                  <td className="w-8">
                    <input type="checkbox" checked={!!selected?.has(r.id)} onChange={() => toggleRow?.(r.id)}
                      className="h-4 w-4 accent-indigo-600" aria-label={`סימון ${r.name}`} />
                  </td>
                )}
                {/* ── שם משפחה + פרטי, ומתחת בן/בת הזוג ── */}
                {/* ⚠️ הקישור לכרטסת על השם בלבד: שני קישורים לאותו יעד
                    בשורה אחת מייצרים לחיצה כפולה ומקשים על סימון טקסט. */}
                <td className="max-w-[190px]">
                  <div className="truncate font-semibold text-slate-800"
                    title={[r.family_name || r.name, r.first_name].filter(Boolean).join(' ')}>
                    {r.beneficiary_id && canEdit
                      ? <Link href={`/admin/beneficiaries/${r.beneficiary_id}`} className="hover:text-indigo-700 hover:underline">
                          {[r.family_name || r.name, r.first_name].filter(Boolean).join(' ')}
                        </Link>
                      : [r.family_name || r.name, r.first_name].filter(Boolean).join(' ')}
                  </div>
                  {r.spouse_name && (
                    <div className="truncate text-[11px] text-slate-500" title={r.spouse_name}>{r.spouse_name}</div>
                  )}
                </td>
                <td className="font-mono text-slate-600 ltr-num whitespace-nowrap">{r.id_number ?? '—'}</td>
                {!hideApproval && (
                <td>
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${APPROVAL_STYLE[r.approval_status]}`}>
                      {APPROVAL_LABEL[r.approval_status]}
                    </span>
                    {canEdit && (busyId === r.id
                      ? <Loader2 size={13} className="animate-spin text-slate-400" />
                      : <>
                          {r.approval_status !== 'approved' && (
                            <button type="button" title="אישור הבקשה" onClick={() => setApprovalFor?.([r.id], 'approved')}
                              className="rounded-lg p-1 text-green-700 hover:bg-green-50"><Check size={14} /></button>
                          )}
                          {r.approval_status !== 'rejected' && (
                            <button type="button" title="דחיית הבקשה" onClick={() => setApprovalFor?.([r.id], 'rejected')}
                              className="rounded-lg p-1 text-rose-600 hover:bg-rose-50"><X size={14} /></button>
                          )}
                        </>
                    )}
                  </div>
                </td>
                )}
                {!hideCard && (
                <td>
                  {r.card_linked_at ? (
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[12px] text-slate-700 ltr-num">{r.card_number}</span>
                      <span className="text-[11px] font-bold text-green-700">✓</span>
                      {canEdit && (busyId === r.id
                        ? <Loader2 size={12} className="animate-spin text-slate-400" />
                        : <button type="button" title="ניקוי השיוך" onClick={() => clearCard?.(r.id)}
                            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><X size={12} /></button>)}
                    </div>
                  ) : r.card_link_error ? (
                    <span className="text-[11px] font-bold text-rose-700" title={r.card_link_error}>נכשל</span>
                  ) : (
                    <span className="text-[11px] text-slate-400">{r.approval_status === 'approved' ? 'ממתין לשיוך' : '—'}</span>
                  )}
                </td>
                )}
                {/* ── טלפון ומייל ── */}
                {/* ⚠️ text-right מפורש על המייל: dir="ltr" הופך את ברירת
                    המחדל (start) לשמאל, והוא היה נצמד לצד ההפוך מהכותרת. */}
                <td className="max-w-[180px]">
                  <div className="font-mono text-slate-700 ltr-num whitespace-nowrap">{r.ben_phone ?? r.phone ?? '—'}</div>
                  {r.email && (
                    <div className="truncate text-[11px] text-slate-500 text-right" dir="ltr" title={r.email}>{r.email}</div>
                  )}
                </td>
                {/* ── עיר וכתובת ── */}
                <td className="max-w-[170px]">
                  <div className="truncate text-slate-700" title={r.city ?? ''}>{r.city ?? '—'}</div>
                  {r.address && (
                    <div className="truncate text-[11px] text-slate-500" title={r.address}>{r.address}</div>
                  )}
                </td>
                {/* ── גיל · ילדים ── */}
                {/* ⚠️ שני מספרים קצרים באותו תא: כעמודות נפרדות הם בזבזו
                    רוחב על הכותרת ולא על התוכן. */}
                <td className="text-center whitespace-nowrap">
                  <span className="text-slate-700 ltr-num">{r.age ?? '—'}</span>
                  <span className="text-slate-300 mx-1">·</span>
                  <span className="text-slate-700 ltr-num">{r.children_count ?? '—'}</span>
                </td>
                {/* ── ערוץ ותאריך ── */}
                <td className="whitespace-nowrap">
                  {!hideSource && (
                    <div className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                      <I size={11} /> {SOURCE_LABEL[r.source]}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500 ltr-num">{fmtDateTime(r.registered_at)}</div>
                </td>
                {amountPerFamily != null && (
                  <td className="font-bold text-emerald-700 ltr-num">{amountPerFamily ? fmtCur(amountPerFamily) : '—'}</td>
                )}
                {showMessage && (
                  <td>
                    {r.notified_at ? (
                      <span className="text-[11px] font-bold text-green-700" title={fmtDateTime(r.notified_at)}>
                        ✓ נשלח{r.notify_error ? <span className="text-amber-700" title={r.notify_error}> ⚠</span> : null}
                      </span>
                    ) : r.notify_error ? (
                      <span className="text-[11px] font-bold text-rose-700" title={r.notify_error}>נכשל</span>
                    ) : (
                      <span className="text-[11px] font-bold text-slate-400">—</span>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
          {/* זקיף הגלילה — כשהוא נכנס לתצוגה נטענת המנה הבאה. colSpan נדיב
              במכוון: מספר העמודות משתנה לפי controls, ועודף אינו מזיק. */}
          {hasMore && (
            <tr ref={sentinelRef as React.Ref<HTMLTableRowElement>}>
              <td colSpan={20} className="px-3 py-4 text-center text-slate-400 text-[11px] font-medium">
                <Loader2 size={14} className="inline animate-spin ml-1.5" />
                טוען עוד… ({shown.toLocaleString()} מתוך {total.toLocaleString()})
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
