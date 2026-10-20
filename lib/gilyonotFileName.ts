// שם הקובץ של הגיליון נגזר משם הגיליון (כמו הכותרת במסך), לא משם הקובץ מהמחשב.

/** "פרשת X" אם יש פרשה, אחרת הנושא. סיומת מהקובץ המקורי. תווים אסורים מוחלפים, עברית נשמרת. */
export function gilyonFileName(issue: { title: string; parasha: string }, originalName: string): string {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(originalName)?.[1]?.toLowerCase() ?? 'pdf'
  const raw = issue.parasha.trim() ? `פרשת ${issue.parasha.trim()}` : issue.title
  const base = raw.replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'גיליון'
  return `${base}.${ext}`
}
