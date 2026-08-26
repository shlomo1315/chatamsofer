'use client'

import { useState } from 'react'
import { Globe, Mail, FileImage, Check, X, Download, Loader2, Send, CheckCircle2, FileText, Clock } from 'lucide-react'
import BatchPdfDialog from './BatchPdfDialog'
import SendToDonorDialog from './SendToDonorDialog'
import { wasSentToDonor, SENT_LABEL, type SentFilter } from '@/lib/gratitudeBatch'
import SafeDocImage from '@/components/ui/SafeDocImage'
import { openDocInNewTab } from '@/lib/docBlob'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'

export interface GratitudeRow {
  id: string
  /** ⚠️ null כשהברכה אינה על לידה — למשל תודה על חלוקת חגים. */
  maternity_aid_id: string | null
  /** ההקשר: maternity / holidays / general. */
  context?: string | null
  /** ⚠️ המשפחה ישירות — העוגן היחיד לברכה שאינה על לידה. */
  beneficiary?: { family_name?: string | null; spouse_name?: string | null; full_name?: string | null; email?: string | null } | null
  source: 'web' | 'email' | 'scan'
  body: string | null
  signature: string | null
  is_anonymous: boolean
  scan_url: string | null
  status: 'received' | 'approved' | 'rejected'
  sent_to_donor_at: string | null
  sent_to_donor_email: string | null
  created_at: string
  aid: {
    birth_date?: string | null
    recovery_home?: string | null
    beneficiary?: { family_name?: string | null; spouse_name?: string | null; full_name?: string | null; email?: string | null } | null
  } | null
}

const SOURCE_META = {
  web:   { label: 'טופס',  icon: Globe,     color: 'text-sky-600 bg-sky-50' },
  email: { label: 'מייל',  icon: Mail,      color: 'text-violet-600 bg-violet-50' },
  scan:  { label: 'סריקה', icon: FileImage, color: 'text-amber-600 bg-amber-50' },
} as const

const STATUS_META = {
  received: { label: 'התקבל', color: 'bg-slate-100 text-slate-600' },
  approved: { label: 'אושר',  color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'נדחה',  color: 'bg-rose-100 text-rose-600' },
} as const

function motherName(row: GratitudeRow): string {
  // ⚠️ נפילה-לאחור למשפחה: ברכה שנקלטה ממייל אינה קשורה לתיק לידה,
  // ובלי זה כל 29 הברכות מהמייל היו מוצגות כ-"—".
  const b = row.aid?.beneficiary ?? row.beneficiary
  if (!b) return '—'
  return [b.family_name, b.spouse_name || b.full_name].filter(Boolean).join(' ') || '—'
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('he-IL')
}

// ── הגדרת העמודות ──
// ⚠️ עמודת הצ׳קבוקס (ראשונה) ועמודת "שלח" (אחרונה) אינן בבורר — ראו extraCols.
type ColKey = 'date' | 'mother' | 'source' | 'body' | 'sent'

// 🔴 value() חובה בכל עמודה שמרנדרת JSX — בלעדיה המיון עובד על אובייקט
// React ומחזיר סדר אקראי שנראה בדיוק כמו מיון תקין.
// ⚠️ שם/הברכה — מיון בלבד. המקור ומצב המשלוח הם קבוצות סגורות ← גם סינון.
// ⚠️ headClassName נושא את הריפוד: <th> נבנה בתוך TableHeadMenu, וריפוד
// שנכתב בצרכן לא היה מגיע אליו.
const HEAD = 'px-4 py-3 font-semibold'

const COLUMNS: ColDef<ColKey, GratitudeRow>[] = [
  // ⚠️ ממוין לפי התאריך הגולמי ולא לפי התווית: תאריך מפורמט ממוין
  // אלפביתית ולא כרונולוגית.
  { key: 'date', label: 'תאריך', def: true, kind: 'date', headClassName: HEAD, value: r => r.created_at },
  { key: 'mother', label: 'שם היולדת', def: true, headClassName: HEAD, value: r => motherName(r) },
  { key: 'source', label: 'מקור', def: true, kind: 'enum', filterable: true, headClassName: HEAD,
    // ⚠️ הערך הוא התווית המוצגת ולא הקוד ('web'/'email'/'scan').
    value: r => SOURCE_META[r.source]?.label ?? null },
  { key: 'body', label: 'הברכה', def: true, headClassName: HEAD, value: r => r.body || (r.scan_url ? '— שובר סרוק —' : null) },
  { key: 'sent', label: 'נשלח לנדיב', def: true, kind: 'enum', filterable: true, headClassName: HEAD,
    value: r => r.sent_to_donor_at ? 'נשלח' : 'טרם נשלח' },
]

export default function GratitudeTable({ rows }: { rows: GratitudeRow[] }) {
  const [items, setItems] = useState(rows)
  const [open, setOpen] = useState<GratitudeRow | null>(null)
  // 🔴 סינון הסטטוס בוטל. ברכה שהתקבלה היא ברכה, ואין מה לאשר בה —
  // וכל 68 הברכות היו 'received', כך ש"מאושרות" תמיד הראה 0.
  // 🔴 סינון נפרד למצב המשלוח לנדיב. הוא *אינו* סטטוס: ברכה יכולה
  // להיות מאושרת ועדיין לא נשלחה — וזו בדיוק הרשימה שהמשלוח השבועי מחפש.
  const [sentFilter, setSentFilter] = useState<SentFilter>('all')
  const [busy, setBusy] = useState(false)
  const [pdf, setPdf] = useState<string | null>(null)
  // בחירה לשליחה מרוכזת + חלונית שליחה (בודדת או מרוכזת)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sendModal, setSendModal] = useState<{ ids: string[] } | null>(null)
  // חלונית הקובץ המרוכז — כל הברכות בטווח בקובץ אחד לנדיב
  const [batchOpen, setBatchOpen] = useState(false)

  const filtered = items.filter(r =>
    sentFilter === 'all' || (sentFilter === 'sent') === wasSentToDonor(r))
  // extraCols: 2 — צ׳קבוקס (לפני) וכפתור השליחה (אחרי), שאינם בבורר.
  //
  // 🔴 ה-hook מקבל את filtered (אחרי בורר המשלוח) ולא את items: הסינון
  // בכותרת חל *על* מה שהבורר סינן, ולא במקומו.
  // ⚠️ mode:'client' — כל הברכות מגיעות כ-prop, אין דפדוף בשרת.
  const tc = useTableColumns<ColKey, GratitudeRow>('maternity-gratitude', COLUMNS, {
    extraCols: 2,
    sortFilter: { mode: 'client', rows: filtered },
  })

  // ניתן לשלוח רק מכתבים שאושרו
  // 🔴 כל ברכה ניתנת לבחירה.
  //
  // ⚠️ קודם היה כאן filter(status === 'approved'), וכל 68 הברכות במערכת
  // הן 'received' — כך שלא היה *מה* לסמן: כל הצ'קבוקסים היו מושבתים,
  // ו"שליחה מרוכזת" נשאר אפור לנצח בלי שום הסבר.
  //
  // 🔴 נגזר מ-tc.rows ולא מ-filtered: הסינון מהכותרת הוא דרך *נוספת*
  // שבה שורה נעלמת מהמסך, וברכה שאינה לפני המשתמש לא תישלח לנדיב.
  const selectableIds = tc.rows.map(r => r.id)

  // 🔴 בחירה שנעלמה מהמסך אינה נשלחת.
  //
  // ⚠️ בלי זה: המשתמש מסמן 5 ברכות, מסנן ל"טרם נשלחו", ולוחץ "שליחה
  // מרוכזת" — והמערכת שולחת גם את מי שכבר לא מופיעה לפניו. אין דרך
  // לדעת למי נשלח בפועל, וברכה נשלחת לנדיב פעמיים.
  const visibleSelected = [...selected].filter(id => selectableIds.includes(id))

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  function toggleAll() {
    setSelected(prev => (prev.size === selectableIds.length ? new Set() : new Set(selectableIds)))
  }

  /** פותח את חלונית השליחה. הבחירה והכתובת נקבעות שם. */
  function openSend(ids: string[]) { setSendModal({ ids }) }


  // תוכן התא לפי מפתח העמודה
  const cell = (key: ColKey, row: GratitudeRow) => {
    switch (key) {
      case 'date': return <span className="text-slate-500 text-xs">{fmtDate(row.created_at)}</span>
      case 'mother': return (
        <span className="font-semibold text-slate-800">
          {motherName(row)}
          {row.is_anonymous && <span className="mr-2 text-[10px] text-slate-400 font-normal">(אנונימי)</span>}
        </span>
      )
      case 'source': {
        const meta = SOURCE_META[row.source]
        const Icon = meta.icon
        return (
          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium ${meta.color}`}>
            <Icon size={13} />
            {meta.label}
          </span>
        )
      }
      case 'body': return <span className="text-slate-600">{row.body?.slice(0, 80) || (row.scan_url ? '— שובר סרוק —' : '—')}</span>
      // ⚠️ "טרם נשלח" נאמר במפורש ולא בקו מקווקו: קו נראה כמו "אין
      // נתון", וזה בדיוק ההבדל שהמשתמש מחפש כשהוא בונה משלוח שבועי.
      case 'sent': return row.sent_to_donor_at ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
          <CheckCircle2 size={11} /> {fmtDate(row.sent_to_donor_at)}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          <Clock size={11} /> טרם נשלח
        </span>
      )
    }
  }

  async function loadPdf(row: GratitudeRow) {
    setPdf(null)
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/gratitude/${row.id}?pdf=1`)
      const data = await res.json()
      if (res.ok && data.pdf) setPdf(data.pdf)
    } finally {
      setBusy(false)
    }
  }

  if (!items.length) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
        <div className="text-4xl mb-3">💌</div>
        <p className="text-slate-500 text-sm">עדיין לא התקבלו מכתבי ברכה.</p>
        <p className="text-slate-400 text-xs mt-1">
          המייל נשלח אוטומטית 10 ימים אחרי אישור הלידה.
        </p>
      </div>
    )
  }

  return (
    <>
      {/* סינון + שליחה מרוכזת */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {(['all', 'unsent', 'sent'] as SentFilter[]).map(k => (
          <button
            key={k}
            onClick={() => setSentFilter(k)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
              sentFilter === k
                ? 'bg-sky-700 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {k === 'all' ? 'כל המשלוחים' : `${SENT_LABEL[k]} (${items.filter(r => (k === 'sent') === wasSentToDonor(r)).length})`}
          </button>
        ))}
        <div className="flex-1" />
        {/* 🔴 קובץ מרוכז: עד כה כל ברכה הופקה בנפרד, ולא הייתה דרך
            לשלוח לנדיב את ברכות השבוע במסמך אחד. */}
        <button
          onClick={() => setBatchOpen(true)}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition
                     bg-white text-sky-700 border border-sky-300 hover:bg-sky-50"
        >
          <FileText size={14} /> קובץ מרוכז (PDF)
        </button>
        <button
          onClick={() => openSend(visibleSelected)}
          disabled={visibleSelected.length === 0}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition
                     bg-pink-600 text-white hover:bg-pink-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Send size={14} /> שליחה מרוכזת לנדיב{visibleSelected.length > 0 ? ` (${visibleSelected.length})` : ''}
        </button>
      </div>

      {/* בורר העמודות — מעל הטבלה */}
      <div className="mb-3 flex flex-col gap-2">{tc.picker}{tc.activeFilters}</div>

      {/* טבלה — ⚠️ בלי overflow-x: אין גלילה לרוחב בשום טבלה. */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm" style={tc.rt.tableStyle}>
          <colgroup>{tc.rt.cols}</colgroup>
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr className="text-right text-xs text-slate-500">
              <th className="px-3 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selectableIds.length > 0 && visibleSelected.length === selectableIds.length}
                  onChange={toggleAll}
                  disabled={selectableIds.length === 0}
                  title="בחר הכל (מאושרים)"
                  className="accent-pink-600 cursor-pointer disabled:cursor-not-allowed"
                />
              </th>
              {/* כותרת אחידה לכל המערכת — מיון, סינון וגרירת רוחב.
                  ⚠️ האינדקס לידית מוסט ב-1 בגלל עמודת הצ׳קבוקס שלפניה. */}
              {tc.shown.map((c, i) => tc.th(c, i + 1))}
              <th className="relative px-4 py-3 font-semibold">{tc.rt.handle(tc.shown.length + 1)}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* 🔴 tc.rows ולא filtered — אחרת המיון והסינון בכותרת לא היו
                משפיעים על מה שמוצג בפועל, והבחירה (selectableIds) הייתה
                מתייחסת לשורות שאינן על המסך. */}
            {tc.rows.map(row => {
              return (
                <tr
                  key={row.id}
                  onClick={() => { setOpen(row); setPdf(null) }}
                  className="hover:bg-slate-50 cursor-pointer transition"
                >
                  <td className="px-3 py-3 align-top" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleSelect(row.id)}
                      className="accent-pink-600 cursor-pointer"
                    />
                  </td>
                  {tc.shown.map(c => (
                    <td key={c.key} className={`px-4 py-3 ${tc.cellClass(c)}`}>{cell(c.key, row)}</td>
                  ))}
                  <td className="px-4 py-3 align-top" onClick={e => e.stopPropagation()}>
                    {(
                      <button
                        onClick={() => openSend([row.id])}
                        title="שליחת הברכה לנדיב במייל"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold
                                   bg-white border border-pink-200 text-pink-600 hover:bg-pink-50 transition"
                      >
                        <Send size={13} /> שלח
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* מודל */}
      {open && (
        <div
          className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-800">{motherName(open)}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {fmtDate(open.created_at)} · {SOURCE_META[open.source].label}
                  {open.is_anonymous && ' · אנונימי'}
                </p>
              </div>
              <button onClick={() => setOpen(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="p-6">
              {open.body && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-5 mb-4">
                  <p className="text-slate-700 text-[15px] leading-relaxed whitespace-pre-wrap">{open.body}</p>
                  {open.signature && (
                    <p className="mt-4 pt-3 border-t border-slate-200 text-slate-500 text-sm">
                      בכבוד רב, <strong className="text-slate-700">{open.signature}</strong>
                    </p>
                  )}
                </div>
              )}

              {open.scan_url && (
                <button
                  type="button"
                  onClick={() => { openDocInNewTab(open.scan_url!).catch(() => {}) }}
                  className="block w-full rounded-xl border border-slate-200 overflow-hidden mb-4 hover:border-slate-300"
                >
                  <SafeDocImage path={open.scan_url} alt="שובר סרוק" className="w-full" />
                </button>
              )}

              {pdf && (
                <iframe
                  src={`data:application/pdf;base64,${pdf}`}
                  className="w-full rounded-xl border border-slate-200 mb-4"
                  style={{ height: '60vh' }}
                  title="השובר"
                />
              )}

              <div className="flex gap-2 flex-wrap">
                {!open.scan_url && (
                  <button
                    onClick={() => loadPdf(open)}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-sm font-semibold
                               hover:bg-slate-50 disabled:opacity-40 transition"
                  >
                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    הצגת השובר
                  </button>
                )}
                {/* ⚠️ תמיד זמין: קודם הותנה ב-status==='approved' ולכן
                    לא הופיע אף פעם. */}
                <button
                  onClick={() => openSend([open.id])}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-pink-600 text-white text-sm font-semibold
                             hover:bg-pink-700 transition"
                >
                  <Send size={16} /> שלח לנדיב
                </button>
              </div>
              {open.sent_to_donor_at && (
                <p className="mt-3 text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 size={13} /> נשלח לנדיב ב-{fmtDate(open.sent_to_donor_at)}
                  {open.sent_to_donor_email ? ` · ${open.sent_to_donor_email}` : ''}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* חלונית שליחה לנדיב — בודדת או מרוכזת */}
      {/* 🔴 חלונית השליחה: תצוגה מקדימה של המייל, בחירת תיבת שולח
          ובחירת אילו ברכות. קודם היא הייתה שדה כתובת בלבד — המזכירה
          לחצה "שלח" בלי לראות מה הנדיב מקבל ומאיזו תיבה זה יוצא. */}
      {sendModal && (
        <SendToDonorDialog
          rows={items}
          preselected={sendModal.ids}
          onClose={() => setSendModal(null)}
          onSent={(ids, email) => {
            const sentAt = new Date().toISOString()
            const set = new Set(ids)
            setItems(prev => prev.map(r =>
              set.has(r.id) ? { ...r, sent_to_donor_at: sentAt, sent_to_donor_email: email } : r))
            setSelected(new Set())
          }}
        />
      )}
      {/* ⚠️ מקבל את *כל* הפריטים ולא את filtered: הסינון בחלונית עצמאי,
          ומי שסינן את המסך ל"מאושרות" עדיין רשאי להפיק קובץ של הכול. */}
      {batchOpen && <BatchPdfDialog rows={items} onClose={() => setBatchOpen(false)} />}

    </>
  )
}
