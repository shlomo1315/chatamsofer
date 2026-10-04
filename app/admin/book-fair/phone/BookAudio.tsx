'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { Loader2, Wand2, Upload, Trash2, Play, Search, Check } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { scrambleBytes, DOC_CIPHER_ID } from '@/lib/docCipher'

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
  /** שם קובץ ההקלטה של תפריט הקטגוריות, אם קיימת. */
  const [menuAudio, setMenuAudio] = useState<string | null>(null)
  /** מתי הגדרות הסליקה נכתבו לימות — null אם מעולם לא. */
  const [setupAt, setSetupAt] = useState<string | null>(null)
  /** הודעות הסליקה של ימות ומצב ההקלטה שלהן. */
  const [cardMsgs, setCardMsgs] = useState<
    { code: string; label: string; text: string; recorded: boolean }[]
  >([])
  const [loading, setLoading] = useState(true)
  /** מזהה הפריט שבעבודה — חוסם לחיצה כפולה על אותה שורה. */
  const [busy, setBusy] = useState<string | null>(null)
  const [bulk, setBulk] = useState<{ done: number; left: number } | null>(null)
  const [query, setQuery] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  /** לאיזה פריט מיועדת בחירת הקובץ הנוכחית. */
  const pending = useRef<{ bookId?: string; category?: string; messageKey?: string; cardCode?: string } | null>(null)
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
      // ⚠️ JSON עם base64 ולא תגובת audio/*: נטפרי חוסמת תגובת "קובץ"
      // ב-418, וההשמעה נכשלה אצל כל מי שגולש דרך הסינון. המטען מעורבל
      // בשרת כדי שגם חתימת הקובץ בתוך ה-base64 לא תזוהה — ראו docCipher.
      const payload = await res.json()
      if (!payload?.data) throw new Error(payload?.error ?? 'לא התקבל אודיו')
      const bin = atob(payload.data)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      // ⚠️ enc נבדק ולא מונח: תגובה ישנה שנשמרה במטמון מגיעה בלי
      // הסימון, ופענוח שלה היה הופך קובץ תקין לרעש.
      if (payload.enc === DOC_CIPHER_ID) scrambleBytes(bytes)
      const url = URL.createObjectURL(
        new Blob([bytes], { type: payload.contentType || 'audio/wav' }),
      )
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

  /**
   * @param silent רענון בלי מסך "טוען…".
   *
   * 🔴 אחרי פעולה על שורה בודדת חייבים silent: setLoading(true) מחליף
   * את כל המסך, וכשהוא חוזר הדפדפן מאבד את מיקום הגלילה וקופץ לראש.
   * בהעלאת 111 הקלטות, כל קובץ החזיר את המנהל להתחלה.
   */
  async function load(silent = false) {
    if (!silent) setLoading(true)
    try {
      // ⚠️ שתי קריאות מקבילות: הספרים יושבים בטבלה, ואילו הקלטת תפריט
      // הקטגוריות היא הודעת מערכת ב-app_settings.
      const [r, rm, rs, rc] = await Promise.all([
        fetch('/api/admin/book-fair/book-audio', { cache: 'no-store' }),
        fetch('/api/admin/yemot-book-fair/messages', { cache: 'no-store' }),
        fetch('/api/admin/yemot-book-fair/setup', { cache: 'no-store' }),
        fetch('/api/admin/yemot-book-fair/card-messages', { cache: 'no-store' }),
      ])
      if (rs.ok) {
        const js = await rs.json().catch(() => null)
        setSetupAt(js?.at ?? null)
      }
      if (rc.ok) {
        const jc = await rc.json().catch(() => null)
        setCardMsgs(jc?.messages ?? [])
      }
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'טעינה נכשלה')
      setBooks(j.books ?? [])
      setCategories(j.categories ?? {})
      if (rm.ok) {
        const jm = await rm.json().catch(() => null)
        setMenuAudio(jm?.messages?.category_menu?.audio ?? null)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינה נכשלה')
    } finally {
      if (!silent) setLoading(false)
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
      await load(true)
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
      await load(true)
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
      await load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'היצירה נכשלה')
    } finally {
      setBulk(null)
    }
  }

  function pickFile(target: { bookId?: string; category?: string; messageKey?: string; cardCode?: string }) {
    pending.current = target
    fileRef.current?.click()
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const target = pending.current
    e.target.value = '' // ⚠️ איפוס: בלעדיו בחירת אותו קובץ שוב אינה מפעילה onChange
    if (!file || !target) return
    const key = target.messageKey ? 'menu' : (target.bookId ?? `cat:${target.category}`)
    setBusy(key)
    try {
      const fd = new FormData()
      fd.set('file', file)
      // 🔴 הודעת סליקה — ראוט נפרד: הקובץ נשמר בשם ההודעה של ימות
      // (M1422) ולא בשם שלנו, ואין לו רישום במסד כלל.
      if (target.cardCode) {
        fd.set('code', target.cardCode)
        const r = await fetch('/api/admin/yemot-book-fair/card-messages', { method: 'POST', body: fd })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'ההעלאה נכשלה')
        toast.success('ההקלטה הועלתה')
        await load(true)
        return
      }
      // 🔴 הודעת מערכת עוברת בראוט אחר: היא נשמרת ב-app_settings ולא
      // בטבלת הספרים, ולכן book-audio אינו יודע לטפל בה.
      if (target.messageKey) {
        fd.set('key', target.messageKey)
        const r = await fetch('/api/admin/yemot-book-fair/recording', { method: 'POST', body: fd })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? 'ההעלאה נכשלה')
        toast.success('ההקלטה הועלתה')
        await load(true)
        return
      }
      if (target.bookId) fd.set('book_id', target.bookId)
      if (target.category) fd.set('category', target.category)
      const r = await fetch('/api/admin/book-fair/book-audio', { method: 'POST', body: fd })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'ההעלאה נכשלה')
      toast.success('ההקלטה הועלתה')
      await load(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ההעלאה נכשלה')
    } finally {
      setBusy(null)
    }
  }

  /**
   * יצירת קול טבעי לתפריט הקטגוריות — מהנוסח השמור.
   *
   * ⚠️ הנוסח חייב להכיל את הרשימה עצמה; הוא נערך במסך "נוסחי המערכת".
   */
  async function generateMenu() {
    setBusy('menu')
    try {
      const r = await fetch('/api/admin/yemot-book-fair/generate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'category_menu' }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'יצירת הקול נכשלה')
      toast.success('הקול נוצר')
      await load(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'יצירת הקול נכשלה')
    } finally {
      setBusy(null)
    }
  }

  /**
   * כותב את הגדרות הסליקה לשלוחה בימות.
   *
   * ⚠️ ApiValid נקרא בשרת מהגדרות התשלום ואינו עובר בדפדפן.
   */
  async function setupPayment() {
    setBusy('setup')
    try {
      const r = await fetch('/api/admin/yemot-book-fair/setup', { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'ההגדרה נכשלה')
      toast.success(`שלוחה ${j.ext} הוגדרה · מסוף ${j.terminal}`)
      setSetupAt(new Date().toISOString())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ההגדרה נכשלה')
    } finally {
      setBusy(null)
    }
  }

  /** הסרת הקלטת סליקה — חזרה להודעת ברירת המחדל של ימות. */
  async function removeCardMsg(code: string) {
    setBusy(code)
    try {
      const r = await fetch(
        `/api/admin/yemot-book-fair/card-messages?code=${encodeURIComponent(code)}`,
        { method: 'DELETE' },
      )
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'ההסרה נכשלה')
      toast.success('ההקלטה הוסרה — תישמע ההודעה של ימות')
      await load(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ההסרה נכשלה')
    } finally {
      setBusy(null)
    }
  }

  async function removeMenu() {
    setBusy('menu')
    try {
      const r = await fetch('/api/admin/yemot-book-fair/recording?key=category_menu', { method: 'DELETE' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? 'ההסרה נכשלה')
      toast.success('ההקלטה הוסרה — יישמע הקול הממוחשב')
      await load(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ההסרה נכשלה')
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

      {/* ── הגדרת הסליקה בימות ──
          🔴 "אין מספר מסוף" בטלפון: פקודת credit_card= שאנחנו שולחים
          תקינה, אבל ימות קוראת את פרטי הסליקה (סוג, מסוף, ApiValid,
          קטגוריה) מהגדרות השלוחה. הכפתור כותב אותן מהשרת — המנהל
          אינו נוגע בממשק ימות. */}
      <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900">הגדרות הסליקה בשלוחה</h2>
            <p className="mt-1 text-sm text-slate-600">
              כותב לימות את מספר המסוף, הקטגוריה וה-ApiValid. נדרש פעם
              אחת, ושוב רק אם ההגדרות בימות השתנו.
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {setupAt && <Badge ok>מוגדר</Badge>}
            <Button onClick={() => void setupPayment()} disabled={busy === 'setup'}>
              {busy === 'setup'
                ? <><Loader2 size={15} className="animate-spin" /> מגדיר…</>
                : <><Wand2 size={15} /> {setupAt ? 'הגדר מחדש' : 'הגדר סליקה בימות'}</>}
            </Button>
          </div>
        </div>
      </section>

      {/* ── הקלטות הסליקה ──
          🔴 אלה הודעות המערכת של ימות (M1422 וכו'), לא הודעות שלנו:
          מרגע ששולחים credit_card= ימות מקריאה אותן בקול שלה. העלאת
          קובץ בשם ההודעה בתיקיית השלוחה דורסת אותה. */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 font-semibold text-slate-900">הקלטות הסליקה</h2>
        <p className="mb-4 text-sm text-slate-600">
          ההנחיות שימות מקריאה בזמן התשלום. בלי הקלטה הן נשמעות בקול
          הממוחשב של ימות.
        </p>
        <ul className="flex flex-col divide-y divide-slate-100">
          {cardMsgs.map(m => (
            <li key={m.code} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="w-16 flex-shrink-0 font-mono text-xs text-slate-400">{m.code}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-slate-800">{m.label}</span>
                <span className="truncate text-xs text-slate-400">{m.text}</span>
              </span>
              {m.recorded ? <Badge ok>מוקלט</Badge> : <Badge>קול ימות</Badge>}
              <RowActions
                busy={busy === m.code}
                playing={playing === m.code}
                onPlay={undefined}
                onGenerate={() => toast.error('להודעות הסליקה אין יצירת קול — יש להעלות הקלטה')}
                onUpload={() => pickFile({ cardCode: m.code })}
                onRemove={m.recorded ? () => void removeCardMsg(m.code) : undefined}
              />
            </li>
          ))}
        </ul>
      </section>

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
        <h2 className="mb-1 font-semibold text-slate-900">תפריט הקטגוריות</h2>
        <p className="mb-4 text-sm text-slate-600">
          הקלטה אחת שאומרת את כל הרשימה — ״לשאלות ותשובות הקישו 1, לדרוש
          ואגדה הקישו 2…״. היא מושמעת כמות שהיא, בלי שהמערכת מוסיפה דבר.
        </p>

        {/* ── הקלטה אחת בלבד ──
            🔴 תשע ההקלטות הנפרדות הוסרו: הן חייבו תשעה קבצים, והמערכת
            הוסיפה אחרי כל אחת את מספר ההקשה בנפרד. קובץ אחד שמכיל את
            המשפט המלא הוא מה שהמנהל באמת צריך.
            ⚠️ הרשימה המוקלטת קבועה, ואילו הקטגוריות נבנות מהקטלוג —
            הוספת קטגוריה או שינוי סדר מחייבים הקלטה מחדש. */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800">
              {menuAudio ? 'ההקלטה פעילה' : 'אין הקלטה — נשמע קול ממוחשב'}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {catNames.length} קטגוריות: {catNames.join(' · ')}
            </p>
          </div>
          {menuAudio ? <Badge ok>מוקלט</Badge> : <Badge>קול ממוחשב</Badge>}
          <RowActions
            busy={busy === 'menu'}
            playing={playing === 'menu'}
            onPlay={menuAudio ? () => play('menu', 'key=category_menu') : undefined}
            onGenerate={() => void generateMenu()}
            onUpload={() => pickFile({ messageKey: 'category_menu' })}
            onRemove={menuAudio ? () => void removeMenu() : undefined}
          />
        </div>
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
