// בדיקה מקדימה לפני שליחת קוד אימות: אם היא נכשלת (למשל הטלפון כבר רשום
// אצל נרשם אחר) — לא שולחים שיחה/מייל ולא פותחים את תיבת הקוד.
export async function runGuardedSend(
  value: string,
  beforeSend: ((value: string) => Promise<boolean>) | undefined,
  send: () => Promise<void>,
): Promise<'blocked' | 'sent'> {
  if (beforeSend && !(await beforeSend(value))) return 'blocked'
  await send()
  return 'sent'
}
