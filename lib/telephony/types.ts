// טיפוסים משותפים לשכבת הטלפוניה של טכנוליין (Module API).
// מקור: https://info.tlivr.com/Web3/docs.html

/** שלוש המערכות הטלפוניות — כל אחת עם מספר, מפתחות וסוד משלה. */
export type TelephonySystemId = 'main' | 'yerid' | 'distributors'

/** פריט שמע בתוך files. */
export type TlFile =
  | { text: string; voice?: string }
  | { digits: string }
  | { number: string }
  | { fileName: string }
  | { fileId: string; extensionId?: string }
  | { fileLink: string; fileName: string }

export type TlCommon = {
  /** POST במקום GET מכאן והלאה (דביק) — לערכים רגישים כמו מספר כרטיס. */
  post?: boolean
  /** דגלים קבועים שנשלחים בכל פנייה מכאן והלאה. */
  addParams?: Record<string, string>
  /** מפתחות שיוסרו מה-REQUEST המצטבר. */
  removeParams?: string[]
}

export type TlResponse = TlCommon & (
  | { type: 'simpleMessage'; files: TlFile[] }
  | { type: 'simpleMenu'; name: string; enabledKeys: string; times?: number; timeout?: number; errorReturn?: string; files?: TlFile[] }
  | { type: 'getDTMF'; name: string; max: number; min?: number; timeout?: number; skipKey?: string; skipValue?: string; confirmType?: 'number' | 'digits' | 'no'; maskLog?: boolean; files?: TlFile[] }
  | { type: 'record'; name: string; max?: number; min?: number; confirm?: 'confirmOnly' | 'ful' | 'no'; fileName?: string; saveFolder?: number; maskLog?: boolean; files?: TlFile[] }
  | { type: 'goTo'; goTo: string }
  | { type: 'hangup' }
)

/** הפרמטרים שהמרכזיה שולחת (PBX*) ותוצאות המודולים (לפי name). */
export type TlParams = Record<string, string>

export type TlContext = {
  system: TelephonySystemId
  ext: string
  params: TlParams
  /** מספר המתקשר (PBXphone), ריק אם לא נשלח */
  phone: string
  callId: string
}

export type TlResult = TlResponse | TlResponse[]
export type TlHandler = (ctx: TlContext) => Promise<TlResult>
