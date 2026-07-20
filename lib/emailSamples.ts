// דוגמאות מרונדרות של כל נוסחי המיילים — לבקרת איכות. כל פונקציה נקראת עם נתוני
// דמה ריאליים ומחזירה את ה-HTML המלא (בדיוק כפי שנשלח). משמש בדף בקרת המיילים.
import {
  benefitsLinkEmail, emailIntakeConfirmedEmail, requestBlockedRejectedEmail,
  emailIntakeRejectedEmail, weeklyLoansReportEmail, approvalEmail, existingContactEmail,
  registrationInviteEmail, docsPendingEmail, requestReceivedEmail, registrationReceivedEmail,
  financialAidInquiryEmail, financialAidReceivedEmail, financialAidDecisionEmail, loanApprovedEmail,
  birthApprovedEmail, birthRejectedEmail, maternityCardEmail, cardStockReplenishedEmail,
  portalCredentialsEmail, recoveryRealizedEmail, recoveryEditRequestEmail, gratitudeRequestEmail,
  recoveryFeedbackEmail, verifyCodeEmail, gratitudeReceivedEmail,
} from '@/lib/emailTemplates'
import type { RenderedEmail } from '@/lib/emailReviewPage'

const PORTAL = 'https://chasamsofer.co.il'

// כל מייל: כותרת (למי/מתי) + פונקציה שמייצרת אותו עם נתוני דמה.
const SAMPLES: { title: string; recipient: string; trigger: string; build: () => { html: string } }[] = [
  { title: 'קישור להטבות והגשת בקשות', recipient: 'צאצא', trigger: 'לחיצה בפורטל / פנייה במייל',
    build: () => benefitsLinkEmail('משפחת כהן', PORTAL,
      [['שם מלא', 'ישראל כהן'], ['תעודת זהות', '123456789'], ['טלפון', '050-1234567']],
      [{ label: 'הגשת בקשת הלוואה', href: 'mailto:igud@chasamsofer.info?subject=hloavaa' }], 'נשואים') },
  { title: 'אישור קליטת פנייה במייל', recipient: 'פונה', trigger: 'קליטת בקשה במייל',
    build: () => emailIntakeConfirmedEmail('משפחת כהן', 'בקשת הלוואה') },
  { title: 'בקשה נחסמה — רישום נדחה', recipient: 'פונה', trigger: 'בקשה ממי שרישומו נדחה',
    build: () => requestBlockedRejectedEmail({ family_name: 'כהן', full_name: 'ישראל כהן', marital_status: 'נשואים', reason: 'לא נמצאה זכאות באיגוד הצאצאים' }) },
  { title: 'הגשה במייל נדחתה', recipient: 'פונה', trigger: 'שגיאה בהגשת בקשה במייל',
    build: () => emailIntakeRejectedEmail({ name: 'משפחת כהן', typeLabel: 'בקשת הלוואה', errors: ['חסרה תעודת זהות של הבעל', 'לא צוין סכום ההלוואה המבוקש'], draftHref: 'mailto:igud@chasamsofer.info?subject=hloavaa', action: 'loan', portalUrl: PORTAL, greeting: null }) },
  { title: 'דוח הלוואות שבועי', recipient: 'מנהל גמ״ח', trigger: 'תזמון שבועי',
    build: () => weeklyLoansReportEmail({ pending: 4, awaitingDisbursement: 2, disbursedThisWeek: 3, newLoans: [{ name: 'משפחת כהן', amount: 1500, statusLabel: 'ממתין לביצוע', createdAt: '2026-07-15' }, { name: 'משפחת לוי', amount: 3000, statusLabel: 'אושר', createdAt: '2026-07-17' }] }, PORTAL, '2026-07-13') },
  { title: 'אישור רישום', recipient: 'נרשם', trigger: 'אישור רישום לאיגוד',
    build: () => approvalEmail('ישראל', PORTAL, { family_name: 'כהן', id_number: '123456789', phone: '050-1234567', city: 'בני ברק', marital_status: 'נשואים', spouse_name: 'שרה כהן', children_count: 4 }) },
  { title: 'מענה לצאצא קיים', recipient: 'צאצא קיים', trigger: 'פנייה במייל מנתמך רשום',
    build: () => existingContactEmail({ name: 'ישראל כהן', eligibility_status: 'approved', id_number: '123456789', phone: '050-1234567', city: 'ירושלים', marital_status: 'נשואים', children_count: 4 }, PORTAL) },
  { title: 'הזמנה להרשמה', recipient: 'פונה לא רשום', trigger: 'פנייה במייל שלא נמצאה בכרטסת',
    build: () => registrationInviteEmail(PORTAL) },
  { title: 'השלמת מסמכים', recipient: 'נתמך', trigger: 'בקשה עם מסמכים חסרים',
    build: () => docsPendingEmail('ישראל כהן', PORTAL, 'נשואים', ['תעודת זהות של הבעל (כולל ספח)', 'תעודת זהות של האשה (כולל ספח)'], 'נא לצרף צילום ברור וקריא של המסמכים.', 'נמצא אי-דיוק: שם הסבא צריך להיות "אברהם" ולא "יצחק".') },
  { title: 'אישור קבלת בקשה', recipient: 'מגיש בקשה', trigger: 'קבלת בקשה חדשה',
    build: () => requestReceivedEmail({ type: 'loan', firstTime: true, beneficiary: { full_name: 'ישראל כהן', family_name: 'כהן', id_number: '123456789', phone: '050-1234567', email: 'cohen@example.com', address: 'רחוב הרב קוק 10', city: 'בני ברק', marital_status: 'נשואים', spouse_name: 'שרה כהן', spouse_id_number: '987654321', children_count: 4 }, requestRows: [['סכום מבוקש', '₪1,500'], ['מספר תשלומים', 12], ['מטרת ההלוואה', 'הוצאות חתונה']], documents: [{ name: 'תעודת זהות.pdf', url: 'https://example.com/id.pdf' }, { name: 'אישור הכנסות.pdf' }] }) },
  { title: 'אישור קבלת רישום', recipient: 'נרשם', trigger: 'סיום רישום בפורטל',
    build: () => registrationReceivedEmail({ full_name: 'ישראל כהן', family_name: 'כהן', id_number: '123456789', phone: '050-1234567', email: 'cohen@example.com', address: 'רחוב הרב קוק 10', city: 'בני ברק', marital_status: 'נשואים', spouse_name: 'שרה כהן', spouse_id_number: '987654321', children_count: 4 }, PORTAL, [{ label: 'הגשת בקשת הלוואה', href: 'mailto:igud@chasamsofer.info?subject=hloavaa' }]) },
  { title: 'פנייה לגורם מאשר — סיוע רפואי', recipient: 'גורם מאשר', trigger: 'בקשת סיוע רפואי',
    build: () => financialAidInquiryEmail({ family_name: 'כהן', full_name: 'ישראל כהן', id_number: '123456789', spouse_name: 'שרה כהן', marital_status: 'נשואים', phone: '050-1234567', city: 'בני ברק', children_count: 4 }, 'הוצאות רפואיות גבוהות עקב אשפוז') },
  { title: 'אישור קבלת סיוע רפואי', recipient: 'מבקש', trigger: 'קבלת בקשת סיוע רפואי',
    build: () => financialAidReceivedEmail('משפחת כהן') },
  { title: 'החלטת סיוע רפואי (אושר)', recipient: 'מבקש', trigger: 'החלטה על בקשת סיוע',
    build: () => financialAidDecisionEmail('משפחת כהן', true, 1500) },
  { title: 'אישור הלוואה', recipient: 'לווה', trigger: 'אישור בקשת הלוואה',
    build: () => loanApprovedEmail({ family_name: 'כהן', full_name: 'ישראל כהן', id_number: '123456789', spouse_name: 'שרה כהן', marital_status: 'נשואים', phone: '050-1234567', city: 'בני ברק', children_count: 4 }, { amount: 1500, approved_amount: 1500, installments: 12, monthly_payment: 125, purpose: 'הוצאות חתונה' }) },
  { title: 'אישור לידה', recipient: 'יולדת', trigger: 'אישור בקשת לידה',
    build: () => birthApprovedEmail({ family_name: 'כהן', full_name: 'ישראל כהן', id_number: '123456789', spouse_name: 'שרה כהן', marital_status: 'נשואים', phone: '050-1234567', city: 'בני ברק', children_count: 4 }, { baby_name: 'משה', baby_gender: 'male', birth_date: '15/07/2026', recovery_home: 'בית החלמה נווה שלום' }, { centers: [{ name: 'מוקד בני ברק', city: 'בני ברק', address: 'רחוב חזון איש 5', pickup_days: 'ראשון-חמישי', pickup_hours: '09:00-14:00' }], serial: '12345', phones: ['050-1234567', '052-7654321'] }) },
  { title: 'דחיית בקשת לידה', recipient: 'יולדת', trigger: 'דחיית בקשת לידה',
    build: () => birthRejectedEmail({ family_name: 'כהן', mother_name: 'שרה כהן', reason: 'הבקשה הוגשה לאחר המועד הקבוע בתקנון.' }) },
  { title: 'כרטיס מזון ליולדת', recipient: 'יולדת', trigger: 'הנפקת כרטיס מזון',
    build: () => maternityCardEmail({ full_name: 'ישראל כהן', family_name: 'כהן', spouse_name: 'שרה כהן' }, { centerName: 'מוקד בני ברק', phones: ['050-1234567', '052-7654321'] }) },
  { title: 'התחדשות מלאי כרטיסים', recipient: 'יולדת', trigger: 'חידוש מלאי במוקד',
    build: () => cardStockReplenishedEmail('שרה כהן', 'מוקד בני ברק', ['050-1234567', '052-7654321']) },
  { title: 'פרטי כניסה לפורטל', recipient: 'משתמש פורטל', trigger: 'יצירת גישה לפורטל',
    build: () => portalCredentialsEmail({ title: 'פורטל בתי החלמה', intro: 'להלן פרטי הכניסה שלך לפורטל בתי ההחלמה.', portalUrl: `${PORTAL}/recovery`, password: 'AB12CD34', username: 'בית החלמה נווה שלום', usernameLabel: 'שם בית ההחלמה' }) },
  { title: 'מימוש זכאות החלמה', recipient: 'מחלקת יולדות', trigger: 'בית החלמה מסמן מימוש',
    build: () => recoveryRealizedEmail({ home: 'בית החלמה נווה שלום', motherName: 'שרה כהן', amount: 1500, nights: 3, receipt: 'REC-2026-0042' }) },
  { title: 'בקשת תיקון רשומה', recipient: 'מחלקת יולדות', trigger: 'בית החלמה מבקש תיקון',
    build: () => recoveryEditRequestEmail({ home: 'בית החלמה נווה שלום', motherName: 'שרה כהן' }) },
  { title: 'בקשת דברי ברכה לנדיב', recipient: 'יולדת', trigger: '10 ימים אחרי אישור לידה',
    build: () => gratitudeRequestEmail({ familyName: 'כהן', motherName: 'שרה כהן', formUrl: `${PORTAL}/gratitude/abc123`, isReminder: false }) },
  { title: 'משוב על בית ההחלמה', recipient: 'יולדת', trigger: 'לאחר שהייה בבית החלמה',
    build: () => recoveryFeedbackEmail({ familyName: 'כהן', motherName: 'שרה כהן', recoveryHome: 'בית החלמה נווה שלום', formUrl: `${PORTAL}/feedback/xyz789`, replyTo: 'feedback+xyz789@chasamsofer.info', questions: [{ position: 1, text: 'שביעות רצון כללית מהשירות', type: 'scale' }, { position: 2, text: 'איכות האוכל', type: 'scale' }, { position: 3, text: 'הערות נוספות', type: 'text' }] }) },
  { title: 'קוד אימות', recipient: 'משתמש', trigger: 'אימות כתובת מייל',
    build: () => verifyCodeEmail('482913') },
  { title: 'אישור קבלת דברי ברכה', recipient: 'יולדת', trigger: 'קבלת מכתב ברכה',
    build: () => gratitudeReceivedEmail({ familyName: 'כהן', motherName: 'שרה כהן' }) },
]

/** מרנדר את כל דוגמאות המיילים. כשל בודד לא מפיל את הדף — מוצג כרטיס שגיאה. */
export function renderAllEmailSamples(): RenderedEmail[] {
  return SAMPLES.map(s => {
    try {
      return { title: s.title, recipient: s.recipient, trigger: s.trigger, html: s.build().html }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return { title: s.title, recipient: s.recipient, trigger: s.trigger, html: `<p style="padding:40px;color:#b91c1c;font-family:sans-serif">שגיאה ברינדור: ${msg}</p>` }
    }
  })
}
