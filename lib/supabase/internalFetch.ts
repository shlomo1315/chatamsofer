// קריאות Supabase מצד השרת עוברות לכתובת הפנימית (SUPABASE_INTERNAL_URL) ולא דרך ה-DNS הציבורי.
//
// ⚠️ NEXT_PUBLIC_SUPABASE_URL נצרב בקוד בזמן הבנייה, ולכן אי אפשר להחליף אותו בזמן ריצה בכל אחד
// מ-178 המקומות. במקום זה מחליפים את ה-origin ב-fetch של השרת. הלקוחות ממשיכים להיבנות עם הכתובת
// הציבורית, כך ששם העוגייה (sb-<host>-auth-token) וה-redirect_to הציבורי נשארים כמו שהם.
// הדפדפן לא מושפע: הקוד רץ רק בשרת (instrumentation).

const SUPABASE_PATHS = ['/rest/v1/', '/auth/v1/', '/storage/v1/']

export function rewriteSupabaseUrl(input: string, publicUrl: string | undefined, internalUrl: string | undefined): string {
  if (!publicUrl || !internalUrl) return input
  const pub = publicUrl.replace(/\/+$/, '')
  const internal = internalUrl.replace(/\/+$/, '')
  if (pub === internal || !input.startsWith(pub)) return input
  const rest = input.slice(pub.length)
  if (!SUPABASE_PATHS.some(p => rest.startsWith(p))) return input
  return internal + rest
}

let installed = false

export function installInternalSupabaseFetch(): void {
  const internal = process.env.SUPABASE_INTERNAL_URL
  const pub = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (installed || !internal || !pub) return
  installed = true
  const original = globalThis.fetch
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') return original(rewriteSupabaseUrl(input, pub, internal), init)
    if (input instanceof URL) return original(rewriteSupabaseUrl(input.toString(), pub, internal), init)
    const url = rewriteSupabaseUrl(input.url, pub, internal)
    return original(url === input.url ? input : new Request(url, input), init)
  }) as typeof fetch
  console.log(`[supabase] קריאות שרת עוברות לכתובת הפנימית ${internal}`)
}
