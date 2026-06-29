'use client'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

// עיצוב מודרני עם עומק עדין (גרדיאנט מלמעלה-למטה + צל מותג + הרמה ב-hover ולחיצה ב-active).
const variantClasses = {
  primary:
    'text-white border-0 bg-gradient-to-b from-indigo-500 to-indigo-600 ring-1 ring-inset ring-white/15 ' +
    'shadow-[0_1px_2px_rgba(15,23,42,0.18),0_8px_18px_-6px_rgba(79,70,229,0.55)] ' +
    'hover:from-indigo-500 hover:to-indigo-700 hover:shadow-[0_2px_4px_rgba(15,23,42,0.2),0_14px_26px_-8px_rgba(79,70,229,0.65)] ' +
    'hover:-translate-y-0.5 focus-visible:ring-indigo-400',
  secondary:
    'text-slate-700 border border-slate-200 bg-gradient-to-b from-white to-slate-50 ' +
    'shadow-[0_1px_2px_rgba(15,23,42,0.06),0_4px_10px_-6px_rgba(15,23,42,0.15)] ' +
    'hover:to-slate-100 hover:border-slate-300 hover:-translate-y-0.5 focus-visible:ring-slate-300',
  danger:
    'text-white border-0 bg-gradient-to-b from-rose-500 to-rose-600 ring-1 ring-inset ring-white/15 ' +
    'shadow-[0_1px_2px_rgba(15,23,42,0.18),0_8px_18px_-6px_rgba(225,29,72,0.5)] ' +
    'hover:from-rose-500 hover:to-rose-700 hover:-translate-y-0.5 focus-visible:ring-rose-400',
  ghost:
    'bg-transparent text-slate-600 border border-transparent hover:bg-slate-100 focus-visible:ring-slate-300',
  outline:
    'bg-white text-indigo-700 border border-indigo-200 ' +
    'shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-indigo-50 hover:border-indigo-300 hover:-translate-y-0.5 focus-visible:ring-indigo-300',
}

const sizeClasses = {
  sm: 'px-3.5 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, children, className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          inline-flex items-center justify-center rounded-xl font-semibold select-none
          transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1
          active:translate-y-0 active:scale-[0.98]
          disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${className}
        `}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
export default Button
