// קטלוג הטקסטים העריכים של שוברי היולדות — key, תווית, ברירת מחדל.
// ברירות המחדל זהות ל-literals שבקוד ה-render (lib/maternityVoucher.ts,
// lib/instructionsSheet.ts). המפתחות מקובצים לפי שובר, לתצוגה במסך ההגדרות.

export interface VoucherTextField {
  key: string
  label: string
  default: string
  multiline?: boolean
}
export interface VoucherTextGroup {
  id: 'card' | 'recovery' | 'instructions'
  title: string
  fields: VoucherTextField[]
}

export const VOUCHER_TEXT_GROUPS: VoucherTextGroup[] = [
  {
    id: 'card',
    title: 'שובר כרטיס מזון',
    fields: [
      { key: 'card.title', label: 'כותרת ראשית', default: 'שובר לקבלת כרטיס לרכישת אוכל מוכן' },
      { key: 'card.intro', label: 'פסקת פתיחה', multiline: true,
        default: 'הננו שמחים לבשר לכם כי הנהלת "היכל החתם סופר" — אגף עזר ליולדות, אישרה את בקשתכם לקבלת כרטיס מזון טעון לרכישת מזון מוכן ליולדת, כמפורט להלן.' },
      { key: 'card.amount', label: 'שורת סכום הטעינה', default: 'סכום טעינת הכרטיס: 600 ש"ח' },
      { key: 'card.warning', label: 'אזהרה אדומה', multiline: true,
        default: 'חובה להדפיס שובר זה ולהביאו למוקד החלוקה לצורך קבלת הכרטיס — לא נוכל להעניק כרטיס בלי אישור זה!' },
      { key: 'card.centers_title', label: 'כותרת מוקדי איסוף', default: 'מוקדי איסוף הכרטיס' },
      { key: 'card.centers_note', label: 'הערת מוקדים', default: 'תוכלו לבחור בכל מוקד לקבלת הכרטיס.' },
      { key: 'card.activation_title', label: 'כותרת הפעלה', default: 'הפעלת הכרטיס — חובה לפני השימוש!' },
      { key: 'card.activation_line', label: 'שורת הפעלה', default: 'לאחר קבלת הכרטיס, חובה להפעילו בהתקשרות למוקד:' },
      { key: 'card.activation_phone', label: 'טלפון הפעלה', default: 'להפעלה חייגו: 02-3131325 שלוחה 1' },
      { key: 'card.validity', label: 'הערת תוקף', multiline: true,
        default: 'הכרטיס בתוקף עד 6 שבועות מהלידה, ורק לרכישת מזון מוכן ליולדת ובני ביתה. השובר אישי ואינו ניתן להעברה.' },
      { key: 'card.blessing', label: 'ברכת סיום', default: 'בברכת מזל טוב ורוב נחת' },
      { key: 'card.signature', label: 'חתימה', default: 'אגף עזר ליולדות · היכל החתם סופר' },
    ],
  },
  {
    id: 'recovery',
    title: 'שובר בית החלמה',
    fields: [
      { key: 'recovery.title', label: 'כותרת ראשית', default: 'שובר הבראה ליולדת' },
      { key: 'recovery.mazaltov', label: 'שורת מזל טוב', default: 'מזל טוב לרגל השמחה!' },
      { key: 'recovery.body', label: 'פסקת גוף', multiline: true,
        default: 'שובר זה מאשר את זכאותכם לשהות הבראה בבית ההחלמה לאחר הלידה. נא להציג שובר זה בעת ההגעה.' },
      { key: 'recovery.note', label: 'הערת סיום', multiline: true,
        default: 'לתשומת לבכם: יש לתאם מראש את מועד ההגעה מול בית ההחלמה. השובר אישי ואינו ניתן להעברה. לבירורים ניתן לפנות למזכירות היכל החתם סופר.' },
      { key: 'recovery.blessing', label: 'ברכת סיום', default: 'בברכת מזל טוב ורוב נחת' },
      { key: 'recovery.signature', label: 'חתימה', default: 'אגף עזר ליולדות · היכל החתם סופר' },
    ],
  },
  {
    id: 'instructions',
    title: 'דף הנחיות',
    fields: [
      { key: 'instructions.title', label: 'כותרת', default: 'דף הנחיות' },
      { key: 'instructions.intro', label: 'שורת פתיחה', default: 'להלן מספר הנחיות:' },
      { key: 'instructions.clause1', label: 'סעיף 1 — אישור', multiline: true, default: 'אישור: בקשתכם אושרה וניתן להתקדם להזמנת המקום.' },
      { key: 'instructions.clause4', label: 'סעיף — ביצוע ההזמנה', multiline: true, default: 'ביצוע ההזמנה: מיוזמתכם, יש ליצור קשר ישיר מול בית ההחלמה המוזכר בטופס ולהזמין מקום.' },
      { key: 'instructions.clause5', label: 'סעיף — תוקף הבראה', multiline: true, default: 'תוקף הבראה: את ימי ההבראה יש לנצל בתוך 5 שבועות מיום הלידה.' },
      { key: 'instructions.clause6', label: 'סעיף — חובת דיווח', multiline: true, default: 'חובת דיווח: בעת ההגעה לבית ההחלמה יש לדווח מיד בקבלה על הגעה דרך "היכל החתם סופר" ולמסור שם ומספר זהות/דרכון.' },
      { key: 'instructions.contact', label: 'דרכי התקשרות', multiline: true, default: 'דרכי התקשרות: ניתן לפנות למחלקת יולדות בימים א׳ - ו׳ בשעות 10:30–13:00' },
    ],
  },
]

// map מהיר: key → default (ל-vtext ולסניטציה)
export const VOUCHER_TEXT_DEFAULTS: Record<string, string> = Object.fromEntries(
  VOUCHER_TEXT_GROUPS.flatMap(g => g.fields.map(f => [f.key, f.default])),
)
