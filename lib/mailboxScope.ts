// צמצום נתוני תיבת הדואר למחלקה אחת.
//
// 🔴 14.10: לשונית "תיבת מייל" ביריד פתחה את מסך הדואר הכללי, וזה הציג
// את office@ ואת כל שאר התיבות. כשהמסך נעול למחלקה (?department=),
// השרת מחזיר רק את התיבות, המונים והתוויות שלה — כך שגם הדפדפן לא
// מקבל שום מידע על תיבה אחרת.

interface Scoped {
  accounts: { id: string; department?: string | null }[]
  unreadByDept: Record<string, number>
  unreadByAccount: Record<string, number>
  boxLabels: { account: string; department?: string | null }[]
}

export function scopeInboxToDepartment<T extends Scoped>(data: T, department: string): T {
  if (!department) return data
  const accounts = data.accounts.filter(a => a.department === department)
  const ids = new Set(accounts.map(a => a.id))
  return {
    ...data,
    accounts,
    unreadByDept: department in data.unreadByDept ? { [department]: data.unreadByDept[department] } : {},
    unreadByAccount: Object.fromEntries(Object.entries(data.unreadByAccount).filter(([id]) => ids.has(id))),
    boxLabels: data.boxLabels.filter(b => ids.has(b.account)),
  }
}
