// פעולות מוכנות לכפתורי הניוזלטר — קישורים לטפסים בפורטל הציבורי.
// מקור אמת יחיד: אותן כתובות שבהן משתמשות תבניות המייל הקיימות.

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chasamsofer.co.il').replace(/\/$/, '')

export interface NewsletterAction {
  key: string
  label: string        // הטקסט שיופיע על הכפתור
  url: string
  color: string
  description: string  // מה זה עושה — מוצג בבורר
}

export const NEWSLETTER_ACTIONS: NewsletterAction[] = [
  {
    key: 'register',
    label: 'להרשמה לאיגוד הצאצאים',
    url: `${SITE}/`,
    color: '#6366f1',
    description: 'טופס הרשמה לאיגוד — למי שטרם רשום',
  },
  {
    key: 'birth',
    label: 'להגשת בקשה לעזר יולדות',
    url: `${SITE}/?action=birth`,
    color: '#ec4899',
    description: 'ימי החלמה וכרטיס מזון לאחר לידה',
  },
  {
    key: 'loan',
    label: 'להגשת בקשת הלוואה',
    url: `${SITE}/?action=loan`,
    color: '#0ea5e9',
    description: 'גמ״ח הלוואות — עד 30,000 ₪',
  },
  {
    key: 'aid',
    label: 'להגשת בקשת סיוע רפואי',
    url: `${SITE}/?action=aid`,
    color: '#10b981',
    description: 'סיוע בהוצאות רפואיות',
  },
  {
    key: 'my_requests',
    label: 'לצפייה בבקשות שלי',
    url: `${SITE}/?action=my-requests`,
    color: '#8b5cf6',
    description: 'מעקב אחר סטטוס הבקשות',
  },
  {
    key: 'update_details',
    label: 'לעדכון פרטים',
    url: `${SITE}/?action=update`,
    color: '#64748b',
    description: 'עדכון כתובת, טלפון ופרטי המשפחה',
  },
  {
    key: 'custom',
    label: 'קישור מותאם אישית',
    url: '',
    color: '#C69D2D',
    description: 'הזנת כתובת חופשית',
  },
]
