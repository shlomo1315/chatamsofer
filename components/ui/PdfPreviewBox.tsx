import { FileText } from 'lucide-react'

// תצוגה מקדימה של מסמך PDF — אייקון סטטי, ללא הטמעת הקובץ עצמו.
//
// ⚠️ אין להחזיר כאן <iframe> בשום צורה. נטפרי חוסם את ה-PDF viewer של הדפדפן
// כשהוא רץ בתוך iframe, ומציג במקומו את דף ה-NETFREE — כלומר המשתמש רואה
// הודעת חסימה במקום התצוגה המקדימה. פתיחת הקובץ עצמה נעשית בניווט מלא
// (כרטיסייה חדשה או חלונית הצפייה), וזה אינו נחסם כי היעד הוא הדומיין שלנו.
export default function PdfPreviewBox({
  className = '',
  iconSize = 28,
  label = 'מסמך PDF',
}: {
  className?: string
  iconSize?: number
  label?: string
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-1.5 bg-rose-50/50 text-rose-400 ${className}`}>
      <FileText size={iconSize} />
      <span className="text-[11px] font-medium">{label}</span>
    </div>
  )
}
