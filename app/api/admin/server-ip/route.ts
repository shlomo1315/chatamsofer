import { NextResponse } from 'next/server'
import { requireAdmin, forbidden } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// מחזיר את כתובת ה-IP היוצאת (egress) של השרת — הכתובת שממנה בקשות ה-API
// לנדרים (וכל שירות חיצוני) יוצאות בפועל. נדרש כדי להזין "הגבלת כתובות IP"
// במפתח ה-API של נדרים: מגביל את המפתח לשרת שלנו בלבד, כך שגם אם ידלוף —
// הוא חסר ערך מכל כתובת אחרת.
// ⚠️ זו כתובת השרת (Railway), לא כתובת הדפדפן שלך — לכן חייבים לשלוף אותה
// מצד השרת ולא מהמסך. מנהל בלבד. קריאה-בלבד לשירותי echo חיצוניים.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  if (!(await requireAdmin())) return forbidden()

  // כמה מקורות בלתי-תלויים — אם אחד נופל, השני מאמת. IPv4 מועדף (נדרים מצפים ל-IPv4).
  const sources = [
    'https://api.ipify.org?format=json',      // { ip }
    'https://ifconfig.me/all.json',            // { ip_addr, ... }
    'https://ipv4.icanhazip.com',              // טקסט גולמי
  ]

  const results: { source: string; ip?: string; error?: string }[] = []
  for (const url of sources) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 8000)
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal })
      clearTimeout(t)
      const text = (await res.text()).trim()
      let ip = text
      try { const j = JSON.parse(text); ip = j.ip || j.ip_addr || text } catch { /* טקסט גולמי */ }
      results.push({ source: url, ip })
    } catch (e) {
      results.push({ source: url, error: e instanceof Error ? e.message : String(e) })
    }
  }

  // ה-IP שחזר משני מקורות לפחות — הכי אמין
  const ips = results.map(r => r.ip).filter(Boolean) as string[]
  const primary = ips.find(ip => ips.filter(x => x === ip).length >= 2) || ips[0] || null

  return NextResponse.json({
    serverIp: primary,
    note: 'זו הכתובת להזין ב"הגבלת כתובות IP" של מפתח ה-API בנדרים. אם מופיעות כמה — הזן את כולן.',
    allSources: results,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
