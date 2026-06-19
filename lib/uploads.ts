// הגדרות אחידות להעלאת קבצים במערכת.
// סוגי הקבצים המותרים וגודל מרבי — מוצגים למשתמש בכל מקום שיש צירוף קובץ.

export const MAX_UPLOAD_MB = 10

// סוגי הקבצים המותרים: תמונה, מסמך Word או PDF.
export const UPLOAD_ACCEPT = 'image/*,.pdf,.doc,.docx'

// טקסט הסבר אחיד שמוצג ליד כל שדה העלאה.
export const UPLOAD_HINT = `ניתן להעלות תמונה, קובץ Word או PDF — עד ${MAX_UPLOAD_MB}MB`
