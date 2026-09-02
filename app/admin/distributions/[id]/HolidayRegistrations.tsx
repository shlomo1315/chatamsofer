'use client'
import { useMemo, useState, useEffect } from 'react'
import { toRegistrationRow } from '@/lib/distributionRow'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Search, Download, Loader2, Users, Wallet, Monitor, Phone, Mail, Pencil, CreditCard, Check, X, ShieldCheck, Send, MapPin } from 'lucide-react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import { useToast } from '@/components/ui/Toast'
import { useCan } from '@/components/StaffPermissions'
import { SOURCE_LABEL, type RegisterSource } from '@/lib/distributionSources'
import { downloadXlsx, type XlsxColumn } from '@/lib/downloadXlsx'
import type { ApprovalStatus } from '@/lib/holidayCards'
import HolidayRecipientsTable, { type HolidayRow } from './HolidayRecipientsTable'
import { type CenterOption } from './CenterCellEditor'
import VoucherAfterLoadDialog from './VoucherAfterLoadDialog'
import { scopeBulkLoad, scopeBulkVoucher } from '@/lib/holidayBulkScope'
import type { ApprovalLabel } from '@/types'
import AddRecipientDialog from './AddRecipientDialog'
import AutoAssignButton from './AutoAssignButton'
import Pagination from '@/components/ui/Pagination'
import { useTablePagination } from '@/lib/useTablePagination'
import CityBreakdown from './CityBreakdown'
import CenterLiveBreakdown from './CenterLiveBreakdown'
import HolidayToolsTabs from './HolidayToolsTabs'
import GatesPanel from './GatesPanel'

export interface RegistrationRow {
  id: string
  source: RegisterSource
  registered_at: string | null
  phone: string | null
  notified_at: string | null
  notify_error: string | null
  amount: number | null
  beneficiary_id: string | null
  approval_status: ApprovalStatus
  approved_at: string | null
  card_number: string | null
  card_linked_at: string | null
  card_link_error: string | null
  /** מוקד החלוקה שנבחר — בטלפון או בממשק. */
  center_id?: string | null
  center_name?: string | null
  center_source?: string | null
  /** מצב טעינת ה-500₪ בנדרים. ⚠️ רצה רק מכפתור מפורש. */
  load_status?: string | null
  load_error?: string | null
  name: string
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
  community: string | null
  children_count: number | null
  age: number | null
}

// ⚠️ האישור אינו קוסמטי: הוא מה שפותח את שיוך הכרטיס בשלוחה הטלפונית ובממשק.
// לכן הוא מוצג כעמודה ראשית עם פעולה ישירה, ולא מוסתר במסך עריכה נפרד.
const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  pending: 'ממתין לאישור', approved: 'מאושר', rejected: 'נדחה',
}
const APPROVAL_STYLE: Record<ApprovalStatus, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-green-50 text-green-800 border-green-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
}

// ⚠️ כולל שניות — לראות את הרגע המדויק של הרישום (חשוב בשחרור המוני).
const fmtDateTime = (d?: string | null) => d ? format(new Date(d), 'dd/MM/yy HH:mm:ss', { locale: he }) : '—'
// סמל השקל אחרי המספר — כך קוראים אותו בעברית ("500 ₪")
const fmtCur = (n: number) => `${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(n)} ₪`

// ⚠️ טווחי הגיל ומספר הילדים הם *פילוח* ולא סינון של הנתונים: הכרטיסים
// מסננים את הטבלה, כדי שאפשר יהיה לענות מיד על "כמה משפחות עם 6 ילדים ומעלה".
const AGE_BUCKETS: { key: string; label: string; test: (a: number | null) => boolean }[] = [
  { key: 'u30', label: 'עד 30', test: a => a != null && a < 30 },
  { key: '30-39', label: '30–39', test: a => a != null && a >= 30 && a < 40 },
  { key: '40-49', label: '40–49', test: a => a != null && a >= 40 && a < 50 },
  { key: '50+', label: '50 ומעלה', test: a => a != null && a >= 50 },
  { key: 'unknown', label: 'לא ידוע', test: a => a == null },
]
const KIDS_BUCKETS: { key: string; label: string; test: (n: number | null) => boolean }[] = [
  { key: '0-2', label: '0–2 ילדים', test: n => (n ?? 0) <= 2 },
  { key: '3-5', label: '3–5 ילדים', test: n => (n ?? 0) >= 3 && (n ?? 0) <= 5 },
  { key: '6-8', label: '6–8 ילדים', test: n => (n ?? 0) >= 6 && (n ?? 0) <= 8 },
  { key: '9+', label: '9 ילדים ומעלה', test: n => (n ?? 0) >= 9 },
]

const SOURCE_ICON: Record<RegisterSource, typeof Monitor> = {
  portal: Monitor, phone: Phone, email: Mail, nedarim: CreditCard, admin: Pencil,
}

// ⚠️ מקור אמת אחד לסדר הערוצים — גם לכרטיס הפילוח וגם לצ'יפים של הסינון.
// היו שתי רשימות נפרדות, והן נפרדו: nedarim תוקן בכרטיס התצוגה ונשכח בסינון,
// כך שאי אפשר היה לסנן דווקא לערוץ שדרכו מגיע רוב הרישום המאסיבי.
const SOURCE_ORDER: RegisterSource[] = ['phone', 'portal', 'nedarim', 'email', 'admin']

export default function HolidayRegistrations({
  distributionId, rows, totalCount, amountPerFamily, registrationOpen, distributionActive, distributionName,
  testMode = false, testEmail = null,
}: {
  distributionId: string
  rows: RegistrationRow[]
  /** ⚠️ מצב בדיקה של החלוקה — משנה את נוסח האישור ואת יעד המייל. */
  testMode?: boolean
  testEmail?: string | null
  /** מספר הנרשמים האמיתי — rows עשוי להיות חלקי בזמן הטעינה. */
  totalCount?: number
  amountPerFamily: number
  registrationOpen: boolean
  /**
   * 🔴 האם החלוקה פעילה בכלל.
   *
   * ⚠️ שונה מ"רישום פתוח": אחרי סגירת הרישום החלוקה ממשיכה — בוחרים
   * מוקדים, מנפיקים שוברים ומחלקים. כיבוי כאן מסתיר את החלוקה מכל
   * הערוצים, וזה מה שעושים כשהיא באמת נגמרה.
   */
  distributionActive?: boolean
  distributionName: string
}) {
  const router = useRouter()
  const toast = useToast()
  const canEdit = useCan('distributions', 'edit')

  // 🔴 הרשימה המלאה נטענת *אחרי* שהמסך כבר מוצג.
  //
  // ⚠️ המסך המתין ל-4.8MB (6,047 נרשמים × כל פרטי המשפחה) לפני שהציג
  // שורה אחת, כדי להראות 50. המסד לוקח 25ms; הזמן כולו הוא המטען.
  // עכשיו מגיעות 250 שורות מיד, והשאר משלים מאחור.
  //
  // ⚠️ החיפוש והפילוחים ממשיכים לרוץ על *כל* הרשומות — הם פשוט
  // מתחילים לעבוד על מה שכבר הגיע, ומתעדכנים כשהשאר נוחת.
  // 🔴 רק *התוספת* שנטענה ברקע נשמרת ב-state — לא הרשימה המלאה.
  //
  // ⚠️ קודם ישב כאן allRows יחיד שמילא שני תפקידים סותרים: גם state
  // נגזר מ-props (שנדרס בכל router.refresh) וגם צבירה של טעינת הרקע.
  // זו הייתה הלולאה שנשארה אחרי התיקון הקודם:
  //
  //   רקע טוען 5,800 → allRows=6,050 → router.refresh מחזיר 250
  //   שורות חדשות → rowsKey משתנה → setAllRows(rows) דורס ל-250
  //   → ה-effect רץ שוב → טוען 5,800 שוב → וחוזר חלילה.
  //
  // כל סיבוב הוא בקשת רשת של ~4.8MB ורינדור מלא של הטבלה; React נופל
  // ב-#301 והמסך מת. ההפרדה מבטלת את המעגל מהשורש: הדריסה לא קיימת
  // עוד, כי אין מה לדרוס — rows מגיע מה-props ו-extraRows נצבר לצדו.
  const [extraRows, setExtraRows] = useState<RegistrationRow[]>([])
  const [loadingRest, setLoadingRest] = useState(false)

  // 🔴 המפתח היציב של הרשימה — ולא מערך ה-props עצמו.
  //
  // ⚠️ rows הוא מערך חדש בכל רינדור של רכיב-השרת, ולכן תלות בו
  // מפעילה כל effect מחדש ללא סוף.
  //
  // ⚠️ אורך + המזהה האחרון מזהים רשימה חדשה באמינות מספקת כאן:
  // השלמת השורות תלויה רק ב"כמה כבר יש" ו"מהיכן להמשיך".
  const rowsKey = `${rows.length}:${rows[rows.length - 1]?.id ?? ''}`

  // 🔴 האיחוד — נגזר בזמן הרינדור, לא state.
  //
  // ⚠️ מיזוג לפי מזהה: אחרי router.refresh העמוד הראשון מגיע מעודכן
  // מהשרת, והוא מנצח את העותק הישן שנצבר ברקע — כך שעדכון סטטוס
  // נראה מיד. בלי זה שורה שנטענה ברקע הייתה מסתירה את הגרסה החדשה.
  // 🔴 שיוכי מוקד שנעשו כאן — נדרסים מעל השורות מהשרת.
  //
  // ⚠️ שכבה מקומית ולא router.refresh: רענון על 6,000 שורות אחרי כל
  // שיוך בודד הוא בדיוק העומס שהדפדוף בא למנוע, והוא היה גם מאבד את
  // מיקום הגלילה של מי שמשייך עשרות שורות ברצף.
  const [centerOverrides, setCenterOverrides] = useState<Record<string, {
    center_id: string | null; center_name: string | null; center_source: string | null
  }>>({})

  // ── המוקדים הפתוחים בחלוקה — לבורר השיוך הידני שבתא ──
  // ⚠️ נטענים פעם אחת ברמת המסך ומועברים לטבלה, ולא לכל שורה בנפרד.
  const [centerOptions, setCenterOptions] = useState<CenterOption[]>([])
  useEffect(() => {
    if (!canEdit) return
    let alive = true
    void fetch(`/api/admin/holiday-centers?distribution_id=${encodeURIComponent(distributionId)}`,
      { cache: 'no-store' })
      .then(r => r.json())
      .then((d: {
        centers?: { id: string; city: string | null; name: string | null; capacity: number | null; is_active?: boolean }[]
        counts?: Record<string, number>
        openIds?: string[]
      }) => {
        if (!alive) return
        // ⚠️ רק המוקדים שנפתחו *בחלוקה הזו*: שיוך למוקד שאינו פתוח בה
        // היה שולח משפחה למקום שלא מחלק בחג הנוכחי.
        const open = new Set(d.openIds ?? [])
        setCenterOptions((d.centers ?? [])
          .filter(c => open.has(c.id) && c.is_active !== false)
          .map(c => ({
            id: c.id, city: c.city, name: c.name,
            full: c.capacity != null && (d.counts?.[c.id] ?? 0) >= c.capacity,
          })))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [canEdit, distributionId])

  const allRows = useMemo(() => {
    const base = extraRows.length
      ? (() => {
          const seen = new Set(rows.map(r => r.id))
          return [...rows, ...extraRows.filter(r => !seen.has(r.id))]
        })()
      : rows
    const keys = Object.keys(centerOverrides)
    if (!keys.length) return base
    return base.map(r => (centerOverrides[r.id] ? { ...r, ...centerOverrides[r.id] } : r))
  }, [rows, extraRows, centerOverrides])

  useEffect(() => {
    // ⚠️ פחות מ-250 = כל הרשימה כבר כאן, אין מה להשלים.
    if (rows.length < 250) return
    let alive = true
    void (async () => {
      // ⚠️ בתוך ה-async ולא בגוף ה-effect: הכלל set-state-in-effect
      // מפיל את הבנייה על setState סינכרוני בגוף effect. כאן זו טעינה
      // אסינכרונית תקינה, והעברת הסימון לתוך ה-callback מבטאת בדיוק את
      // מה שקורה — הדגל נדלק כשהבקשה יוצאת לדרך.
      if (!alive) return
      setLoadingRest(true)
      try {
        const r = await fetch(`/api/admin/distributions/${distributionId}/rows?offset=${rows.length}`,
          { cache: 'no-store' })
        if (!r.ok) return
        const d = await r.json()
        if (!alive || !Array.isArray(d.rows)) return
        // ⚠️ החלפה ולא צבירה: הבקשה מביאה את כל מה שמעבר ל-offset בבת
        // אחת, ולכן היא התוצאה השלמה. צבירה עם prev הייתה מכפילה שורות
        // בכל ריצה חוזרת של ה-effect.
        // 🔴 בלי toRegistrationRow — הנתיב כבר מחזיר שורות מומרות.
        //
        // ⚠️ המרה שנייה *מוחקת* נתונים: center_name נגזר מהשדה `center`
        // של ה-join, וזה כבר אינו קיים בשורה מומרת. התוצאה הייתה null,
        // כלומר כל משפחה שבחרה מוקד הוצגה כ"טרם נבחר" ברגע שטעינת הרקע
        // מסתיימת — נכון לרגע, ואז נעלם.
        setExtraRows(d.rows as RegistrationRow[])
      } catch {
        // ⚠️ כישלון שקט: הרשימה החלקית עדיין שימושית לחלוטין, והודעת
        // שגיאה על טעינת רקע רק מבהילה בלי שיש מה לעשות איתה.
      } finally {
        if (alive) setLoadingRest(false)
      }
    })()
    return () => { alive = false }
    // 🔴 rowsKey ולא rows — ראו ההערה למעלה. תלות במערך עצמו היא
    // הלולאה שהפילה את המסך.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [distributionId, rowsKey])

  // ── רענון חי ──
  //
  // 🔴 המסך נצפה בזמן שהמשפחות בוחרות מוקד בפועל, ובזמן שהמשרד מאשר
  // ומשייך במקביל. נתון שדורש רענון ידני כדי להתעדכן הוא נתון שמישהו
  // מסתמך עליו כשהוא כבר לא נכון.
  //
  // ⚠️ debounce של 800ms כמו במסך המייל: בחירת מוקד המונית מייצרת
  // מקבץ אירועים, ורענון לכל אחד מהם היה מטיח את המסך בעצמו.
  // ⚠️ גם focus/visibilitychange — לשונית שהוסתרה ונפתחה מחדש מציגה
  // נתון ישן, ו-Realtime לבדו אינו מכסה את זה.
  useEffect(() => {
    const supabase = createClient()
    let t: ReturnType<typeof setTimeout> | null = null
    const debounced = () => { if (t) clearTimeout(t); t = setTimeout(() => router.refresh(), 800) }
    const ch = supabase
      .channel(`distribution-live-${distributionId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'distribution_recipients', filter: `distribution_id=eq.${distributionId}` },
        () => debounced())
      // ⚠️ גם המוקדים עצמם: שינוי שם או פתיחת מוקד משנה את מה שהטבלה מציגה.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'holiday_centers' }, () => debounced())
      .subscribe()
    const onFocus = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') router.refresh()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      supabase.removeChannel(ch)
      if (t) clearTimeout(t)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [distributionId, router])
  const [query, setQuery] = useState('')
  const [source, setSource] = useState<RegisterSource | 'all'>('all')
  const [community, setCommunity] = useState<string>('all')
  const [communityOpen, setCommunityOpen] = useState(false)   // פילטר קהילה מכווץ כברירת מחדל
  const [ageBucket, setAgeBucket] = useState<string>('all')
  const [kidsBucket, setKidsBucket] = useState<string>('all')
  const [approval, setApproval] = useState<ApprovalStatus | 'all'>('all')
  const [city, setCity] = useState<string>('all')
  const [cityOpen, setCityOpen] = useState(false)   // רשימת הערים מכווצת כברירת מחדל
  // ⚡ דפדוף אמיתי: 50 שורות כברירת מחדל במקום כל ~6,000 בבת אחת.
  const [toggling, setToggling] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // ── פילוחים — מחושבים מהנתונים בזמן אמת, בלי סיכומים שמורים ──
  //
  // ⚡ כל הפילוחים נגזרים במעבר *אחד* על השורות ולא במעבר לכל כרטיס.
  //
  // ⚠️ למה זה משנה: בחלוקה עם ~6,000 נרשמים, החישוב הקודם עבר על הרשימה
  // 12 פעמים (ערוץ, קהילה, 5 טווחי גיל, 4 טווחי ילדים, אישורים, כרטיסים) —
  // כ-70,000 בדיקות בכל רינדור, וכל הקלדה בתיבת החיפוש הפעילה אותן מחדש.
  // מעבר אחד מייצר את אותם מספרים בדיוק.
  const facets = useMemo(() => {
    const bySource: Record<string, number> = { portal: 0, phone: 0, email: 0, nedarim: 0, admin: 0 }
    const communityMap = new Map<string, number>()
    const cityMap = new Map<string, number>()
    const age: Record<string, number> = {}
    const kids: Record<string, number> = {}
    const approval: Record<ApprovalStatus, number> = { pending: 0, approved: 0, rejected: 0 }
    let cardsLinked = 0
    // מי כבר רשום — לסימון בדיאלוג ההוספה הידנית.
    // ⚠️ נאסף במעבר המשותף ולא בלולאה נפרדת: זה בדיוק המעבר שהוקם כדי
    // להימנע מ-12 סריקות של ~6,000 שורות בכל רינדור.
    const registered = new Set<string>()

    // ⚠️ allRows ולא rows: הרשימה נטענת בהדרגה, והפילוחים חייבים
    // לשקף את *כל* הנרשמים. חישוב מ-rows הראה 75 בירושלים במקום 1,695.
    for (const r of allRows) {
      bySource[r.source] = (bySource[r.source] ?? 0) + 1
      if (r.beneficiary_id) registered.add(String(r.beneficiary_id))
      const c = r.community?.trim() || 'לא צוין'
      communityMap.set(c, (communityMap.get(c) ?? 0) + 1)
      // ⚠️ נאסף באותו מעבר יחיד — ראה ההערה למעלה.
      const ct = r.city?.trim() || 'לא צוין'
      cityMap.set(ct, (cityMap.get(ct) ?? 0) + 1)
      // ⚠️ הדלי הראשון שמתאים בלבד — הטווחים זרים זה לזה, ולכן אין טעם
      // להמשיך לבדוק את השאר.
      for (const b of AGE_BUCKETS) if (b.test(r.age)) { age[b.key] = (age[b.key] ?? 0) + 1; break }
      for (const b of KIDS_BUCKETS) if (b.test(r.children_count)) { kids[b.key] = (kids[b.key] ?? 0) + 1; break }
      approval[r.approval_status] = (approval[r.approval_status] ?? 0) + 1
      if (r.card_linked_at) cardsLinked++
    }

    return {
      bySource,
      communities: [...communityMap.entries()].sort((a, b) => b[1] - a[1]),
      // ממוין מהגבוה לנמוך — משמש גם לפילטר וגם לגרף הפילוח.
      cities: [...cityMap.entries()].sort((a, b) => b[1] - a[1]),
      ageCounts: AGE_BUCKETS.map(b => ({ ...b, count: age[b.key] ?? 0 })),
      kidsCounts: KIDS_BUCKETS.map(b => ({ ...b, count: kids[b.key] ?? 0 })),
      approval,
      cardsLinked,
      registered,
    }
  }, [allRows])

  const { bySource, communities, cities, ageCounts, kidsCounts } = facets
  const registeredIds = facets.registered

  // ⚠️ נגזר מהשורות בכל טעינה: הכרטיסים האלה הם מה שהמנהל בודק לפניהם ("כמה
  // ממתינים לאישור", "כמה מאושרים כבר שייכו כרטיס"), ומונה שמור היה מתיישן.
  // (מחושבים במעבר המשותף למעלה — ראו facets.)
  const approvalCounts = facets.approval
  const cardsLinked = facets.cardsLinked

  // ⚡ טקסט החיפוש של כל שורה נבנה פעם אחת ולא בכל הקלדה.
  //
  // ⚠️ קודם כל הקלדה בנתה מחדש מחרוזת מ-9 שדות עבור כל אחת מ-~6,000 השורות
  // (join + toLowerCase), וזה מה שגרם לתיבת החיפוש להרגיש תקועה. עכשיו זה
  // נגזר פעם אחת מהשורות, והחיפוש עצמו הוא includes בלבד.
  const haystacks = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of allRows) {
      m.set(r.id, [r.name, r.id_number, r.spouse_name, r.ben_phone, r.phone, r.email, r.address, r.city, r.community]
        .filter(Boolean).join(' ').toLowerCase())
    }
    return m
  }, [allRows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    // ⚠️ נבדק פעם אחת מחוץ ללולאה: find() בתוך הלולאה חזר על עצמו לכל שורה.
    const ageTest = ageBucket === 'all' ? null : AGE_BUCKETS.find(b => b.key === ageBucket)?.test
    const kidsTest = kidsBucket === 'all' ? null : KIDS_BUCKETS.find(b => b.key === kidsBucket)?.test
    return allRows.filter(r => {
      if (source !== 'all' && r.source !== source) return false
      if (approval !== 'all' && r.approval_status !== approval) return false
      if (community !== 'all' && (r.community?.trim() || 'לא צוין') !== community) return false
      if (city !== 'all' && (r.city?.trim() || 'לא צוין') !== city) return false
      if (ageTest && !ageTest(r.age)) return false
      if (kidsTest && !kidsTest(r.children_count)) return false
      if (!q) return true
      return (haystacks.get(r.id) ?? '').includes(q)
    })
  }, [allRows, haystacks, query, source, community, city, ageBucket, kidsBucket, approval])

  // ⚡ הדף המוצג בפועל — דרך ה-hook המשותף (lib/useTablePagination).
  //
  // 🔴 הסינון והחיפוש רצים על *כל* השורות (filtered למעלה), והחיתוך לעמוד
  // קורה רק אחריהם. כך תיבת החיפוש מחזירה תוצאה מכל ~6,000 הרשומות ולא
  // מתוך 50 המוצגות — זו הייתה דרישה מפורשת.
  //
  // ⚠️ האיפוס לעמוד 1 מגיע מה-hook, שמזהה רשימה חדשה בזמן הרינדור.
  // כאן היה useEffect שקרא setPage — הוא רינדר פעמיים בכל הקלדה בחיפוש,
  // כי filtered הוא מערך חדש בכל תו. זה בדיוק העומס שהדפדוף בא לפתור.
  // 🔴 הסדר: filtered → tc.rows (מיון וסינון הכותרת) → pg.rows (עמוד).
  //
  // ⚠️ קודם ישב כאן useTablePagination(filtered) והטבלה קיבלה עמוד מוכן.
  // המשמעות: המסננים בכותרת נבנו מ-50 שורות מתוך ~6,000, וגם *הסינון
  // עצמו* חל על הדף בלבד. חיפוש "שמרלר" הציג "טרם נבחר 5 · בני ברק 1"
  // במקום לספור את כל הרשימה, ומוקד שאיש מהדף הנוכחי לא בחר פשוט
  // נעדר מהתפריט. הדפדוף חייב לחול על תוצאת הסינון, לא להפך.
  const [sorted, setSorted] = useState<RegistrationRow[]>(filtered)
  const pg = useTablePagination(sorted)
  const paged = pg.rows

  // הצפי התקציבי — של מה שמסונן כרגע ושל הכל. כך גם "כמה יעלה פילוח מסוים".
  const expectedAll = (totalCount ?? allRows.length) * amountPerFamily
  const expectedFiltered = filtered.length * amountPerFamily

  const toggleRegistration = async () => {
    setToggling(true)
    try {
      const res = await fetch('/api/admin/distributions', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: distributionId, registration_open: !registrationOpen }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'העדכון נכשל'); setToggling(false); return }
      toast.success(registrationOpen ? 'הרישום נסגר' : 'הרישום נפתח — הערוצים פעילים')
      router.refresh()
    } catch { toast.error('שגיאת רשת') }
    setToggling(false)
  }

  const toggleActive = async () => {
    const turningOff = distributionActive !== false
    // ⚠️ אישור לפני כיבוי בלבד: הפעלה מחדש אינה מסוכנת, כיבוי כן —
    // הוא מסתיר את החלוקה מ-6,000 משפחות בבת אחת.
    if (turningOff && !window.confirm(
      )) return

    setToggling(true)
    try {
      const res = await fetch('/api/admin/distributions', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: distributionId, status: turningOff ? 'cancelled' : 'active' }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'העדכון נכשל'); setToggling(false); return }
      toast.success(turningOff ? 'החלוקה כובתה' : 'החלוקה הופעלה')
      router.refresh()
    } catch { toast.error('שגיאת רשת') }
    setToggling(false)
  }

  // אישור / דחייה — לשורה בודדת או לכל המסומנות. אותה קריאה בשני המקרים, כדי
  // שלא יהיו שני מסלולי עדכון שיכולים להיפרד זה מזה.
  // ── אישור המוני של כל הממתינים ──
  //
  // 🔴 6,047 שורות ממתינות, וסימון ידני של כולן אינו מעשי. בלי כלי
  // כזה אף אחד לא יאושר, ולכן גם אף כרטיס לא ייטען.
  //
  // ⚠️ שני שלבים כמו בטעינה: בדיקה שמציגה מי ייכלל, ואז אישור מפורש.
  // ההיקף מגיע מהשרת ולא מחושב כאן — הוא הקובע.
  const [approveScope, setApproveScope] = useState<{
    eligible: number; total: number
    skipped: { alreadyDecided: number; noId: number; duplicateId: number }
  } | null>(null)
  const [approveBusy, setApproveBusy] = useState(false)

  const checkBulkApprove = async () => {
    setApproveBusy(true)
    try {
      const r = await fetch(`/api/admin/distributions/${distributionId}/bulk-approve`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d.error ?? 'הבדיקה נכשלה'); return }
      setApproveScope(d)
    } catch { toast.error('שגיאת רשת') } finally { setApproveBusy(false) }
  }

  const runBulkApprove = async () => {
    if (!approveScope) return
    setApproveBusy(true)
    try {
      const r = await fetch(`/api/admin/distributions/${distributionId}/bulk-approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(d.error ?? 'האישור נכשל'); return }
      toast.success(`${(d.approved ?? 0).toLocaleString('he-IL')} משפחות אושרו`)
      setApproveScope(null)
      router.refresh()
    } catch { toast.error('שגיאת רשת') } finally { setApproveBusy(false) }
  }

  const setApprovalFor = async (ids: string[], status: ApprovalStatus) => {
    if (!ids.length) return
    setBusyId(ids.length === 1 ? ids[0] : 'bulk')
    try {
      const res = await fetch('/api/admin/distributions/recipients', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, approval_status: status }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'העדכון נכשל'); setBusyId(null); return }
      toast.success(status === 'approved'
        ? `${ids.length} אושרו — הכרטיס נפתח לשיוך בטלפון ובממשק`
        : status === 'rejected' ? `${ids.length} נדחו` : `${ids.length} חזרו להמתנה`)
      setSelected(new Set())
      router.refresh()
    } catch { toast.error('שגיאת רשת') }
    setBusyId(null)
  }

  const clearCard = async (id: string) => {
    setBusyId(id)
    try {
      const res = await fetch('/api/admin/distributions/recipients', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id], clear_card: true }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'הניקוי נכשל'); setBusyId(null); return }
      toast.success('שיוך הכרטיס נוקה — המשפחה יכולה לשייך כרטיס מחדש')
      router.refresh()
    } catch { toast.error('שגיאת רשת') }
    setBusyId(null)
  }

  // ── טעינת כרטיס בודד ──
  //
  // 🔴 כסף אמיתי. שני שערים לפני שהוא יוצא: חלונית אישור שמציגה את השם,
  // הסכום והמוקד, ו-confirm:true בשרת. לחיצה בשורה הלא נכונה היא טעינה
  // למשפחה אחרת בלי דרך חזרה.
  //
  // ⚠️ אחרי טעינה מוצלחת נפתחת חלונית השובר — ולא נשלח מייל אוטומטית.
  // המייל יוצא רק בלחיצה מפורשת שם, אחרי שראית מה יֵצא.
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [confirmLoad, setConfirmLoad] = useState<HolidayRow | null>(null)
  const [voucherFor, setVoucherFor] = useState<HolidayRow | null>(null)

  const loadCard = (id: string) => {
    const row = allRows.find(r => r.id === id)
    if (row) setConfirmLoad(row)
  }

  const runLoad = async (row: HolidayRow) => {
    setConfirmLoad(null)
    setLoadingId(row.id)
    try {
      const res = await fetch('/api/admin/holiday-load', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distribution_id: distributionId, ids: [row.id],
          amount: amountPerFamily || undefined, confirm: true,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'הטעינה נכשלה'); setLoadingId(null); return }

      // ⚠️ failedList נבדק ולא רק res.ok: הבקשה מצליחה גם כשהמשפחה עצמה
      // נכשלה, והודעת הצלחה כאן הייתה מסתירה כרטיס ריק.
      const failure = (d.failedList as { error?: string }[] | undefined)?.[0]
      if (failure) { toast.error(failure.error ?? 'הטעינה נכשלה'); setLoadingId(null); router.refresh(); return }

      toast.success(d.testMode ? 'מצב בדיקה — לא נטען כרטיס' : 'הכרטיס נטען')
      router.refresh()
      // ⚠️ השובר נפתח רק אחרי הצלחה — ראו ההערה למעלה.
      setVoucherFor(row)
    } catch { toast.error('שגיאת רשת') }
    setLoadingId(null)
  }

  // ── פעולות קבוצתיות: טעינה ושליחת שוברים ──
  //
  // 🔴 הסימון חוצה עמודים ומגיע למאות שורות. לכן נפתחת חלונית שמראה
  // *מראש* כמה ייטענו, כמה יידלגו ולמה, וכמה כסף בסך הכל — ולא רק
  // confirm() עם מספר אחד.
  const [bulkAction, setBulkAction] = useState<'load' | 'voucher' | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const selectedRows = useMemo(
    () => allRows.filter(r => selected.has(r.id)),
    [allRows, selected],
  )
  const loadScope = useMemo(() => scopeBulkLoad(selectedRows), [selectedRows])
  const voucherScope = useMemo(() => scopeBulkVoucher(selectedRows), [selectedRows])

  const runBulkLoad = async () => {
    setBulkBusy(true)
    try {
      const res = await fetch('/api/admin/holiday-load', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distribution_id: distributionId,
          ids: loadScope.eligible.map(r => r.id),
          amount: amountPerFamily || undefined, confirm: true,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'הטעינה נכשלה'); setBulkBusy(false); return }
      toast.success(d.testMode
        ? `מצב בדיקה — ${d.loaded ?? 0} עברו את המסלול, לא נטען כרטיס`
        : `${d.loaded ?? 0} כרטיסים נטענו${d.failed ? ` · ${d.failed} נכשלו` : ''}`)
      setBulkAction(null)
      setSelected(new Set())
      router.refresh()
    } catch { toast.error('שגיאת רשת') }
    setBulkBusy(false)
  }

  const runBulkVoucher = async () => {
    setBulkBusy(true)
    try {
      const res = await fetch('/api/admin/holiday-voucher/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          distribution_id: distributionId,
          ids: voucherScope.eligible.map(r => r.id),
          confirm: true,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'השליחה נכשלה'); setBulkBusy(false); return }
      if (d.sent === 0) {
        // ⚠️ sent:0 אינו הצלחה — ראו את אותה בדיקה בחלונית הבודדת.
        toast.error(d.note ?? 'לא נשלח דבר')
        setBulkBusy(false); return
      }
      toast.success(`${d.sent} שוברים נשלחו${d.failed ? ` · ${d.failed} נכשלו` : ''}`)
      setBulkAction(null)
      setSelected(new Set())
      router.refresh()
    } catch { toast.error('שגיאת רשת') }
    setBulkBusy(false)
  }

  // שליחת הודעת האישור — מייל + צינתוק. בלי בחירה: כל המאושרים שטרם קיבלו.
  // ⚠️ הצינתוק אינו "תוספת" למייל: לחלק מהמשפחות אין מייל, ואצלן הוא הערוץ
  // היחיד. לכן שני הערוצים נשלחים יחד וכל אחד נכשל בנפרד.
  const [notifying, setNotifying] = useState(false)
  const notify = async (ids: string[]) => {
    setNotifying(true)
    try {
      const res = await fetch('/api/admin/distributions/recipients/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids.length ? { ids } : { distributionId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'השליחה נכשלה'); setNotifying(false); return }
      if (d.empty) toast.success('אין מאושרים שממתינים להודעה')
      else if (d.failed > 0) toast.error(`נשלחו ${d.sent} · נכשלו ${d.failed} — הסיבה מופיעה בעמודת ההודעה`)
      else toast.success(`נשלחה הודעת אישור ל-${d.sent}${d.skipped ? ` · ${d.skipped} דולגו` : ''}`)
      setSelected(new Set())
      router.refresh()
    } catch { toast.error('שגיאת רשת') }
    setNotifying(false)
  }

  const toggleRow = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const allShownSelected = filtered.length > 0 && filtered.every(r => selected.has(r.id))
  const toggleAllShown = () => setSelected(prev => {
    const next = new Set(prev)
    if (allShownSelected) filtered.forEach(r => next.delete(r.id))
    else filtered.forEach(r => next.add(r.id))
    return next
  })

  // ⚠️ ת"ז/טלפון/מספר כרטיס מוגדרים 'id' (טקסט) ולא מספר: כמספר הם מאבדים
  // אפס מוביל ומקבלים פסיקי אלפים. גיל/ילדים/סכום הם מספרים אמיתיים, כדי
  // שאפשר יהיה לסכם ולמיין אותם באקסל.
  // ⚠️ שם משפחה ושם פרטי בעמודות נפרדות — מיון וסינון באקסל לפי שם משפחה
  // אינם אפשריים כשהשניים במחרוזת אחת.
  const XLSX_COLUMNS: XlsxColumn[] = [
    { header: 'שם משפחה' }, { header: 'שם פרטי' }, { header: 'ת"ז', kind: 'id' }, { header: 'בן/בת זוג' },
    { header: 'טלפון', kind: 'id' }, { header: 'מייל' }, { header: 'כתובת' }, { header: 'עיר' },
    { header: 'קהילה' }, { header: 'גיל', kind: 'number' }, { header: 'ילדים', kind: 'number' },
    { header: 'ערוץ' }, { header: 'תאריך רישום', kind: 'date' }, { header: 'סכום מתוכנן', kind: 'number' },
    { header: 'אישור' },
    // 🔴 המוקד — העמודה שכל עבודת החלוקה נשענת עליה, והיא נעדרה מהייצוא.
    //
    // ⚠️ שלוש עמודות ולא אחת: "טרם נבחר" מפורש כדי שאפשר יהיה לסנן באקסל
    // על מי שטרם בחר (תא ריק אינו ניתן להבחנה מנתון חסר), וערוץ הבחירה
    // כי "בחרתי בטלפון ורשום אחרת" אינו ניתן לבירור בלעדיו.
    { header: 'מוקד חלוקה' }, { header: 'עיר המוקד' }, { header: 'אופן בחירת המוקד' },
    { header: 'סטטוס טעינה' },
    { header: 'מספר כרטיס', kind: 'id' }, { header: 'שויך בתאריך', kind: 'date' },
  ]

  // ⚠️ אותן תוויות בדיוק כמו בטבלה — ייצוא שמדבר בשפה אחרת מהמסך מחייב
  // את הקורא לתרגם, ופותח פער בין מה שנראה למה שנשלח.
  const CENTER_SOURCE_LABEL: Record<string, string> = {
    phone: 'טלפון', portal: 'אתר', office: 'שויך במשרד',
  }
  const LOAD_LABEL_XLSX: Record<string, string> = {
    loaded: 'נטען', failed: 'נכשל', pending: 'בתהליך',
  }

  const [exporting, setExporting] = useState(false)
  const exportExcel = async () => {
    // 🔴 רשת ביטחון אחרונה: בלי סינון פעיל, הייצוא חייב לכלול את כל הרשומות.
    // ⚠️ הכפתור כבר חסום בזמן הטעינה, אבל בדיקה מול totalCount תופסת גם
    // מקרה שבו הטעינה "הסתיימה" והרשימה בכל זאת חלקית (בקשה שנכשלה בשקט).
    // עדיף לעצור מלייצר קובץ חסר שנראה תקין.
    const noFilters = !query.trim() && source === 'all' && approval === 'all'
      && community === 'all' && city === 'all' && ageBucket === 'all' && kidsBucket === 'all'
    if (noFilters && totalCount != null && sorted.length < totalCount) {
      toast.error(`נטענו ${sorted.length} מתוך ${totalCount} רשומות. המתינו לסיום הטעינה ונסו שוב.`)
      return
    }
    setExporting(true)
    try {
      await downloadXlsx({
        filename: `${distributionName || 'חלוקה'} — נרשמים`,
        sheetName: 'נרשמים',
        columns: XLSX_COLUMNS,
        // 🔴 sorted ולא filtered — sorted הוא תוצאת *מסנני הכותרת* (tc.rows),
        // ו-filtered הוא רק שלב הסינון העליון שלפניהם.
        //
        // ⚠️ הייצוא נתן מספר אחר מהמסך: המנהל סינן "טרם נבחר" בעמודת מוקד
        // החלוקה, ראה 833 שורות, וקיבל קובץ עם 62. הייצוא פשוט לא ידע על
        // הסינון שהוא ראה מולו. מספר שסותר את המסך שולל אמון בשניהם, כי
        // אי אפשר לדעת מי מהם צודק.
        //
        // ⚠️ הכלל: הייצוא חייב לצאת מאותו מערך שממנו נגזר העמוד המוצג
        // (sorted → pg.rows). כל שלב מוקדם יותר מתעלם מחלק מהסינון.
        rows: sorted.map(r => [
          r.family_name || r.name, r.first_name || '', r.id_number, r.spouse_name, r.ben_phone ?? r.phone, r.email,
          r.address, r.city, r.community, r.age, r.children_count,
          SOURCE_LABEL[r.source], r.registered_at, amountPerFamily || null,
          APPROVAL_LABEL[r.approval_status],
          // ⚠️ "טרם נבחר" מפורש ולא תא ריק — כדי שניתן יהיה לסנן עליו.
          r.center_name ?? 'טרם נבחר',
          // ⚠️ העיר לחוד: center_name הוא "עיר · אזור", ומיון לפי עיר
          // באקסל דורש עמודה משלה.
          r.center_name ? (r.center_name.split(' · ')[0] ?? '') : '',
          r.center_name ? (CENTER_SOURCE_LABEL[r.center_source ?? ''] ?? 'ידני') : '',
          LOAD_LABEL_XLSX[r.load_status ?? ''] ?? 'טרם נטען',
          r.card_number, r.card_linked_at,
        ]),
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'הייצוא נכשל')
    }
    setExporting(false)
  }

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'}`

  // שורת מונה לחיצה בכרטיסי הפילוח. הסימון הפעיל אינו קישוט: בלעדיו הלחיצה
  // מסננת טבלה שנמצאת הרחק למטה, והמסך נראה כאילו לא הגיב.
  const statRow = (active: boolean) =>
    `flex w-full items-center justify-between rounded-lg px-2 py-1 text-right transition-colors ${active ? 'bg-indigo-50 ring-1 ring-indigo-300' : 'hover:bg-slate-50'}`

  return (
    <div className="flex flex-col gap-5">
      {/* ── לוח השערים ──
          🔴 ראשון במסך בכוונה: "מה פתוח כרגע" היא השאלה שנשאלת לפני כל
          פעולה אחרת, וקודם התשובה הייתה מפוזרת בין כרטיס לטאב נסתר. */}
      <GatesPanel
        distributionId={distributionId}
        registrationOpen={registrationOpen}
        onToggleRegistration={() => void toggleRegistration()}
        registrationBusy={toggling}
        canEdit={canEdit}
      />

      {/* ── מונים חיים: נרשמים וצפי תקציבי ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-5">
          <div className="flex items-center gap-2 text-indigo-700 mb-1"><Users size={16} /><span className="text-xs font-bold">נרשמו</span></div>
          {/* ⚠️ totalCount ולא rows.length: הרשימה נטענת בהדרגה,
              והמונה חייב להיות נכון מהרגע הראשון. */}
          <p className="text-3xl font-extrabold text-indigo-900 ltr-num">{(totalCount ?? allRows.length).toLocaleString('he-IL')}</p>
          {loadingRest && (
            <p className="text-[11px] text-indigo-600 mt-1">טוען את הרשימה המלאה…</p>
          )}
        </div>
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-2 text-emerald-700 mb-1"><Wallet size={16} /><span className="text-xs font-bold">צפי תקציבי</span></div>
          <p className="text-3xl font-extrabold text-emerald-900 ltr-num">{fmtCur(expectedAll)}</p>
          <p className="text-[11px] text-emerald-700 mt-1">{totalCount ?? allRows.length} × {fmtCur(amountPerFamily)} למשפחה</p>
        </div>
        {/* ── אישורים וכרטיסים — המסלול שאחרי הרישום ──
            ⚠️ השורות כאן לחיצות ומסננות את הטבלה, בדיוק כמו הצ'יפים שמתחת.
            כמספרים בלבד הן הזמינו לחיצה שלא עשתה כלום: המנהל רואה "ממתינים
            לאישור 47", לוחץ כדי לראות מי הם, ושום דבר לא קורה. */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-slate-500 mb-2"><ShieldCheck size={16} /><span className="text-xs font-bold">אישורים וכרטיסים</span></div>
          <div className="flex flex-col gap-1 text-[12.5px]">
            {([
              { k: 'pending' as const, label: 'ממתינים לאישור', text: 'text-amber-800', num: 'text-amber-900' },
              { k: 'approved' as const, label: 'מאושרים', text: 'text-green-800', num: 'text-green-900' },
              { k: 'rejected' as const, label: 'נדחו', text: 'text-rose-800', num: 'text-rose-900' },
            ]).map(r => (
              <button key={r.k} type="button" onClick={() => setApproval(a => (a === r.k ? 'all' : r.k))}
                title="לחצו כדי לסנן את הרשימה"
                className={statRow(approval === r.k)}>
                <span className={r.text}>{r.label}</span>
                <span className={`font-extrabold ltr-num ${r.num}`}>{approvalCounts[r.k]}</span>
              </button>
            ))}
            {/* כרטיסים ששויכו — תצוגה בלבד: אין לו פילטר מקביל בטבלה, ולעשות
                אותו לחיץ בלי שיסנן היה משחזר בדיוק את התקלה שתוקנה כאן. */}
            <div className="mt-1 flex items-center justify-between border-t border-slate-100 px-2 pt-1.5">
              <span className="text-slate-600">כרטיסים ששויכו</span>
              <span className="font-extrabold text-slate-800 ltr-num">{cardsLinked} / {approvalCounts.approved}</span>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-bold text-slate-500 mb-2">פילוח לפי ערוץ</p>
          <div className="flex flex-col gap-1">
            {/* ⚠️ nedarim חייב להיכלל — רוב הרישום המאסיבי לחגים מגיע דרך טופס
                נדרים (matara.pro). בלעדיו הפילוח "בלע" את נרשמי נדרים בשקט
                (סכום הערוצים המוצגים נמוך בהרבה מסך "נרשמו"). */}
            {SOURCE_ORDER.map(s => {
              const I = SOURCE_ICON[s]
              return (
                <button key={s} type="button" onClick={() => setSource(c => (c === s ? 'all' : s))}
                  title="לחצו כדי לסנן את הרשימה"
                  className={`${statRow(source === s)} text-[12.5px]`}>
                  <span className="flex items-center gap-1.5 text-slate-600"><I size={13} />{SOURCE_LABEL[s]}</span>
                  <span className="font-extrabold text-slate-800 ltr-num">{bySource[s] ?? 0}</span>
                </button>
              )
            })}
          </div>
        </div>
        {/* ⚠️ שער הרישום עבר ל-GatesPanel (מוצג מעל הכרטיסים) יחד עם שער
            בחירת המוקדים והמועד — שני השערים חייבים להיראות זה לצד זה.
            כאן נותר רק הכיבוי המוחלט, שהוא פעולת סוף-תהליך ולא שער. */}
        <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-5">
          <p className="text-xs font-bold text-slate-500 mb-1">כיבוי החלוקה</p>
          <p className="text-[11px] leading-relaxed text-slate-500">
            מסתיר את החלוקה מכל הערוצים. השערים עצמם מנוהלים בלוח שלמעלה.
          </p>

          {/* ── כיבוי מוחלט ──
              🔴 נפרד מסגירת הרישום: אחרי הסגירה החלוקה ממשיכה — בוחרים
              מוקדים, מנפיקים שוברים ומחלקים. הכיבוי כאן הוא לסוף התהליך,
              והוא מסתיר את החלוקה מכל הערוצים.
              ⚠️ קטן ומשני בכוונה — זו אינה פעולה יומיומית. */}
          {canEdit && (
            <button type="button" onClick={toggleActive} disabled={toggling}
              className={`mt-2 w-full text-[11px] font-semibold underline transition-colors ${
                distributionActive === false
                  ? 'text-green-700 hover:text-green-900'
                  : 'text-slate-400 hover:text-rose-600'}`}>
              {distributionActive === false ? 'הפעל מחדש את החלוקה' : 'כיבוי מוחלט של החלוקה'}
            </button>
          )}
          {distributionActive === false && (
            <p className="mt-1.5 rounded-lg bg-rose-50 px-2 py-1.5 text-[11px] font-semibold text-rose-700">
              החלוקה כבויה — המשפחות רואות &quot;אין חלוקה פעילה&quot;
            </p>
          )}
        </div>
      </div>

      {/* ── כלי החלוקה — טאבים, באותו דפוס של מסך כרטיסי המזון ──
          ⚡ רק הטאב הפעיל מרונדר, ולכן אף קריאה לשרת אינה יוצאת עד
          שנכנסים אליו. זה מה שהאט את המסך כשכל הפאנלים היו זה מתחת לזה. */}
      {canEdit && <HolidayToolsTabs distributionId={distributionId} />}

      {/* ── פילוח לפי עיר ── */}
      {/* 🔴 פילוח המוקדים — השאלה המרכזית בשלב הבחירה: לאן המשפחות
          הולכות ואיפה צפוי עומס. מוצג רק כשמישהו כבר בחר. */}
      <CenterLiveBreakdown rows={allRows} total={totalCount ?? allRows.length} />

      <CityBreakdown cities={cities} selected={city} onSelect={setCity} />

      {/* ── פילוחים לחיצים ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 w-16">ערוץ:</span>
          <button className={chip(source === 'all')} onClick={() => setSource('all')}>הכל</button>
          {SOURCE_ORDER.map(s => (
            <button key={s} className={chip(source === s)} onClick={() => setSource(s)}>{SOURCE_LABEL[s]} ({bySource[s] ?? 0})</button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 w-16">אישור:</span>
          <button className={chip(approval === 'all')} onClick={() => setApproval('all')}>הכל</button>
          {(['pending', 'approved', 'rejected'] as ApprovalStatus[]).map(s => (
            <button key={s} className={chip(approval === s)} onClick={() => setApproval(s)}>
              {APPROVAL_LABEL[s]} ({approvalCounts[s]})
            </button>
          ))}
        </div>
        {/* ⚠️ קהילה — מכווץ כברירת מחדל (עשוי להכיל עשרות ערכים ברישום מאסיבי).
            לחיצה על הכותרת פותחת את רשימת הצ'יפים; כשמסונן, הבחירה מוצגת גם סגור. */}
        <div className="flex items-start gap-2 flex-wrap">
          <button type="button" onClick={() => setCommunityOpen(o => !o)}
            className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 inline-flex items-center gap-1 shrink-0 pt-1">
            קהילה{community !== 'all' ? `: ${community}` : ` (${communities.length})`} <span className="text-slate-400">{communityOpen ? '▲' : '▼'}</span>
          </button>
          {communityOpen ? (
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <button className={chip(community === 'all')} onClick={() => setCommunity('all')}>הכל</button>
              {communities.map(([c, n]) => (
                <button key={c} className={chip(community === c)} onClick={() => setCommunity(c)}>{c} ({n})</button>
              ))}
            </div>
          ) : community !== 'all' ? (
            <button className={chip(true)} onClick={() => setCommunity('all')}>{community} ✕</button>
          ) : null}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 w-16">גיל:</span>
          <button className={chip(ageBucket === 'all')} onClick={() => setAgeBucket('all')}>הכל</button>
          {ageCounts.map(b => (
            <button key={b.key} className={chip(ageBucket === b.key)} onClick={() => setAgeBucket(b.key)}>{b.label} ({b.count})</button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-400 w-16">ילדים:</span>
          <button className={chip(kidsBucket === 'all')} onClick={() => setKidsBucket('all')}>הכל</button>
          {kidsCounts.map(b => (
            <button key={b.key} className={chip(kidsBucket === b.key)} onClick={() => setKidsBucket(b.key)}>{b.label} ({b.count})</button>
          ))}
        </div>
      </div>

      {/* ── חיפוש + ייצוא + סיכום המסונן ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-56">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="חיפוש בשם, ת״ז, טלפון, מייל, כתובת…"
            className="w-full pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <span className="text-xs font-bold text-slate-500">
          מוצגים {filtered.length.toLocaleString('he-IL')} · {fmtCur(expectedFiltered)}
        </span>
        {/* ⚠️ מוצג גם כשהרישום סגור — זו כל מטרתו: לצרף משפחה שלא נרשמה
            בזמן, בלי לפתוח מחדש את הרישום לכולם. */}
        {canEdit && (
          <AddRecipientDialog distributionId={distributionId} existingIds={registeredIds} />
        )}
        {/* שיבוץ אוטומטי לפי עיר — למי שלא בחר עד תום המועד.
            ⚠️ הכפתור פותח תצוגה מקדימה; הוא אינו מבצע בלחיצה. */}
        {canEdit && (
          <AutoAssignButton
            distributionId={distributionId}
            onDone={() => router.refresh()}
          />
        )}
        {canEdit && approvalCounts.approved > 0 && (
          <button type="button" disabled={notifying} onClick={() => void notify([])}
            title="מייל וצינתוק לכל מי שאושר וטרם קיבל הודעה"
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
            {notifying ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            הודעת אישור לכל המאושרים
          </button>
        )}
        {/* 🔴 חסום עוד הרשימה נטענת ברקע.
            ⚠️ הרשימה מגיעה בשני שלבים (עמוד ראשון מהשרת + השאר ברקע), וייצוא
            באמצע הפיק קובץ עם מה שהספיק להגיע — קובץ קטן שנראה שלם לגמרי.
            קובץ חסר גרוע מכפתור מושבת לרגע: אין בו שום סימן שחסר בו משהו. */}
        <button type="button" onClick={() => void exportExcel()}
          disabled={exporting || loadingRest}
          title={loadingRest ? 'הרשימה עדיין נטענת — המתינו כדי לייצא את כולה' : undefined}
          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
          {exporting || loadingRest ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {loadingRest ? 'טוען את כל הרשומות…' : 'ייצוא לאקסל'}
        </button>
      </div>

      {/* ── פעולה מרוכזת על המסומנים ── */}
      {/* ── אישור כל הממתינים ──
          🔴 מוצג רק כשיש ממתינים ואין סימון: כשסומנו שורות, הכפתורים
          בסרגל הסימון הם הפעולה הנכונה, ושני מסלולים על המסך בו-זמנית
          מזמינים לחיצה על הלא-נכון. */}
      {canEdit && selected.size === 0 && (
        <div className="flex flex-col gap-2.5 rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <h3 className="text-[13px] font-extrabold text-slate-800">אישור כל הממתינים</h3>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">
              🔴 אישור פותח את בחירת המוקד ואת הטעינה.
              <strong className="text-slate-700"> מי שכבר אושר או נדחה — לא ייגע.</strong>
            </p>
          </div>

          {approveScope ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
              <p className="text-sm font-bold text-emerald-900">
                יאושרו {approveScope.eligible.toLocaleString('he-IL')} משפחות
              </p>
              {/* ⚠️ מפרט מי לא ייכלל — אחרת ההפרש נראה כתקלה. */}
              <ul className="mt-1 flex flex-col gap-0.5 text-[11px] text-slate-600">
                {approveScope.skipped.alreadyDecided > 0 && (
                  <li>· {approveScope.skipped.alreadyDecided.toLocaleString('he-IL')} כבר הוכרעו ולא ייגעו</li>
                )}
                {approveScope.skipped.noId > 0 && (
                  <li className="text-amber-700">· {approveScope.skipped.noId.toLocaleString('he-IL')} בלי ת״ז — לא יאושרו</li>
                )}
                {approveScope.skipped.duplicateId > 0 && (
                  <li className="text-amber-700">· {approveScope.skipped.duplicateId.toLocaleString('he-IL')} כפילויות ת״ז</li>
                )}
              </ul>
              {approveScope.eligible > 0 ? (
                <div className="mt-2.5 flex items-center gap-2">
                  <button type="button" disabled={approveBusy} onClick={() => void runBulkApprove()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-emerald-700 disabled:opacity-40">
                    {approveBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    כן, אשר {approveScope.eligible.toLocaleString('he-IL')}
                  </button>
                  <button type="button" onClick={() => setApproveScope(null)}
                    className="text-xs font-bold text-slate-500 hover:text-slate-700">ביטול</button>
                </div>
              ) : (
                <p className="mt-2 text-xs font-semibold text-slate-500">אין מי לאשר</p>
              )}
            </div>
          ) : (
            <button type="button" disabled={approveBusy} onClick={() => void checkBulkApprove()}
              className="inline-flex w-fit items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50 disabled:opacity-40">
              {approveBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              בדיקה לפני אישור
            </button>
          )}
        </div>
      )}

      {canEdit && selected.size > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-2xl border-2 border-indigo-200 bg-indigo-50 px-4 py-3">
          <span className="text-[13px] font-bold text-indigo-900">{/* ⚠️ הסימון חוצה עמודים: "סימון הכל" מסמן את כל התוצאות המסוננות, לא רק את השורות שבעמוד הנוכחי. בלי לומר זאת, מונה של 800 מול 50 שורות על המסך נראה כתקלה. */}
            סומנו {selected.size}
            {selected.size > paged.length && (
              <span className="mr-1.5 font-medium text-indigo-600">(כולל עמודים אחרים)</span>
            )}
          </span>
          <button type="button" disabled={busyId === 'bulk'}
            onClick={() => void setApprovalFor([...selected], 'approved')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50">
            {busyId === 'bulk' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} אישור הכל
          </button>
          <button type="button" disabled={busyId === 'bulk'}
            onClick={() => void setApprovalFor([...selected], 'rejected')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50">
            <X size={13} /> דחיית הכל
          </button>
          <button type="button" disabled={notifying}
            onClick={() => void notify([...selected])}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-700 disabled:opacity-50">
            {notifying ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} שליחת הודעת אישור
          </button>
          {/* 🔴 טעינה ושליחה — שתי פעולות נפרדות ולא אחת: לא כל מי שנטען
              בחר מוקד, ולא כל מי שבחר מוקד כבר נטען. איחודן היה מחייב
              לחכות לאיטי שבשניהם. */}
          <button type="button" disabled={bulkBusy || loadScope.eligible.length === 0}
            onClick={() => setBulkAction('load')}
            title={loadScope.eligible.length === 0 ? 'אין בסימון מי שזכאי לטעינה' : undefined}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-40">
            <Wallet size={13} /> טעינת כרטיסים ({loadScope.eligible.length})
          </button>
          <button type="button" disabled={bulkBusy || voucherScope.eligible.length === 0}
            onClick={() => setBulkAction('voucher')}
            title={voucherScope.eligible.length === 0 ? 'אין בסימון מי שבחר מוקד ויש לו מייל' : undefined}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-40">
            <MapPin size={13} /> שליחת שוברים ({voucherScope.eligible.length})
          </button>
          <button type="button" onClick={() => setSelected(new Set())}
            className="text-xs font-bold text-slate-500 hover:text-slate-700">ביטול הסימון</button>
          <span className="text-[11.5px] text-indigo-700">אישור פותח למשפחה את שיוך הכרטיס בשלוחה הטלפונית ובממשק</span>
        </div>
      )}

      {/* ── טבלת הנרשמים — קומפוננטה משותפת עם דף השיתוף (זהות מובטחת) ── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <HolidayRecipientsTable
          rows={filtered}
          paginated
          onRowsChange={rs => setSorted(rs as RegistrationRow[])}
          pageSlice={() => paged}
          amountPerFamily={amountPerFamily}
          fmtDateTime={fmtDateTime}
          fmtCur={fmtCur}
          controls={{
            canEdit, selected, toggleRow, allShownSelected, toggleAllShown,
            busyId, setApprovalFor, clearCard, loadCard, loadingId, showMessage: true,
            centerOptions,
            onCenterAssigned: (id, next) =>
              setCenterOverrides(prev => ({ ...prev, [id]: next })),
          }}
        />
      </div>

      {/* ── אישור לפעולה קבוצתית ──
          🔴 מציג *מראש* מי יידלג ולמה. בלי זה ההפרש בין "סומנו 800"
          ל"נטענו 340" נראה כתקלה, והמנהל מנסה שוב על אותן שורות. */}
      {bulkAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => !bulkBusy && setBulkAction(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h4 className="mb-3 text-sm font-extrabold text-slate-900">
              {bulkAction === 'load' ? 'טעינת כרטיסים' : 'שליחת שוברים'}
            </h4>

            {bulkAction === 'load' ? (
              <>
                <p className="text-xs text-slate-600">
                  ייטענו <strong className="text-emerald-800">{loadScope.eligible.length}</strong> כרטיסים
                  × {fmtCur(amountPerFamily)}
                </p>
                <p className="my-2 text-2xl font-extrabold text-emerald-900">
                  {fmtCur(loadScope.eligible.length * amountPerFamily)}
                </p>
                <ul className="mb-3 flex flex-col gap-0.5 text-[11px] text-slate-500">
                  {loadScope.alreadyLoaded > 0 && <li>· {loadScope.alreadyLoaded} כבר נטענו ולא ייטענו שוב</li>}
                  {loadScope.notApproved > 0 && <li>· {loadScope.notApproved} טרם אושרו</li>}
                  {loadScope.noId > 0 && <li className="text-amber-700">· {loadScope.noId} בלי ת״ז — לא ייטענו</li>}
                  {/* 🔴 הכרטיס נמסר במוקד — טעינה בלעדיו יוצרת כרטיס
                      טעון שאין לאיש דרך למסור. */}
                  {loadScope.noCenter > 0 && (
                    <li className="text-amber-700">
                      · {loadScope.noCenter} טרם בחרו מוקד — לא ייטענו
                    </li>
                  )}
                </ul>
                {testMode
                  ? <p className="mb-3 rounded-lg border-2 border-amber-400 bg-amber-50 px-2.5 py-2 text-[11px] font-bold text-amber-900">
                      🧪 מצב בדיקה — לא ייטען שום כרטיס ולא ייצא שקל.
                    </p>
                  : <p className="mb-3 text-[11px] font-bold text-rose-700">הפעולה אינה הפיכה.</p>}
              </>
            ) : (
              <>
                <p className="text-xs text-slate-600">
                  יישלחו <strong className="text-indigo-800">{voucherScope.eligible.length}</strong> שוברים במייל.
                </p>
                <ul className="my-3 flex flex-col gap-0.5 text-[11px] text-slate-500">
                  {voucherScope.noCenter > 0 && <li className="text-amber-700">· {voucherScope.noCenter} טרם בחרו מוקד — אין להם שובר</li>}
                  {voucherScope.noEmail > 0 && <li className="text-amber-700">· {voucherScope.noEmail} בלי כתובת מייל</li>}
                </ul>
                {testMode && (
                  <p className="mb-3 rounded-lg border-2 border-amber-400 bg-amber-50 px-2.5 py-2 text-[11px] font-bold text-amber-900">
                    🧪 מצב בדיקה — {testEmail
                      ? <>הכל יישלח ל־<span dir="ltr">{testEmail}</span> ולא למשפחות.</>
                      : <>אין כתובת בדיקה, ולא יישלח דבר.</>}
                  </p>
                )}
                {/* ⚠️ מי שכבר קיבל אינו מקבל שוב — resend אינו נשלח כאן. */}
                <p className="mb-3 text-[11px] text-slate-500">מי שכבר קיבל שובר לא יקבל אותו שוב.</p>
              </>
            )}

            <div className="flex gap-2">
              <button type="button" disabled={bulkBusy}
                onClick={() => void (bulkAction === 'load' ? runBulkLoad() : runBulkVoucher())}
                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-extrabold text-white disabled:opacity-40 ${
                  bulkAction === 'load' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                {bulkBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} אישור
              </button>
              <button type="button" disabled={bulkBusy} onClick={() => setBulkAction(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── אישור לפני טעינה בודדת ──
          🔴 כסף אמיתי בלי דרך חזרה. השם, הסכום והמוקד מוצגים שוב כדי
          שלחיצה בשורה הלא נכונה תיתפס כאן ולא אצל המשפחה. */}
      {confirmLoad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setConfirmLoad(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h4 className="mb-3 text-sm font-extrabold text-slate-900">אישור טעינת כרטיס</h4>

            <dl className="mb-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">משפחה</dt>
                <dd className="font-bold text-slate-800">{[confirmLoad.family_name, confirmLoad.first_name].filter(Boolean).join(' ')}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">תעודת זהות</dt>
                <dd className="font-mono text-slate-700 ltr-num">{confirmLoad.id_number ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">סכום</dt>
                <dd className="text-base font-extrabold text-emerald-800">{fmtCur(amountPerFamily)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">מוקד</dt>
                <dd className={confirmLoad.center_name ? 'font-bold text-slate-800' : 'text-amber-700'}>
                  {confirmLoad.center_name ?? 'טרם נבחר'}
                </dd>
              </div>
            </dl>

            {!confirmLoad.center_name && (
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-900">
                אפשר לטעון גם בלי מוקד, אבל <strong>לא יהיה שובר לשלוח</strong> — הוא בנוי סביב
                המוקד. השובר יישלח אחרי שהמשפחה תבחר.
              </p>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={() => void runLoad(confirmLoad)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-700">
                <Check size={14} /> אישור וטעינה
              </button>
              <button type="button" onClick={() => setConfirmLoad(null)}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* חלונית השובר — נפתחת רק אחרי טעינה מוצלחת */}
      {voucherFor && (
        <VoucherAfterLoadDialog
          distributionId={distributionId}
          testMode={testMode}
          testEmail={testEmail}
          target={{
            id: voucherFor.id,
            familyName: [voucherFor.family_name, voucherFor.first_name].filter(Boolean).join(' ') || 'משפחה',
            idNumber: voucherFor.id_number ?? null,
            email: voucherFor.email ?? null,
            centerName: voucherFor.center_name ?? null,
          }}
          onClose={() => setVoucherFor(null)}
        />
      )}

      {/* ⚠️ הדפדוף היה מחושב אך לא מרונדר — הטבלה קיבלה את כל השורות.
          החיפוש והסינון רצים על המערך המלא (filtered) והחיתוך לעמוד
          קורה רק אחריהם, כך שתוצאה נמצאת מכל הרשומות ולא מתוך העמוד. */}
      <Pagination page={pg.page} size={pg.size} total={pg.total}
        onPage={pg.setPage} onSize={pg.setSize} />
    </div>
  )
}
