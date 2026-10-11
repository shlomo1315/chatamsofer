'use client'

// שדה הטקסט הסטנדרטי של הפורטל הציבורי (הרישום ובורר הדורות).
export default function TextInput({ className = '', ...props }: React.ComponentPropsWithRef<'input'>) {
  return (
    <input
      className={`rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 bg-white shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-2 focus:ring-indigo-500/80 focus:border-indigo-400 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.12)] placeholder:text-slate-400 transition-all duration-150 ${className}`}
      {...props}
    />
  )
}
