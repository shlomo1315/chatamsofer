// ─────────────────────────────────────────────────────────────────────────────
// fetch לנדרים — דרך פרוקסי עם כתובת IP קבועה ופרטית, כשמוגדר.
//
// 🔴 05.10: נדרים חסמו את כתובת ה-IP היוצאת של Railway (152.55.176.240),
// שמשותפת ללקוחות רבים, וביקשו "כתובת IP פרטית לכל אחד". Railway אינו
// מציע כתובת ייעודית, ולכן הפניות לנדרים — ורק הן — יוצאות דרך פרוקסי
// עם כתובת משלנו. את הכתובת הזו מוסרים לנדרים.
//
// ⚠️ NEDARIM_PROXY_URL בפורמט http://user:pass@host:port. בלי המשתנה —
// fetch רגיל, בדיוק כמו קודם.
// ─────────────────────────────────────────────────────────────────────────────
import { ProxyAgent, fetch as undiciFetch } from 'undici'

let agent: ProxyAgent | null = null
let agentFor = ''

export function nedarimFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const proxy = process.env.NEDARIM_PROXY_URL?.trim()
  if (!proxy) return fetch(url, init)
  if (!agent || agentFor !== proxy) { agent = new ProxyAgent(proxy); agentFor = proxy }
  return undiciFetch(url, { ...(init as Record<string, unknown>), dispatcher: agent } as Parameters<typeof undiciFetch>[1]) as unknown as Promise<Response>
}
