import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50 text-center px-4">
      <p className="text-6xl font-bold text-indigo-600">404</p>
      <div>
        <h1 className="text-xl font-bold text-slate-900">העמוד לא נמצא</h1>
        <p className="text-sm text-slate-500 mt-1">העמוד שחיפשתם אינו קיים או שהוסר.</p>
      </div>
      <Link
        href="/"
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
      >
        חזרה לעמוד הבית
      </Link>
    </div>
  )
}
