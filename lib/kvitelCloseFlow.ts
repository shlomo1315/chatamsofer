// הורדת הקוויטלאך וסימון "נשלח לציון" — שני שלבים נפרדים (בקשת שלמה, 19.11.2026):
// 1. הורדה (PDF או Word, אפשר את שניהם) — לא מסמנת כלום.
// 2. רק לחיצה על האישור רושמת את המנה ומסמנת את הבקשות שהיו בקובץ שירד בפועל.
// לחיצה כפולה על האישור לא רושמת מנה פעמיים; אם הרישום נכשל, אפשר לאשר שוב.

export type KvitelFormat = 'pdf' | 'docx'

export interface KvitelCloseDeps {
  download: (ids: string[], format: KvitelFormat) => Promise<string | null>   // שגיאה, או null כשהקובץ ירד
  record: (ids: string[]) => Promise<boolean>                                 // רישום המנה וסימון — true כשהצליח
}

export function kvitelCloseFlow({ download, record }: KvitelCloseDeps) {
  const downloaded = new Set<string>()
  let confirming: Promise<boolean> | null = null

  return {
    // מוריד ומחזיר שגיאה או null. רק הורדה שהצליחה מוסיפה את הבקשות לרשימה שתסומן
    async download(ids: string[], format: KvitelFormat): Promise<string | null> {
      const snapshot = [...ids]
      const err = await download(snapshot, format)
      if (!err) snapshot.forEach(id => downloaded.add(id))
      return err
    },
    get downloadedIds(): string[] { return [...downloaded] },
    // האישור: לפני הורדה מוצלחת — לא עושה כלום. בזמן רישום או אחריו — מחזיר את אותה תוצאה בלי בקשה נוספת
    confirm(): Promise<boolean> {
      if (!downloaded.size) return Promise.resolve(false)
      confirming ??= record([...downloaded]).then(ok => {
        if (!ok) confirming = null
        return ok
      }, () => { confirming = null; return false })
      return confirming
    },
  }
}
