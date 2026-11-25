import { lineageInquiryTag, type InquiryRow, type LineageInquiryTag } from '@/lib/lineageInquiryTag'

// תווית בירור סדר הדורות ליד שם המשפחה: "נשלח לבירור" / "חזר מבירור - בדיקה מעמיקה".
// מוצגת רק למי שבבדיקה מעמיקה — ראו lib/lineageInquiryTag.
export default function LineageInquiryBadge({ row, tag: given }: { row?: InquiryRow; tag?: LineageInquiryTag | null }) {
  const tag = given !== undefined ? given : row ? lineageInquiryTag(row) : null
  if (!tag) return null
  const tone = tag.kind === 'returned'
    ? 'border-violet-300 bg-violet-100 text-violet-900'
    : 'border-amber-300 bg-amber-100 text-amber-900'
  return (
    <span title={tag.label}
      className={`animate-inquiry-blink inline-flex flex-none items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold leading-tight ${tone}`}>
      {tag.label}
    </span>
  )
}
