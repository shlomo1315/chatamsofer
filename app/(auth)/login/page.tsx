'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Building2, Eye, EyeOff, AlertCircle } from 'lucide-react'
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-100 via-cyan-50 to-blue-100 p-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="w-28 h-28 bg-white rounded-2xl flex items-center justify-center shadow-lg border border-sky-200 overflow-hidden p-2">
            {logoError ? (
              <Building2 size={40} className="text-sky-600" />
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
            <h1 className="text-xl font-bold text-slate-800 leading-snug">
              ברוכים הבאים לתוכנת ניהול<br />היכל החתם סופר
            </h1>
            <p className="text-slate-500 text-sm mt-2">כניסה למערכת</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-6">
          {isPlaceholder && (
            <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-700">
                <p className="font-semibold">מצב פיתוח</p>
                <p>Supabase לא מוגדר. לחץ &quot;כניסה&quot; להמשך ללא אימות.</p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">אימייל</label>
              <EmailInput
                id="email"
                value={email}
                onChange={setEmail}
                placeholder="your@email.com"
                required={!isPlaceholder}
                inputClassName="py-2.5"
              />
            </div>

            <div className="flex flex-col gap-1">
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pl-10 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle size={15} />
                {error}
              </div>
            )}

            <Button type="submit" loading={loading} size="lg" className="w-full mt-1">
              כניסה למערכת
            </Button>
          </form>
        </div>

        <p className="text-center text-slate-500 text-xs mt-4">
          מערכת מאובטחת לשימוש פנימי בלבד
        </p>
      </div>
    </div>
  )
}
