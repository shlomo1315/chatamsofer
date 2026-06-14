export default function AdminLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-4">
      <div className="h-10 w-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
      <p className="text-sm text-slate-500">טוען נתונים…</p>
    </div>
  )
}
