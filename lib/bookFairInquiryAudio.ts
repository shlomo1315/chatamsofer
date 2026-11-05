// הקלטות הפניות בשלוחת היריד: העותק נשמר ב-storage (documents) בסיום השיחה,
// לפי call_id, כי זה המזהה שידוע בשלוחה.

export function inquiryStorageKey(callId: string): string {
  return `book-fair/inquiries/${callId.replace(/[^\w.-]/g, '_')}.wav`
}
