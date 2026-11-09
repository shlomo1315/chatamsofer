'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, AlertCircle, LogIn, ShieldAlert, Clock, ShieldCheck, Lock } from 'lucide-react'
import { RETURN_KEY, LOGGED_OUT_AT_KEY, sanitizeReturnTo, returnLabel, sinceWords } from '@/lib/returnTo'
import Button from '@/components/ui/Button'
import EmailInput from '@/components/ui/EmailInput'
import Modal from '@/components/ui/Modal'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)
  // המייל שנחסם — כשהוא מוגדר, הפופאפ פתוח. מחרוזת ריקה = נחסם בלי מייל ידוע.
  const [deniedEmail, setDeniedEmail] = useState<string | null>(null)
  // הטופס נסתר מהמסך. ?recovery=1 חושף אותו — דלת חירום למקרה ש-Google אינו
  // זמין (תקלה אצל גוגל, שינוי הגדרות OAuth, חסימת נטפרי). בלעדיה, תקלה אחת
  // בצד שלישי נועלת את כל הצוות מחוץ למערכת עד לפריסה מחודשת.
  const [recovery, setRecovery] = useState(false)
  // מצב "נותק" (idle/expired), מתי נותק, והדף שאליו חוזרים אחרי כניסה
  const [outReason, setOutReason] = useState<'idle' | 'expired' | null>(null)
  const [outAt, setOutAt] = useState(0)
  const [now, setNow] = useState(0)
  const [returnTo, setReturnTo] = useState<string | null>(null)

  const isPlaceholder =
    process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://placeholder.supabase.co'

  // קריאת מצב מהכתובת: שגיאת callback, והאם התבקש מסלול החירום
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.get('recovery') === '1') setRecovery(true)
    const err = params.get('error')
    if (err === 'unauthorized') setDeniedEmail(params.get('denied') ?? '')
    else if (err === 'auth') setError('ההתחברות נכשלה. נסה שוב.')
    const reason = params.get('reason')
    if (reason === 'idle' || reason === 'expired') {
      setOutReason(reason)
      let at = 0
      try { at = Number(localStorage.getItem(LOGGED_OUT_AT_KEY)) || 0 } catch { /* מצב פרטי */ }
      // ניתוק שהגיע מהשרת (בלי חותמת) נחשב מרגע הטעינה
      const t = Date.now()
      setOutAt(at > 0 && t - at < 24 * 3600 * 1000 ? at : t)
      setNow(t)
    }
    try { setReturnTo(sanitizeReturnTo(localStorage.getItem(RETURN_KEY))) } catch { /* מצב פרטי */ }
  }, [])

  // "נותקת לפני X" מתעדכן חי
  useEffect(() => {
    if (!outReason) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [outReason])

  // סגירת הפופאפ מחזירה למסך כניסה נקי: הכתובת מנוקה מ-error/denied כדי
  // שרענון או "חזור" לא יקפיצו את אותה הודעה שוב.
  // ⚠️ replaceState ולא router.replace — ניווט של Next מרנדר מחדש את הדף
  // ומאבד את מצב הפופאפ באמצע אנימציית הסגירה.
  const closeDenied = useCallback(() => {
    setDeniedEmail(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('error')
    url.searchParams.delete('denied')
    window.history.replaceState(null, '', url.pathname + url.search)
  }, [])

  // כניסה עם Google — לאחר ההתחברות המשתמש חוזר ל-/auth/callback שמוודא הרשאת צוות
  const handleGoogle = async () => {
    setError('')
    setGoogleLoading(true)
    const supabase = createClient()
    // אחרי ניתוק חוזרים לדף האחרון (הנתיב נבדק גם ב-/auth/callback)
    const next = outReason && returnTo ? `?next=${encodeURIComponent(returnTo)}` : ''
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback${next}` },
    })
    if (error) {
      setError('הכניסה עם Google נכשלה. נסה שוב או פנה למנהל המערכת.')
      setGoogleLoading(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isPlaceholder) {
      sessionStorage.setItem('welcomeUser', 'אורח')
      router.push(outReason && returnTo ? returnTo : '/admin/dashboard')
      return
    }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('אימייל או סיסמה שגויים. אנא נסה שוב.')
      setLoading(false)
      return
    }
    let name = email.split('@')[0]
    if (data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', data.user.id)
        .maybeSingle()
      if (profile?.full_name) name = profile.full_name
    }
    sessionStorage.setItem('welcomeUser', name)
    router.push(outReason && returnTo ? returnTo : '/admin/dashboard')
    router.refresh()
  }

  // הטופס מוצג רק במסלול החירום, או כשאין Supabase (פיתוח מקומי)
  const showPasswordForm = recovery || isPlaceholder

  const out = outReason !== null
  const sinceSec = out && now ? (now - outAt) / 1000 : 0

  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-5 py-12 text-white sm:px-4 sm:py-16"
      style={{ background: 'radial-gradient(120% 80% at 50% 0%, #22345e 0%, #14213d 45%, #0e1830 100%)' }}
      dir="rtl"
    >
      {/* מסגרת זהב כפולה, כמו כריכת ספר */}
      <div className="pointer-events-none absolute inset-3 border border-[#c0912f]/55 sm:inset-6" aria-hidden>
        <div className="absolute inset-[6px] border border-[#c0912f]/25" />
      </div>

      <div className="relative flex w-full max-w-[440px] flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-heichal.png"
          alt="לוגו איגוד הצאצאים"
          className="h-[88px] w-[88px] object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,.35)] sm:h-28 sm:w-28"
        />
        <p className="mt-6 text-xs font-medium tracking-[.06em] text-[#d9b35e]">איגוד הצאצאים</p>
        <h1 className="mt-2 text-balance text-[31px] font-black leading-[1.1] sm:text-[39px]">היכל החתם סופר</h1>
        <div className="mb-2 mt-4 flex items-center gap-3 text-[#c0912f]" aria-hidden>
          <i className="block h-px w-14 bg-gradient-to-l from-transparent to-[#c0912f]" />
          <b className="h-1.5 w-1.5 rotate-45 bg-[#c0912f]" />
          <i className="block h-px w-14 bg-gradient-to-r from-transparent to-[#c0912f]" />
        </div>
        <p className="text-sm text-white/65">מערכת ניהול פנימית</p>

        {/* כרטיס נייר */}
        <div className="relative mt-8 w-full rounded-[14px] bg-[#fffdf8] p-5 pb-5 text-[#1b2338] shadow-[0_30px_60px_-20px_rgba(0,0,0,.5)] sm:px-8 sm:pt-8">
          <div className="pointer-events-none absolute inset-[6px] rounded-[10px] border border-[#e6dfcf]" aria-hidden />
          <div className="relative">
          {out ? (
            <div className="animate-[rise_.6s_cubic-bezier(.2,.8,.2,1)_both]">
              <div className="relative mx-auto mb-4 h-[88px] w-[88px]">
                <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90" aria-hidden>
                  <circle cx="48" cy="48" r="42" fill="none" strokeWidth="5" stroke="#f3e9cf" />
                  <circle cx="48" cy="48" r="42" fill="none" strokeWidth="5" stroke="#c0912f" strokeLinecap="round" strokeDasharray="264" strokeDashoffset="0" />
                </svg>
                <div className="absolute inset-0 grid place-items-center text-navy">
                  {outReason === 'idle' ? <Clock size={30} strokeWidth={1.8} aria-hidden /> : <ShieldCheck size={30} strokeWidth={1.8} aria-hidden />}
                </div>
              </div>
              <h2 className="text-xl font-bold">{outReason === 'idle' ? 'נותקת מטעמי אבטחה' : 'יום העבודה נסגר'}</h2>
              <p className="mt-1 text-sm text-[#6b6352]">
                {outReason === 'idle' ? 'לא הייתה פעילות במשך 30 דקות.' : 'עברו 8 שעות מהכניסה, והחיבור נסגר אוטומטית.'}
              </p>
              <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#f3e9cf] px-2.5 py-1 text-xs font-medium text-[#7a5a16]" role="status">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#c0912f]" aria-hidden />
                נותקת <span className="tabular-nums">{sinceWords(sinceSec)}</span>
              </span>
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-bold">כניסה לצוות</h2>
              <p className="mt-1 text-sm text-[#6b6352]">בחשבון Google מורשה</p>
            </div>
          )}

          {isPlaceholder && (
            <div className="mb-5 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3.5">
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700">
                <p className="font-semibold">מצב פיתוח</p>
                <p>Supabase לא מוגדר. לחץ &quot;כניסה&quot; להמשך ללא אימות.</p>
              </div>
            </div>
          )}

          {/* כניסה עם Google — המסלול היחיד במצב רגיל */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="relative mt-5 flex min-h-[52px] w-full items-center justify-center gap-3 rounded-[10px] bg-navy font-bold text-white transition hover:bg-[#22345e] active:scale-[.98] disabled:opacity-70"
          >
            <span className="grid h-7 w-7 place-items-center rounded-full bg-white">
              {googleLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-navy border-t-transparent" aria-hidden />
              ) : (
                <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                  <path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.3-5.6l-6.6-5.6C29.7 34.6 27 36 24 36c-5.2 0-9.6-3.3-11.2-8l-6.6 5.1C9.6 39.6 16.2 44 24 44z"/>
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.6 5.6C41.4 36.9 44 31 44 24c0-1.3-.1-2.3-.4-3.5z"/>
                </svg>
              )}
            </span>
            {googleLoading ? 'מעביר ל-Google…' : out ? 'היכנס שוב' : 'כניסה עם Google'}
          </button>

          {out && (
            <p className="mt-3 text-xs text-[#958c78]">
              אחרי הכניסה תחזור ל<b className="font-medium text-[#1b2338]">{returnLabel(returnTo)}</b>, איפה שעצרת
            </p>
          )}

          {/* שגיאה שאינה חוסר הרשאה (חוסר הרשאה מוצג בפופאפ) */}
          {error && (
            <div className="mt-5 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle size={15} className="flex-shrink-0" />
              {error}
            </div>
          )}

          {showPasswordForm && (
            <>
              <div className="flex items-center gap-3 my-5">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400">
                  {isPlaceholder ? 'או' : 'כניסת חירום'}
                </span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>

              <form onSubmit={handleLogin} className="flex flex-col gap-5">
                {/* Email */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="email" className="text-sm font-medium text-slate-700">אימייל</label>
                  <EmailInput
                    id="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="your@email.com"
                    required={!isPlaceholder}
                    inputClassName="rounded-xl py-3 border-slate-200 focus:ring-indigo-500"
                  />
                </div>

                {/* Password */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="password" className="text-sm font-medium text-slate-700">
                    סיסמה
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required={!isPlaceholder}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 pl-10 text-sm text-slate-900 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  loading={loading}
                  size="lg"
                  className="w-full mt-1 rounded-xl py-3 text-base gap-2 justify-center"
                >
                  {!loading && <LogIn size={18} />}
                  כניסה למערכת
                </Button>
              </form>
            </>
          )}
          </div>
        </div>

        <p className="mt-6 flex items-center gap-2 text-xs text-white/50">
          <Lock size={12} aria-hidden />
          מערכת מאובטחת לשימוש פנימי בלבד
        </p>
      </div>

      {/* פופאפ חוסר הרשאה */}
      <Modal
        open={deniedEmail !== null}
        onClose={closeDenied}
        title="אין הרשאת גישה"
        size="sm"
        footer={
          <Button onClick={closeDenied} className="w-full justify-center rounded-xl">
            חזרה למסך הכניסה
          </Button>
        }
      >
        <div className="flex flex-col items-center text-center gap-4 py-2">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
            <ShieldAlert size={26} className="text-red-500" />
          </div>
          <div className="space-y-2">
            <p className="text-slate-700 text-sm leading-relaxed">
              לחשבון הבא אין הרשאת גישה למערכת:
            </p>
            {deniedEmail ? (
              <p
                className="font-semibold text-slate-900 text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 break-all"
                dir="ltr"
              >
                {deniedEmail}
              </p>
            ) : (
              <p className="font-semibold text-slate-900 text-sm">חשבון Google זה</p>
            )}
            <p className="text-slate-500 text-xs leading-relaxed pt-1">
              אם זה אינו החשבון שהתכוונת להיכנס איתו, סגור את החלון והתחבר עם חשבון אחר.
              אחרת — פנה למנהל המערכת להוספת ההרשאה.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  )
}
