'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Building2, Eye, EyeOff, AlertCircle, LogIn } from 'lucide-react'
import Button from '@/components/ui/Button'
import EmailInput from '@/components/ui/EmailInput'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)
  const [logoError, setLogoError] = useState(false)

  const isPlaceholder =
    process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://placeholder.supabase.co'

  // הודעת שגיאה מהפניית ה-callback (למשל חשבון Google ללא הרשאת צוות)
  useEffect(() => {
    const err = new URLSearchParams(window.location.search).get('error')
    if (err === 'unauthorized') setError('חשבון Google זה אינו מורשה לכניסה. פנה למנהל המערכת להוספת האימייל שלך.')
    else if (err === 'auth') setError('ההתחברות נכשלה. נסה שוב.')
  }, [])

  // כניסה עם Google — לאחר ההתחברות המשתמש חוזר ל-/auth/callback שמוודא הרשאת צוות
  const handleGoogle = async () => {
    setError('')
    setGoogleLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
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
      router.push('/admin/dashboard')
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
    router.push('/admin/dashboard')
    router.refresh()
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'radial-gradient(ellipse at 60% 20%, #eef2ff 0%, #f8fafc 55%, #e0e7ff 100%)',
      }}
      dir="rtl"
    >
      <div className="w-full max-w-md">
        {/* Logo + org name above card */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="w-24 h-24 bg-white rounded-2xl flex items-center justify-center shadow-lg border border-indigo-100 overflow-hidden p-2">
            {logoError ? (
              <Building2 size={36} className="text-indigo-500" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/logo.png"
                alt="היכל החתם סופר"
                className="w-full h-full object-contain"
                onError={() => setLogoError(true)}
              />
            )}
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-slate-800 leading-snug">
              היכל החתם סופר
            </h1>
            <p className="text-slate-500 text-sm mt-1">מערכת ניהול פנימית</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl p-8 sm:p-10">
          <h2 className="text-lg font-semibold text-slate-700 text-center mb-6">
            כניסה למערכת
          </h2>

          {isPlaceholder && (
            <div className="mb-5 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3.5">
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700">
                <p className="font-semibold">מצב פיתוח</p>
                <p>Supabase לא מוגדר. לחץ &quot;כניסה&quot; להמשך ללא אימות.</p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700">אימייל</label>
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

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircle size={15} className="flex-shrink-0" />
                {error}
              </div>
            )}

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

          {/* מפריד */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs text-slate-400">או</span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* כניסה עם Google */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.5 0 10.5-2.1 14.3-5.6l-6.6-5.6C29.7 34.6 27 36 24 36c-5.2 0-9.6-3.3-11.2-8l-6.6 5.1C9.6 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.6 5.6C41.4 36.9 44 31 44 24c0-1.3-.1-2.3-.4-3.5z"/>
            </svg>
            {googleLoading ? 'מתחבר...' : 'כניסה עם Google'}
          </button>
        </div>

        <p className="text-center text-slate-400 text-xs mt-5">
          מערכת מאובטחת לשימוש פנימי בלבד
        </p>
      </div>
    </div>
  )
}
