// ─────────────────────────────────────────────────────────────────────────────
// קיבוץ מסמכים לפי סוג — כרטיס אחד לכל סוג, גם כשיש כמה קבצים.
//
// 🔴 מה שנצפה: משפחה העלתה שני צדדים של ת"ז האישה בשני קבצים — התנהגות
// תקינה ומכוונת (ראו appendMode ב-api/portal/upload-docs, שנבנה בדיוק
// לספח מרובה עמודים ולצילום דו-צדדי). המסך הציג שני כרטיסים בשם זהה,
// וזה נראה ככפילות או כתקלה.
//
// ⚠️ הקבצים אינם ממוזגים פיזית. מיזוג PDF נכשל על קובץ פגום או סרוק
// באופן חריג, והתוצאה הייתה אובדן המסמך — בזמן שהבעיה כאן היא תצוגה
// בלבד. הקיבוץ מאחד את מה שנראה, לא את מה שנשמר.
// ─────────────────────────────────────────────────────────────────────────────

export interface DocFile {
  doc_type: string
  file_url: string | null
  file_name: string | null
  uploaded_at?: string | null
}

export interface DocGroup<T extends DocFile = DocFile> {
  doc_type: string
  /** הקבצים בסוג הזה, לפי סדר ההעלאה. */
  files: T[]
}

/**
 * מקבץ לפי סוג ושומר על סדר ההעלאה בתוך כל קבוצה.
 *
 * ⚠️ הסדר חשוב: בת"ז דו-צדדית, הקובץ הראשון הוא הצד הקדמי. מיון אחר
 * היה מציג את הצד האחורי ראשון.
 */
export function groupDocsByType<T extends DocFile>(rows: T[]): DocGroup<T>[] {
  const byType = new Map<string, T[]>()
  for (const row of rows ?? []) {
    // ⚠️ שורה בלי קובץ מדולגת: אין מה לפתוח, והיא רק מנפחת את המונה.
    if (!String(row.file_url ?? '').trim()) continue
    const list = byType.get(row.doc_type)
    if (list) list.push(row)
    else byType.set(row.doc_type, [row])
  }

  return [...byType.entries()].map(([doc_type, files]) => ({
    doc_type,
    files: [...files].sort((a, b) =>
      String(a.uploaded_at ?? '').localeCompare(String(b.uploaded_at ?? ''))),
  }))
}
