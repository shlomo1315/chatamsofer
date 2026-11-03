// התפריט של מערכת יריד הספרים בטכנוליין. נפרד לגמרי מהמערכת הראשית: שלוחה, סוד ומספר משלו.
// כרגע הודעה קבועה (ניתנת לשינוי במשתנה סביבה), עד שייקבע תוכן השיחה.
import { goodbye } from '../modules'
import type { TlHandler } from '../types'

const DEFAULT_TEXT = 'שלום וברוכים הבאים ליריד הספרים. לפרטים נוספים אנא פנו אלינו באתר או נסו שוב מאוחר יותר'

export const yeridMenu: TlHandler = async () => goodbye(process.env.TECHNOLINE_YERID_GREETING?.trim() || DEFAULT_TEXT)
