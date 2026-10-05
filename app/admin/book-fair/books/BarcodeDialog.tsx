'use client'
import { useState, useMemo } from 'react'
import { X, Loader2, Barcode } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// ברקודים להדפסה — שלוש אפשרויות (בקשת המשתמש 05.10):
//   1. גיליון משותף — תווית אחת לכל ספר (מה שהיה)
//   2. דף מלא לספר אחד — 24 תוויות זהות לעמוד, שם הספר לאורך בצד
//   3. דף לכל ספר בקטלוג — PDF אחד, עמוד לכל ספר
// ─────────────────────────────────────────────────────────────────────────────

type Book = { sku: string; title: string; is_active?: boolean | null }

export default function BarcodeDialog({ books, busy, onDownload, onClose }: {
  books: Book[]
  busy: boolean
  onDownload: (qs: string) => void
  onClose: () => void
}) {
  const active = useMemo(
    () => books.filter(b => b.is_active !== false).sort((a, b) => a.title.localeCompare(b.title, 'he')),
    [books],
  )
  const [query, setQuery] = useState('')
  const [pages, setPages] = useState(1)
  const [stQuery, setStQuery] = useState('')
  const [copies, setCopies] = useState(1)
  const stPicked = active.find(b => b.title === stQuery.trim() || b.sku === stQuery.trim()) ?? null
  // ⚠️ הבחירה לפי שם מלא מתוך הרשימה — מחרוזת חלקית אינה ספר.
  const picked = active.find(b => b.title === query.trim() || b.sku === query.trim()) ?? null

  const row = 'flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4'
  const btn = 'inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label="ברקודים להדפסה">
      <div className="flex w-full max-w-lg flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Barcode size={20} /> ברקודים להדפסה</h2>
          <button onClick={onClose} aria-label="סגירה" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>

        <div className={row}>
          <div>
            <p className="font-semibold text-slate-900">כל הספרים בדף משותף</p>
            <p className="text-sm text-slate-500">תווית אחת לכל ספר — כמו קודם</p>
          </div>
          <button className={btn} disabled={busy} onClick={() => onDownload('')}>
            {busy && <Loader2 size={15} className="animate-spin" />} הורדת PDF
          </button>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border-2 border-slate-900 p-4">
          <div>
            <p className="font-semibold text-slate-900">דף מלא לספר אחד</p>
            <p className="text-sm text-slate-500">45 ברקודים נמוכים זהים בדף (לגב ספר צר), שם הספר לאורך בצד שמאל</p>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
            ספר
            <input list="barcode-books" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="הקלידו שם ספר או מק״ט"
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-base font-normal outline-none focus:border-indigo-400" />
            <datalist id="barcode-books">
              {active.map(b => <option key={b.sku} value={b.title}>{b.sku}</option>)}
            </datalist>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              מספר דפים
              <input type="number" min={1} max={20} value={pages}
                onChange={e => setPages(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className="min-h-[40px] w-20 rounded-xl border border-slate-300 text-center text-base" />
            </label>
            <button
              disabled={busy || !picked}
              onClick={() => picked && onDownload(`?mode=sheet&sku=${encodeURIComponent(picked.sku)}&pages=${pages}`)}
              className="mr-auto inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy && <Loader2 size={15} className="animate-spin" />} הורדת PDF לספר
            </button>
          </div>
          {query.trim() && !picked && <p className="text-sm text-amber-700">בחרו ספר מהרשימה</p>}
        </div>

        <div className="flex flex-col gap-3 rounded-xl border-2 border-amber-500 p-4">
          <div>
            <p className="font-semibold text-slate-900">מדבקות 7×3.5 ס״מ</p>
            <p className="text-sm text-slate-500">עמוד בגודל המדבקה, מדבקה אחת לעמוד — למדפסת מדבקות</p>
          </div>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-700">
            ספר
            <input list="barcode-books" value={stQuery} onChange={e => setStQuery(e.target.value)}
              placeholder="הקלידו שם ספר או מק״ט"
              className="min-h-[44px] rounded-xl border border-slate-300 px-3 text-base font-normal outline-none focus:border-indigo-400" />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              כמות מדבקות
              <input type="number" min={1} max={200} value={copies}
                onChange={e => setCopies(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                className="min-h-[40px] w-20 rounded-xl border border-slate-300 text-center text-base" />
            </label>
            <button
              disabled={busy || !stPicked}
              onClick={() => stPicked && onDownload(`?mode=sticker&sku=${encodeURIComponent(stPicked.sku)}&copies=${copies}`)}
              className="mr-auto inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber-600 px-5 text-sm font-bold text-white disabled:opacity-40"
            >
              {busy && <Loader2 size={15} className="animate-spin" />} מדבקות לספר
            </button>
          </div>
          {stQuery.trim() && !stPicked && <p className="text-sm text-amber-700">בחרו ספר מהרשימה</p>}
          <button className={btn} disabled={busy} onClick={() => onDownload('?mode=stickers')}>
            {busy && <Loader2 size={15} className="animate-spin" />} מדבקה לכל ספר בקטלוג ({active.length} מדבקות)
          </button>
        </div>

        <div className={row}>
          <div>
            <p className="font-semibold text-slate-900">שני דפים לכל ספר — כל הקטלוג</p>
            <p className="text-sm text-slate-500">PDF אחד, שני עמודים לכל ספר ({active.length * 2} עמודים)</p>
          </div>
          <button className={btn} disabled={busy} onClick={() => onDownload('?mode=sheets')}>
            {busy && <Loader2 size={15} className="animate-spin" />} הורדת PDF
          </button>
        </div>
      </div>
    </div>
  )
}
