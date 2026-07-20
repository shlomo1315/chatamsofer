import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // אופטימיזציית imports — טוענת רק את מה שבשימוש מספריות גדולות (אייקונים/תאריכים/גרפים),
  // במקום לגרור עצים שלמים ל-bundle של כל דף. שיפור גלובלי משמעותי בגודל ה-JS.
  experimental: {
    optimizePackageImports: ['lucide-react', 'date-fns', 'recharts'],
  },
  async headers() {
    const noStore = [
      { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
    ]

    // כותרות אבטחה בסיסיות לכל האתר.
    // ⚠️ מסכי הניהול מציגים ת"ז ומסמכים סרוקים, ובלי frame-ancestors אפשר
    // להטמיע אותם ב-iframe באתר זר ולהערים על מנהל ללחוץ (clickjacking).
    // HSTS מונע הורדה ל-HTTP, שבה דגל ה-secure של העוגיות נשמט.
    // אין כאן CSP מלא בכוונה — הוא דורש בדיקה זהירה מול הקוד הקיים,
    // ובפרודקשן חי CSP שגוי שובר את המערכת. frame-ancestors הוא החלק
    // שאין לו תחליף ואינו יכול לשבור דבר.
    const security = [
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
    ]

    return [
      { source: "/:path*", headers: security },
      // מונע caching של NetFree/דפדפן כדי שפריסות ייראו מיד — ניהול, פורטל בתי החלמה, והדף הציבורי
      { source: "/admin/:path*", headers: noStore },
      { source: "/portal/:path*", headers: noStore },
      { source: "/", headers: noStore },
    ];
  },
};

export default nextConfig;
