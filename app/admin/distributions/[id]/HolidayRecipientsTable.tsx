// ─────────────────────────────────────────────────────────────────────────────
// טבלת נרשמי חלוקת חגים — קומפוננטה *אחת* משותפת למסך הניהול ולדף השיתוף,
// כדי ששתיהן יהיו זהות בדיוק ולא יתפצלו.
//
// 🔴 כל נתון בעמודה נפרדת. איחוד עמודות ("שם ובן/בת זוג", "טלפון ומייל")
// נוסה ונפסל: הוא ערבב ערכים שונים בתא אחד והפך את הטבלה לקשה לסריקה.
//
// 🔴 ואין גלילה לרוחב. שתי הדרישות יחד נפתרות ב**בורר עמודות**: המשתמש
// בוחר מה להציג, וכל מה שמוצג נכנס לרוחב המסך. זו הדרך היחידה שמכבדת את
// שתיהן — 16 עמודות קבועות אינן יכולות להיכנס, ואיחוד פוגע בקריאוּת.
// ─────────────────────────────────────────────────────────────────────────────
'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Monitor, Phone, Mail, CreditCard, Pencil, Check, X, Loader2, Wallet } from 'lucide-react'
import { SOURCE_LABEL, type RegisterSource } from '@/lib/distributionSources'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'
import { useIncrementalRows } from '@/lib/useIncrementalRows'
import CenterCellEditor, { type CenterOption } from './CenterCellEditor'
import { useResizableColumns } from '@/components/ui/ResizableTable'
import ApprovalLabelTag, { type ApprovalLabel } from '@/components/ui/ApprovalLabelTag'

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
  /** תווית סיבת אישור — קיימת רק לאישורים חריגים; null אצל הרוב המוחלט. */
  approval_label?: ApprovalLabel | null
  spouse_name: string | null
  ben_phone: string | null
  email: string | null
  address: string | null
  city: string | null
  age: number | null
  children_count: number | null
  /** מוקד החלוקה שנבחר — בטלפון, בממשק או ידנית. */
  center_id?: string | null
  center_name?: string | null
  center_source?: string | null
  /** מצב טעינת ה-500₪. ⚠️ הטעינה רצה רק מכפתור מפורש. */
  load_status?: string | null
  load_error?: string | null
}

const APPROVAL_LABEL: Record<string, string> = { pending: 'ממתין לאישור', approved: 'מאושר', rejected: 'נדחה' }

// ⚠️ תוויות ולא הקודים הגולמיים: תפריט הסינון מציג את מה שהעמודה מציגה,
// ורשימה של loaded/failed/pending הייתה מחייבת לתרגם בראש.
const LOAD_LABEL: Record<string, string> = {
  loaded: 'נטען', pending: 'בתהליך', failed: 'נכשל', '': 'טרם',
}
const APPROVAL_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-green-50 text-green-800 border-green-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
}
const SOURCE_ICON: Record<RegisterSource, typeof Monitor> = {
  portal: Monitor, phone: Phone, email: Mail, nedarim: CreditCard, admin: Pencil,
}

export interface HolidayTableControls {
  canEdit?: boolean
  selected?: Set<string>
  toggleRow?: (id: string) => void
  allShownSelected?: boolean
  toggleAllShown?: () => void
  busyId?: string | null
  setApprovalFor?: (ids: string[], status: 'approved' | 'rejected') => void
  clearCard?: (id: string) => void
  /** 🔴 טעינת כרטיס בודד — כסף אמיתי. הקורא אחראי לאישור לפני הקריאה. */
  loadCard?: (id: string) => void
  /** מזהה השורה שנטענת כרגע — כדי לנעול את הכפתור שלה בלבד. */
  loadingId?: string | null
  showMessage?: boolean
  hideApproval?: boolean
  hideCard?: boolean
  hideSource?: boolean
  /** 🔴 שיוך מוקד ידני — המוקדים הפתוחים בחלוקה. ריק/חסר = העמודה לקריאה בלבד.
      ⚠️ נטענים פעם אחת ברמת הטבלה: בקשה לכל שורה על 6,000 שורות היא בדיוק
      העומס שהדפדוף בא למנוע. */
  centerOptions?: CenterOption[]
  /** נקרא אחרי שיוך שנשמר — הקורא מעדכן את השורה במקום לטעון הכל מחדש. */
  onCenterAssigned?: (
    recipientId: string,
    next: { center_id: string | null; center_name: string | null; center_source: string | null },
  ) => void
}

// ── הגדרת העמודות ──
// ⚠️ מקור אמת יחיד: הכותרת, התא ומצב ברירת המחדל יושבים יחד. כשהם נפרדו
// לשלוש רשימות, הוספת עמודה במקום אחד ושכחה באחר הסיטה את כל השורה.
type ColKey =
  | 'family_name' | 'first_name' | 'id_number' | 'approval_label' | 'spouse_name'
  | 'approval' | 'card' | 'phone' | 'email' | 'address' | 'city'
  | 'age' | 'children' | 'source' | 'registered_at' | 'amount' | 'message'
  | 'center' | 'load'

// ⚠️ ColDef מיובא מ-components/ui/TableColumns — הטיפוס המקומי שהיה כאן
// לא כלל value/kind/filterable, ולכן לא איפשר מיון וסינון מהכותרת.

// 🔴 value() חובה בכל עמודה שמרנדרת JSX — בלעדיה המיון עובד על אובייקט
// React ומחזיר סדר אקראי שנראה בדיוק כמו מיון תקין.
//
// ⚠️ kind + filterable רק לעמודות שהן *קבוצת ערכים סגורה*: מוקד, עיר,
// ערוץ, אישור וטעינה. שם, ת"ז וטלפון ייחודיים לכל שורה — תפריט סינון
// שלהם היה רשימה בת 6,000 פריטים.
const COLUMNS: ColDef<ColKey, HolidayRow>[] = [
  { key: 'family_name', label: 'שם משפחה', def: true, value: r => r.family_name ?? r.name ?? null },
  { key: 'first_name', label: 'שם פרטי', def: true, value: r => r.first_name ?? null },
  { key: 'id_number', label: 'ת״ז', def: true, kind: 'number', value: r => r.id_number ?? null },
  // ⚠️ עמודה משלה בנוסף לתג שליד שם המשפחה — ריקה אצל הרוב המוחלט.
  { key: 'approval_label', label: 'סיבת אישור', def: true, kind: 'enum', filterable: true,
    value: r => r.approval_label?.name ?? null },
  { key: 'spouse_name', label: 'בן/בת זוג', def: false, value: r => r.spouse_name ?? null },
  { key: 'approval', label: 'אישור הבקשה', def: true, kind: 'enum', filterable: true,
    value: r => APPROVAL_LABEL[r.approval_status] ?? null },
  { key: 'card', label: 'כרטיס', def: false, value: r => r.card_number ?? null },
  { key: 'phone', label: 'טלפון', def: true, value: r => r.ben_phone ?? r.phone ?? null },
  { key: 'email', label: 'מייל', def: false, value: r => r.email ?? null },
  { key: 'address', label: 'כתובת', def: false, value: r => r.address ?? null },
  { key: 'city', label: 'עיר', def: true, kind: 'enum', filterable: true, value: r => r.city ?? null },
  // ⚠️ מוצגת כברירת מחדל: זו העמודה שכל עבודת החלוקה נשענת עליה.
  // 🔴 filterable — "מי טרם בחר מוקד" היא השאלה המרכזית בשלב הזה.
  { key: 'center', label: 'מוקד חלוקה', def: true, kind: 'enum', filterable: true,
    value: r => r.center_name ?? 'טרם נבחר' },
  // ⚠️ הסטטוס והפעולה באותה עמודה ולא בשתיים: "נטען?" ו"טען" הם אותה
  // שאלה משני צדדים, והפרדתם מכריחה לקרוא שתי עמודות כדי לדעת מה לעשות.
  { key: 'load', label: 'טעינה', def: true, kind: 'enum', filterable: true,
    value: r => LOAD_LABEL[r.load_status ?? ''] ?? 'טרם' },
  { key: 'age', label: 'גיל', def: false, align: 'center', kind: 'number', value: r => r.age },
  { key: 'children', label: 'ילדים', def: true, align: 'center', kind: 'number', value: r => r.children_count },
  { key: 'source', label: 'ערוץ', def: true, kind: 'enum', filterable: true,
    value: r => SOURCE_LABEL[r.source] ?? r.source },
  // ⚠️ ממוין לפי התאריך הגולמי ולא לפי התווית: תאריך מפורמט ממוין
  // אלפביתית ולא כרונולוגית.
  { key: 'registered_at', label: 'תאריך רישום', def: true, kind: 'date', value: r => r.registered_at },
  // ⚠️ הסכום זהה לכל השורות (amountPerFamily) — value מחזיר null כדי
  // שלא ייווצר תפריט סינון בן ערך אחד.
  { key: 'amount', label: 'סכום', def: true, value: () => null },
  { key: 'message', label: 'הודעה', def: false, value: () => null },
]

export default function HolidayRecipientsTable({
  rows, amountPerFamily, fmtDateTime, fmtCur, controls = {}, paginated = false,
  onRowsChange, pageSlice,
}: {
  rows: HolidayRow[]
  amountPerFamily: number | null
  fmtDateTime: (d?: string | null) => string
  fmtCur: (n: number) => string
  controls?: HolidayTableControls
  /**
   * ⚠️ הגלילה האינסופית מכובה — הדפדוף מנוהל בחוץ.
   * בלי זה שתי המכניקות רצות יחד: העמוד מוגבל ל-50 שורות, והגלילה
   * האינסופית "טוענת עוד" מתוכן — כלומר כפתור שלא עושה כלום.
   * דף השיתוף ממשיך בגלילה אינסופית (ברירת המחדל).
   */
  paginated?: boolean
  /**
   * 🔴 הודעה לקורא על השורות שנותרו אחרי המיון והסינון של הכותרת.
   *
   * ⚠️ בלי זה הקורא חייב לדפדף *לפני* הטבלה, והטבלה מקבלת עמוד אחד —
   * כלומר המסננים נבנים מ-50 שורות מתוך אלפים. כך בדיוק קרה שחיפוש
   * "שמרלר" הציג "טרם נבחר 5 · בני ברק 1": המונים ספרו את הדף, לא
   * את הרשימה. הסדר הנכון הוא visible → tc.rows → pg.rows.
   */
  onRowsChange?: (rows: HolidayRow[]) => void
  /** חיתוך לעמוד — מוחל *אחרי* המיון והסינון. */
  pageSlice?: (rows: HolidayRow[]) => HolidayRow[]
}) {
  const { canEdit = false, selected, toggleRow, allShownSelected, toggleAllShown,
    busyId, setApprovalFor, clearCard, loadCard, loadingId, showMessage = false,
    hideApproval = false, hideCard = false, hideSource = false,
    centerOptions, onCenterAssigned } = controls

  // 🔴 המנגנון המשותף (useTableColumns) ולא מימוש מקומי: הוא מביא איתו
  // מיון וסינון בכותרת — בדיוק כמו ב-17 הטבלאות האחרות. הטבלה הזו הייתה
  // היחידה בלי זה, ובה דווקא השאלות הכי שכיחות ("מי טרם בחר מוקד", "מי
  // בבני ברק") דרשו לסרוק אלפי שורות בעין.
  //
  // ⚠️ העמודות שהקורא הסתיר (dept השיתוף) יורדות מהבורר עצמו ולא רק
  // מהטבלה — אחרת המשתמש מסמן עמודה ושום דבר לא קורה.
  const tc = useTableColumns<ColKey, HolidayRow>('holiday-recipients', COLUMNS, {
    extraCols: canEdit ? 1 : 0,
    filter: c => {
      if (c.key === 'approval' && hideApproval) return false
      if (c.key === 'card' && hideCard) return false
      if (c.key === 'source' && hideSource) return false
      if (c.key === 'message' && !showMessage) return false
      if (c.key === 'amount' && amountPerFamily == null) return false
      return true
    },
    // ⚠️ mode:'client' — הקורא מעביר את השורות המסוננות כבר, והמיון
    // והסינון רצים עליהן בזיכרון. השרת אינו מעורב.
    sortFilter: { mode: 'client', rows },
  })
  const shown = tc.shown

  // 🔴 גרירת רוחב עמודות (כמו באקסל) — רכיב מערכתי משותף לכל הטבלאות.
  // ⚠️ המזהה כולל את מספר העמודות הנראות: הסתרת עמודה מזיזה את כל
  // האינדקסים, ורוחב שנשמר למצב אחר היה נדבק לעמודה הלא נכונה.
  const rt = useResizableColumns(`holiday-recipients-${shown.length}${canEdit ? '-e' : ''}`, shown.length + (canEdit ? 1 : 0))

  // ⚠️ פירוק ישיר ולא גישה דרך אובייקט: האובייקט שה-hook מחזיר מכיל גם
  // sentinelRef, וכלל react-hooks/refs סימן *כל* גישה דרכו כקריאת ref
  // בזמן רינדור — כולל shown/total שהם מספרים רגילים. הפירוק מפריד ביניהם.
  // 🔴 tc.rows ולא rows: המיון והסינון מהכותרת חלים כאן. שימוש ב-rows
  // הגולמי היה מציג טבלה שמתעלמת מהסינון שהמשתמש הרגע בחר.
  const { rows: incRows, sentinelRef: incSentinel, hasMore: incHasMore, shown: incShown, total: incTotal } =
    useIncrementalRows(tc.rows)

  // 🔴 מדווח לקורא מה שרד את המיון והסינון, כדי שהוא ידפדף על *התוצאה*.
  //
  // ⚠️ בתוך useEffect ולא בגוף הרינדור: קריאה ל-setState של ההורה תוך כדי
  // רינדור הבן היא בדיוק לולאת הרינדור שהפילה את המסך הזה בעבר.
  // ⚠️ התלות היא באורך ובמזהה האחרון ולא במערך: tc.rows הוא מערך חדש
  // בכל רינדור, ותלות בו מפעילה את ה-effect לנצח.
  const rowsSig = `${tc.rows.length}:${tc.rows[tc.rows.length - 1]?.id ?? ''}`
  useEffect(() => {
    onRowsChange?.(tc.rows)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsSig])

  // במצב מדופדף החיתוך לעמוד קורה *אחרי* המיון והסינון, לא לפניהם.
  const visibleRows = paginated ? (pageSlice ? pageSlice(tc.rows) : tc.rows) : incRows
  const sentinelRef = incSentinel
  const hasMore = paginated ? false : incHasMore
  const shownCount = incShown
  const total = incTotal

  if (!rows.length) {
    return <p className="px-4 py-10 text-center text-slate-400 text-sm font-medium">אין נרשמים לחלוקה זו</p>
  }

  const cell = (c: ColDef, r: HolidayRow) => {
    switch (c.key) {
      case 'family_name':
        return (
          <span className="inline-flex items-center gap-1.5 flex-wrap font-semibold text-slate-800">
            {r.beneficiary_id && canEdit
              ? <Link href={`/admin/beneficiaries/${r.beneficiary_id}`} className="hover:text-indigo-700 hover:underline">
                  {r.family_name || r.name}
                </Link>
              : (r.family_name || r.name)}
            {/* ⚠️ גם ליד השם וגם בעמודה: מי שכיבה את העמודה עדיין צריך לדעת
                שהנרשם אינו צאצא רגיל. */}
            <ApprovalLabelTag label={r.approval_label} size="xs" />
          </span>
        )
      case 'first_name': return <span className="text-slate-700">{r.first_name || '—'}</span>
      case 'id_number': return <span className="font-mono text-slate-600 ltr-num">{r.id_number ?? '—'}</span>
      case 'approval_label':
        return r.approval_label
          ? <ApprovalLabelTag label={r.approval_label} size="xs" />
          : <span className="text-[11px] text-slate-400">—</span>
      case 'spouse_name': return <span className="text-slate-600">{r.spouse_name ?? '—'}</span>
      case 'approval':
        return (
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
        )
      case 'card':
        if (r.card_linked_at) return (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[12px] text-slate-700 ltr-num">{r.card_number}</span>
            <span className="text-[11px] font-bold text-green-700">✓</span>
            {canEdit && (busyId === r.id
              ? <Loader2 size={12} className="animate-spin text-slate-400" />
              : <button type="button" title="ניקוי השיוך" onClick={() => clearCard?.(r.id)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"><X size={12} /></button>)}
          </div>
        )
        if (r.card_link_error) return <span className="text-[11px] font-bold text-rose-700" title={r.card_link_error}>נכשל</span>
        return <span className="text-[11px] text-slate-400">{r.approval_status === 'approved' ? 'ממתין לשיוך' : '—'}</span>
      case 'load': {
        // ⚠️ אותם כללים כמו eligibleForLoad בשרת: מאושר + יש ת"ז + טרם
        // נטען. כפתור שמוצג למי שאינו זכאי מייצר לחיצה שתמיד נכשלת.
        if (r.load_status === 'loaded') return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
            <Check size={12} className="flex-shrink-0" /> נטען
          </span>
        )
        if (r.load_status === 'pending') return (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700">
            <Loader2 size={12} className="animate-spin flex-shrink-0" /> בתהליך
          </span>
        )
        if (r.approval_status !== 'approved') return <span className="text-[11px] text-slate-400">—</span>
        if (!(r.id_number ?? '').trim()) return (
          <span className="text-[11px] text-amber-700" title="בלי ת״ז אי אפשר לטעון או להקים בנדרים">חסרה ת״ז</span>
        )
        // 🔴 בלי מוקד אין טעינה — הכרטיס נמסר *במוקד*, ולכן טעינה למי
        // שטרם בחר יוצרת כרטיס טעון שאין לאיש דרך למסור.
        //
        // ⚠️ eligibleForLoad בשרת כבר חוסם זאת, אבל הכפתור הוצג בכל זאת:
        // לחיצה עליו נכשלה תמיד, והמסך נראה כאילו הטעינה אפשרית ופשוט
        // לא עובדת.
        if (!r.center_id) return (
          <span className="text-[11px] text-slate-400" title="הכרטיס נמסר במוקד — יש לבחור מוקד לפני הטעינה">
            טרם נבחר מוקד
          </span>
        )

        const failed = r.load_status === 'failed'
        return (
          <div className="flex items-center gap-1.5">
            {canEdit && loadCard && (
              <button type="button" onClick={() => loadCard(r.id)} disabled={loadingId === r.id}
                title={failed ? 'הטעינה נכשלה — נסו שוב' : 'טעינת הכרטיס'}
                className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors disabled:opacity-40 ${
                  failed
                    ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'}`}>
                {loadingId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Wallet size={12} />}
                {failed ? 'נסה שוב' : 'טען'}
              </button>
            )}
            {failed && <span className="text-[11px] text-rose-600" title={r.load_error ?? ''}>נכשל</span>}
          </div>
        )
      }
      case 'phone': return <span className="font-mono text-slate-600 ltr-num">{r.ben_phone ?? r.phone ?? '—'}</span>
      // ⚠️ text-right מפורש: dir="ltr" הופך את ברירת המחדל לשמאל, והמייל
      // היה נצמד לצד ההפוך מהכותרת.
      case 'email': return <span className="block truncate text-slate-600 text-right" dir="ltr" title={r.email ?? ''}>{r.email ?? '—'}</span>
      case 'address': return <span className="block truncate text-slate-600" title={r.address ?? ''}>{r.address ?? '—'}</span>
      case 'city': return <span className="text-slate-600">{r.city ?? '—'}</span>
      // 🔴 שיוך ידני מהתא: המוקד נבחר עד כה רק בערוצים שהמשפחה מפעילה,
      // ולמשרד לא הייתה שום דרך לשייך מוקד למי שלא הסתדר עם אף אחד מהם.
      case 'center':
        return canEdit && centerOptions && onCenterAssigned
          ? (
            <CenterCellEditor
              recipientId={r.id}
              centerName={r.center_name}
              centerSource={r.center_source}
              centers={centerOptions}
              onSaved={next => onCenterAssigned(r.id, next)}
            />
          )
          : r.center_name
        ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span className="text-slate-700">{r.center_name}</span>
            {/* ⚠️ הערוץ מוצג: "בחרתי בטלפון ורשום אחרת" אינו ניתן לבירור בלעדיו. */}
            {r.center_source && (
              <span className="text-[10px] text-slate-400">
                {r.center_source === 'phone' ? 'טלפון' : r.center_source === 'portal' ? 'אתר' : 'ידני'}
              </span>
            )}
          </span>
        )
        : <span className="text-slate-300">טרם נבחר</span>
      case 'age': return <span className="text-slate-600 ltr-num">{r.age ?? '—'}</span>
      case 'children': return <span className="text-slate-600 ltr-num">{r.children_count ?? '—'}</span>
      case 'source': {
        const I = SOURCE_ICON[r.source] ?? Pencil
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
            <I size={11} /> {SOURCE_LABEL[r.source]}
          </span>
        )
      }
      case 'registered_at': return <span className="text-slate-500 ltr-num text-[11px]">{fmtDateTime(r.registered_at)}</span>
      case 'amount': return <span className="font-bold text-emerald-700 ltr-num">{amountPerFamily ? fmtCur(amountPerFamily) : '—'}</span>
      case 'message':
        if (r.notified_at) return (
          <span className="text-[11px] font-bold text-green-700" title={fmtDateTime(r.notified_at)}>
            ✓ נשלח{r.notify_error ? <span className="text-amber-700" title={r.notify_error}> ⚠</span> : null}
          </span>
        )
        if (r.notify_error) return <span className="text-[11px] font-bold text-rose-700" title={r.notify_error}>נכשל</span>
        return <span className="text-[11px] font-bold text-slate-400">—</span>
    }
  }

  // ⚠️ עמודות ארוכות-תוכן מוגבלות ברוחב + truncate; הקצרות nowrap. כך
  // הטבלה נשארת בתוך הרוחב בלי גלילה, גם כשמסומנות עמודות רבות.
  // 🔴 גלישה ולא חיתוך: הצרת עמודה שוברת את הטקסט לשורות ומגביהה את
  // השורה — כמו באקסל. truncate/nowrap היו מעלימים מידע במקום להציג
  // אותו אחרת, וזו בדיוק הנקודה של הגרירה.
  const cellClass = () => rt.cellClass

  return (
    <div className="flex flex-col gap-2">
      {/* ── בורר העמודות ── */}
      {/* ⚠️ "הצגת הכל" ליד הבורר ולא בקצה הנגדי: הוא פעולה *על* הבורר,
          וריחוק ממנו נראה כפריט מנותק. */}
      {/* ⚠️ הבורר מגיע מה-hook ולא נבנה כאן: הוא כולל גם את איפוס
          המיון והסינון, שמימוש מקומי היה משמיט. */}
      {tc.picker}

      {/* ⚠️ בלי overflow-x — הכלל: אין גלילה לרוחב בשום טבלה. */}
      <div className="w-full">
        <table className="w-full text-[12px] border-collapse" style={rt.tableStyle}>
          <colgroup>{rt.cols}</colgroup>
          <thead className="bg-slate-50 text-slate-500">
            <tr className="[&>th]:px-2.5 [&>th]:py-2.5 [&>th]:font-bold [&>th]:text-right [&>th]:border-l [&>th]:border-slate-200 [&>th:last-child]:border-l-0">
              {canEdit && (
                <th className="w-8">
                  <input type="checkbox" checked={!!allShownSelected} onChange={() => toggleAllShown?.()}
                    className="h-4 w-4 accent-indigo-600" aria-label="סימון כל המוצגים" />
                </th>
              )}
              {/* 🔴 tc.th ולא <th> ידני: זה מה שמביא את תפריט המיון
                  והסינון בלחיצה על הכותרת, יחד עם ידית הגרירה. */}
              {shown.map((c, i) => tc.th(c, canEdit ? i + 1 : i))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleRows.map(r => (
              <tr key={r.id} className="hover:bg-indigo-50/40 align-middle [&>td]:px-2.5 [&>td]:py-2 [&>td]:border-l [&>td]:border-slate-100 [&>td:last-child]:border-l-0">
                {canEdit && (
                  <td className="w-8">
                    <input type="checkbox" checked={!!selected?.has(r.id)} onChange={() => toggleRow?.(r.id)}
                      className="h-4 w-4 accent-indigo-600" aria-label={`סימון ${r.name}`} />
                  </td>
                )}
                {shown.map(c => (
                  <td key={c.key} className={`${cellClass()} ${c.align === 'center' ? 'text-center' : ''}`}>
                    {cell(c, r)}
                  </td>
                ))}
              </tr>
            ))}
            {/* זקיף הגלילה — colSpan נדיב במכוון: מספר העמודות משתנה. */}
            {hasMore && (
              <tr ref={sentinelRef as React.Ref<HTMLTableRowElement>}>
                <td colSpan={20} className="px-3 py-4 text-center text-slate-400 text-[11px] font-medium">
                  <Loader2 size={14} className="inline animate-spin ml-1.5" />
                  טוען עוד… ({shownCount.toLocaleString()} מתוך {total.toLocaleString()})
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
