'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { Loader2, Wand2, Upload, Trash2, Play, Search, Check } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

// ─────────────────────────────────────────────────────────────────────────────
// הקלטות הספרים והקטגוריות בשלוחה הטלפונית.
//
// 🔴 למה: שם הספר מוקרא ב-TTS של ימות, ושמות ספרי קודש ("שו״ת חתם
// סופר", "ליקוטי הערות") יוצאים משובשים. הקלטה לכל ספר נשמעת נכון.
//
// ⚠️ הקלטה *תמיד* גוברת על הקול הממוחשב — זו ההתנהגות בכל השלוחה.
// ⚠️ 111 ספרים: היצירה הגורפת רצה במנות של 25, אחרת הבקשה נקטעת
// ב-timeout באמצע ומשאירה חלק מוקלט וחלק לא, בלי לדעת היכן נעצרה.
// ─────────────────────────────────────────────────────────────────────────────

type Book = {
  id: string; sku: string; title: string
  /** המכון/ההוצאה — מוצג לצד השם כדי להבחין בין מהדורות של אותו חיבור. */
  publisher: string | null
  description: string | null; audio_name: string | null
}

export default function BookAudio() {
  const toast = useToast()
  const [books, setBooks] = useState<Book[]>([])
  const [categories, setCategories] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  /** מזהה הפריט שבעבודה — חוסם לחיצה כפולה על אותה שורה. */
  const [busy, setBusy] = useState<string | null>(null)
  const [bulk, setBulk] = useState<{ done: number; left: number } | null>(null)
  const [query, setQuery] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  /** לאיזה פריט מיועדת בחירת הקובץ הנוכחית. */
  const pending = useRef<{ bookId?: string; category?: string } | null>(null)
  /** איזו הקלטה מתנגנת כרגע. */
  const [playing, setPlaying] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  /**
   * משמיע את ההקלטה שבאמת יושבת בימות.
   *
   * ⚠️ עוצר ניגון קודם: בלי זה לחיצה על שורה שנייה ניגנה את שתיהן
   * יחד, ואי אפשר היה להבחין איזו מהן נשמעת.
   */
  async function play(id: string, params: string) {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setPlaying(id)
    try {
      const res = await fetch(`/api/admin/book-fair/play-audio?${params}`, { cache: 'no-store' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? `ההשמעה נכשלה (${res.status})`)
      }
      // ⚠️ blob ולא כתובת ישירה ב-src: הראוט דורש הרשאת צוות, ותגית
      // audio רגילה אינה שולחת את העוגיות בכל הדפדפנים.
      const url = URL.createObjectURL(await res.blob())
      const el = new Audio(url)
      audioRef.current = el
      const done = () => {
        URL.revokeObjectURL(url)
        if (audioRef.current === el) audioRef.current = null
        setPlaying(null)
      }
      el.onended = done
      el.onerror = () => { done(); toast.error('הדפדפן לא הצליח לנגן את הקובץ') }
      await el.play()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה בהשמעה')
      setPlaying(null)
    }
  }

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/book-fair/book-audio', { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'טעינה נכשלה')
      setBooks(j.books ?? [])
      setCategories(j.categories ?? {})
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינה נכשלה')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** שמות הקטגוריות לפי סדר הקטלוג (נגזר מהמק"ט). */
  const catNames = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const b of books) {
      const c = (b.description ?? '').trim()
      if (c && !seen.has(c)) { seen.add(c); out.push(c) }
    }
    return out
  }, [books])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return books
    return books.filter(b =>
      b.sku.toLowerCase().includes(q)
      || b.title.toLowerCase().includes(q)
      // ⚠️ גם לפי ההוצאה: כך אפשר לאתר בבת אחת את כל ספרי מכון מסוים.
      || (b.publisher ?? '').toLowerCase().includes(q)
      // גם לפי קטגוריה — לאתר בבת אחת את כל ספרי "שבת ומועדים".
      || (b.description ?? '').toLowerCase().includes(q))
  }, [books, query])

  const withAudio = books.filter(b => b.audio_name).length

  async function act(
    key: string,
    body: Record<string, unknown>,
    ok: string,
  ) {
    setBusy(key)
    try {
      const r = await fetch('/api/admin/book-fair/book-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'הפעולה נכשלה')
      toast.success(ok)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'הפעולה נכשלה')
    } finally {
      setBusy(null)
    }
  }

  async function remove(key: string, params: string) {
    setBusy(key)
    try {
      const r = await fetch(`/api/admin/book-fair/book-audio?${params}`, { method: 'DELETE' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'המחיקה נכשלה')
      toast.success('ההקלטה הוסרה — יישמע הקול הממוחשב')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'המחיקה נכשלה')
    } finally {
      setBusy(null)
    }
  }

  /** יצירה גורפת — מנות של 25 עד שלא נותר דבר. */
  async function generateAll() {
    setBulk({ done: 0, left: books.filter(b => !b.audio_name).length })
    let total = 0
    try {
      for (;;) {
        const r = await fetch('/api/admin/book-fair/book-audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ all: true }),
        })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'היצירה נכשלה')
        total += j.done ?? 0
        setBulk({ done: total, left: j.remaining ?? 0 })
        if (j.failed?.length) console.warn('[book-audio] נכשלו:', j.failed)
        // ⚠️ עצירה גם כשמנה שלמה נכשלה — אחרת לולאה אינסופית.
        if (!j.remaining || !j.done) break
      }
      toast.success(`נוצרו ${total} הקלטות`)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'היצירה נכשלה')
    } finally {
      setBulk(null)
    }
  }

  function pickFile(target: { bookId?: string; category?: string }) {
    pending.current = target
    fileRef.current?.click()
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const target = pending.current
    e.target.value = '' // ⚠️ איפוס: בלעדיו בחירת אותו קובץ שוב אינה מפעילה onChange
    if (!file || !target) return
    const key = target.bookId ?? `cat:${target.category}`
    setBusy(key)
    try {
      const fd = new FormData()
      fd.set('file', file)
      if (target.bookId) fd.set('book_id', target.bookId)
      if (target.category) fd.set('category', target.category)
      const r = await fetch('/api/admin/book-fair/book-audio', { method: 'POST', body: fd })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'ההעלאה נכשלה')
      toast.success('ההקלטה הועלתה')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ההעלאה נכשלה')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-slate-500">
        <Loader2 size={18} className="animate-spin" /> טוען…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <input
        ref={fileRef} type="file" accept="audio/*" hidden onChange={onFile}
      />

      {/* ── כותרת ופעולה גורפת ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">הקלטות הספרים</h2>
            <p className="mt-1 text-sm text-slate-600">
              שם הספר מוקרא בטלפון. בלי הקלטה הוא נקרא בקול ממוחשב,
              ושמות ספרי קודש יוצאים משובשים.
            </p>
            <p className="mt-1.5 text-sm font-medium text-slate-700">
              {withAudio} מתוך {books.length} ספרים עם הקלטה
            </p>
          </div>
          <Button
            onClick={generateAll}
            disabled={!!bulk || withAudio === books.length}
            className="flex-shrink-0"
          >
            {bulk
              ? <><Loader2 size={15} className="animate-spin" /> נוצרו {bulk.done} · נותרו {bulk.left}</>
              : <><Wand2 size={15} /> צור קול טבעי לכל הספרים</>}
          </Button>
        </div>
      </section>

      {/* ── קטגוריות ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 font-semibold text-slate-900">הקלטות הקטגוריות</h2>
        <p className="mb-3 text-sm text-slate-600">
          נשמעות בתפריט הקטגוריות, לפני מספר ההקשה.
        </p>
        <ul className="flex flex-col divide-y divide-slate-100">
          {catNames.map(name => {
            const key = `cat:${name}`
            const rec = categories[name]
            return (
              <li key={name} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="min-w-0 flex-1 truncate text-slate-800">{name}</span>
                {rec
                  ? <Badge ok>מוקלט</Badge>
                  : <Badge>קול ממוחשב</Badge>}
                <RowActions
                  busy={busy === key}
                  playing={playing === key}
                  onPlay={rec ? () => play(key, `category=${encodeURIComponent(name)}`) : undefined}
                  onGenerate={() => act(key, { category: name }, 'הקול נוצר')}
                  onUpload={() => pickFile({ category: name })}
                  onRemove={rec ? () => remove(key, `category=${encodeURIComponent(name)}`) : undefined}
                />
              </li>
            )
          })}
        </ul>
      </section>

      {/* ── ספרים ── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="relative mb-3">
          <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="חיפוש לפי שם או מק״ט"
            className="w-full rounded-xl border border-slate-200 py-2 pr-10 pl-3 text-sm outline-none focus:border-indigo-400"
          />
        </div>

        <ul className="flex flex-col divide-y divide-slate-100">
          {filtered.map(b => (
            <li key={b.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="w-16 flex-shrink-0 font-mono text-xs text-slate-400">{b.sku}</span>
              {/* ⚠️ השם וההוצאה בעמודה אחת: אותו חיבור יוצא בכמה מהדורות
                  ("שו״ת חתם סופר" במכון החתם סופר ובהוצאת ראטה), והשם לבדו
                  אינו מזהה את הספר. בנייד ההוצאה יורדת לשורה שנייה במקום
                  לדחוק את השם. */}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-slate-800">{b.title}</span>
                {/* ⚠️ הקטגוריה יושבת ב-description (כך הגיעה מהאקסל)
                    ואינה עמודה משלה — ראו lib/bookFairCatalog. */}
                {(b.publisher?.trim() || b.description?.trim()) && (
                  <span className="truncate text-xs text-slate-400">
                    {b.description?.trim() && (
                      <span className="text-indigo-400">{b.description.trim()}</span>
                    )}
                    {b.description?.trim() && b.publisher?.trim() && ' · '}
                    {b.publisher?.trim()}
                  </span>
                )}
              </span>
              {b.audio_name
                ? <Badge ok>מוקלט</Badge>
                : <Badge>קול ממוחשב</Badge>}
              <RowActions
                busy={busy === b.id}
                playing={playing === b.id}
                onPlay={b.audio_name ? () => play(b.id, `book_id=${b.id}`) : undefined}
                onGenerate={() => act(b.id, { book_id: b.id }, 'הקול נוצר')}
                onUpload={() => pickFile({ bookId: b.id })}
                onRemove={b.audio_name ? () => remove(b.id, `book_id=${b.id}`) : undefined}
              />
            </li>
          ))}
          {!filtered.length && (
            <li className="py-6 text-center text-sm text-slate-400">לא נמצאו ספרים</li>
          )}
        </ul>
      </section>
    </div>
  )
}

function Badge({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
      ok ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
    }`}>
      {ok && <Check size={11} className="ms-0.5 inline" />} {children}
    </span>
  )
}

function RowActions({ busy, playing, onPlay, onGenerate, onUpload, onRemove }: {
  busy: boolean
  /** האם ההקלטה של השורה הזו מתנגנת כרגע. */
  playing?: boolean
  /** קיים רק כשיש הקלטה בפועל — אין טעם בכפתור שישמיע כלום. */
  onPlay?: () => void
  onGenerate: () => void
  onUpload: () => void
  onRemove?: () => void
}) {
  if (busy) {
    return <Loader2 size={16} className="mx-2 flex-shrink-0 animate-spin text-indigo-500" />
  }
  return (
    <div className="flex flex-shrink-0 items-center gap-1">
      {/* 🔴 השמעת מה שבאמת יושב בימות — לא תצוגה מקדימה של TTS.
          בלי זה אין שום דרך לוודא *איזה* קובץ נשמר, והטעות מתגלה
          רק בשיחה אמיתית. */}
      {onPlay && (
        <IconBtn title="השמעת ההקלטה" onClick={onPlay}>
          {playing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
        </IconBtn>
      )}
      <IconBtn title="צור קול טבעי" onClick={onGenerate}><Wand2 size={14} /></IconBtn>
      <IconBtn title="העלאת הקלטה" onClick={onUpload}><Upload size={14} /></IconBtn>
      {onRemove && (
        <IconBtn title="הסרת ההקלטה" onClick={onRemove} danger><Trash2 size={14} /></IconBtn>
      )}
    </div>
  )
}

function IconBtn({ children, title, onClick, danger }: {
  children: React.ReactNode; title: string; onClick: () => void; danger?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${
        danger
          ? 'border-rose-200 text-rose-500 hover:bg-rose-50'
          : 'border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600'
      }`}
    >
      {children}
    </button>
  )
}
