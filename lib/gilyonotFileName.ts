// שם הקובץ של הגיליון נגזר משם הגיליון (כמו הכותרת במסך), לא משם הקובץ מהמחשב.

/** "פרשת X" אם יש פרשה, אחרת הנושא. סיומת מהקובץ המקורי. תווים אסורים מוחלפים, עברית נשמרת. */
export function gilyonFileName(issue: { title: string; parasha: string }, originalName: string): string {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(originalName)?.[1]?.toLowerCase() ?? 'pdf'
  const raw = issue.parasha.trim() ? `פרשת ${issue.parasha.trim()}` : issue.title
  const base = raw.replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'גיליון'
  return `${base}.${ext}`
}

/**
 * כותרת Content-Disposition להורדה עם שם עברי תקין: filename בטוח (ASCII) לדפדפנים ישנים,
 * ו-filename*=UTF-8'' לשם האמיתי. בלי זה השם יוצא כ-%D7%A4... כשהוא מועבר כמחרוזת גולמית.
 */
export function attachmentDisposition(name: string): string {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase() ?? 'pdf'
  const ascii = name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^\x20-\x7e]+/g, '').replace(/["\\%;]/g, '').trim() || 'gilyon'
  const enc = encodeURIComponent(name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
  return `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${enc}`
}
