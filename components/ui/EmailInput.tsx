'use client'
import { useState, useRef, useCallback, InputHTMLAttributes, forwardRef } from 'react'

const DOMAINS = [
  'gmail.com',
  'walla.co.il',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'bezeqint.net',
  'zahav.net.il',
  'netvision.net.il',
  '012.net.il',
  '013.net',
  'icloud.com',
]

interface EmailInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  value: string
  onChange: (value: string) => void
  label?: string
  error?: string
  hint?: string
  inputClassName?: string
}

const EmailInput = forwardRef<HTMLInputElement, EmailInputProps>(
  ({ value, onChange, label, error, hint, inputClassName = '', id, className, ...props }, ref) => {
    const [suggestions, setSuggestions] = useState<string[]>([])
    const [activeIndex, setActiveIndex] = useState(-1)
    const containerRef = useRef<HTMLDivElement>(null)
    const inputId = id || label

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      onChange(val)
      setActiveIndex(-1)

      const atIdx = val.lastIndexOf('@')
      if (atIdx === -1) {
        setSuggestions([])
        return
      }
      const local = val.slice(0, atIdx)
      const domainPart = val.slice(atIdx + 1).toLowerCase()
      if (!local) { setSuggestions([]); return }

      const filtered = DOMAINS
        .filter(d => d.startsWith(domainPart) && d !== domainPart)
        .map(d => `${local}@${d}`)
      setSuggestions(filtered)
    }, [onChange])

    const pick = useCallback((s: string) => {
      onChange(s)
      setSuggestions([])
      setActiveIndex(-1)
    }, [onChange])

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!suggestions.length) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex(i => Math.min(i + 1, suggestions.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex(i => Math.max(i - 1, -1))
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (activeIndex >= 0) {
          e.preventDefault()
          pick(suggestions[activeIndex])
        } else {
          setSuggestions([])
        }
      } else if (e.key === 'Escape') {
        setSuggestions([])
        setActiveIndex(-1)
      }
    }, [suggestions, activeIndex, pick])

    return (
      <div ref={containerRef} className={`relative flex flex-col gap-1 ${className ?? ''}`}>
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
            {label}
            {props.required && <span className="text-red-500 mr-1">*</span>}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          type="email"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setSuggestions([]), 150)}
          autoComplete="off"
          dir="ltr"
          className={`
            w-full rounded-lg border px-3 py-2 text-sm text-slate-900
            placeholder:text-slate-400 bg-white
            focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
            disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed
            transition-colors
            ${error ? 'border-red-400 focus:ring-red-400' : 'border-slate-300'}
            ${inputClassName}
          `}
          {...props}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}

        {suggestions.length > 0 && (
          <ul className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden text-sm">
            {suggestions.map((s, i) => (
              <li
                key={s}
                onMouseDown={() => pick(s)}
                className={`px-3 py-2 cursor-pointer transition-colors ${
                  i === activeIndex ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'
                }`}
                dir="ltr"
              >
                {s}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
)

EmailInput.displayName = 'EmailInput'
export default EmailInput
