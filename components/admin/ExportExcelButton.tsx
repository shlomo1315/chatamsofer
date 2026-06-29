import { FileSpreadsheet } from 'lucide-react'

// כפתור ייצוא לאקסל — קישור ישיר ל-API שמחזיר CSV להורדה (נפתח באקסל).
export default function ExportExcelButton({ type, label = 'ייצוא לאקסל' }: { type: string; label?: string }) {
  return (
    <a
      href={`/api/admin/export?type=${encodeURIComponent(type)}`}
      className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors"
    >
      <FileSpreadsheet size={16} /> {label}
    </a>
  )
}
