// שלבי בקשה באזור האישי: התקבלה → בבדיקה → אושרה → בוצעה, והצעד הבא ואצל מי.
export const REQUEST_STAGES = ['התקבלה', 'בבדיקה', 'אושרה', 'בוצעה'] as const

export interface RequestProgress {
  /** אינדקס השלב הנוכחי ב-REQUEST_STAGES (0..3); -1 = נדחתה/בוטלה */
  stage: number
  next: string
  owner: string
}

type Tone = 'pending' | 'progress' | 'approved' | 'rejected'

const DONE = new Set(['completed', 'active'])

export function requestProgress(kind: string, rawStatus: string, tone: Tone): RequestProgress {
  if (tone === 'rejected') return { stage: -1, next: 'אין צעד נוסף. לבירור אפשר לפנות למשרד', owner: 'המשרד' }
  if (kind === 'loan' && rawStatus === 'active') return { stage: 3, next: 'ההלוואה פעילה, ההחזרים לפי ההסדר שנקבע', owner: 'המשפחה' }
  if (DONE.has(rawStatus)) return { stage: 3, next: 'הבקשה בוצעה', owner: 'אין צעד פתוח' }
  if (tone === 'approved') return { stage: 2, next: 'ביצוע התשלום או המשך הטיפול', owner: 'המשרד' }
  if (tone === 'progress') return { stage: 1, next: 'ממתינים להחלטת הגורם המאשר', owner: 'הגורם המאשר' }
  return { stage: 0, next: 'הבקשה ממתינה לבדיקה ראשונית', owner: 'המשרד' }
}
