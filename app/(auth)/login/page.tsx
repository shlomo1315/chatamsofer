'use client'
import { useState } from 'react'
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
  const [logoError, setLogoError] = useState(false)

  const isPlaceholder =
    process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://placeholder.supabase.co'

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
        </div>

        <p className="text-center text-slate-400 text-xs mt-5">
          מערכת מאובטחת לשימוש פנימי בלבד
        </p>
      </div>
    </div>
  )
}
