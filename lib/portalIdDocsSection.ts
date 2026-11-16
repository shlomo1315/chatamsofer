// האם להציג בפורטל את קטע העלאת צילומי תעודות הזהות והספחים.
//
// 🔴 בבקשת לידה (רגילה ושקטה) הצילומים נדרשים גם ממשפחה מאושרת — השרת
// (app/api/portal/birth-request) דוחה בקשה בלעדיהם. עד כה הקטע הוסתר
// ממשפחה מאושרת, ולכן היא ראתה רק את אישור הלידה, לא היה לה איפה להעלות
// את הת"ז, והבקשה נדחתה עם "חובה לצרף: תעודת זהות…" (16.11).
export function shouldShowIdDocsSection(opts: {
  hasBeneficiary: boolean
  isApproved: boolean
  isBirthRequest: boolean
  forceFresh?: boolean
}): boolean {
  if (!opts.hasBeneficiary) return false
  if (opts.forceFresh) return true
  return !opts.isApproved || opts.isBirthRequest
}
