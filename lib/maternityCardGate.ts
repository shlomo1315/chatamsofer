// ─────────────────────────────────────────────────────────────────────────────
// 🔴 שיוך כרטיס בשלוחת היולדות — רק למי שנוכה לה כרטיס מהמלאי.
//
// יולדת קיבלה כרטיס במוקד בלי שובר, ושייכה אותו בטלפון. השיוך הצליח, אבל
// 600 ₪ לא נטענו: לא היה מלאי, ולא נוכה לה כרטיס. אחר כך נדרים ענה לה
// שהכרטיס "כבר משויך". סוכם עם שמרלר (26.10.2026): מי שלא נוכה לה כרטיס
// מהמלאי לא יכולה לשייך כרטיס בכלל.
//
// ⚠️ הכלל חיובי ולא שלילי: לא מסתפקים ב-card_status='awaiting_stock'. במסד
// יש עשרות לידות מאושרות שלא נטען להן כרטיס ונשארו 'pending', וחסימה לפי
// awaiting_stock בלבד הייתה משאירה אותן פתוחות.
// ⚠️ 'unloaded' חסום: הטעינה בוטלה, ו-card_tlush_id נשמר רק לתיעוד.
// ─────────────────────────────────────────────────────────────────────────────

export interface CardGateAid {
  card_status?: string | null
  card_load_status?: string | null
  card_tlush_id?: string | null
}

export function canLinkMaternityCard(aid: CardGateAid): boolean {
  if (aid.card_status === 'awaiting_stock') return false
  if (aid.card_load_status === 'unloaded') return false
  return aid.card_load_status === 'loaded' || !!aid.card_tlush_id
}
