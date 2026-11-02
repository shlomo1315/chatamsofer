'use client'
import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

// כפתורים v4: נייבי מלא, מסגרת בז', בלי גרדיאנט וצללים. שינוי כאן משפיע על כל המערכת.
const variantClasses = {
  primary: 'text-white border-0 bg-navy hover:bg-navy-soft focus-visible:ring-gold',
  secondary: 'text-ink border border-line-strong bg-paper hover:bg-sand focus-visible:ring-gold',
  danger: 'text-white border-0 bg-red-700 hover:bg-red-800 focus-visible:ring-red-400',
  ghost: 'bg-transparent text-ink-soft border border-transparent hover:bg-sand focus-visible:ring-gold',
  outline: 'bg-paper text-navy border border-navy/30 hover:bg-sand hover:border-navy focus-visible:ring-gold',
}

const sizeClasses = {
  sm: 'px-3 min-h-[32px] text-sm gap-1.5',
  md: 'px-4 min-h-[40px] text-sm gap-2',
  lg: 'px-5 py-2.5 text-base gap-2',
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, children, className = '', ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          inline-flex items-center justify-center rounded-lg font-medium select-none
          transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1
          disabled:opacity-50 disabled:cursor-not-allowed
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
