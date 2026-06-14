import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const noStore = [
      { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, max-age=0" },
    ]
    return [
      // מונע caching של NetFree/דפדפן כדי שפריסות ייראו מיד — ניהול, פורטל בתי החלמה, והדף הציבורי
      { source: "/admin/:path*", headers: noStore },
      { source: "/portal/:path*", headers: noStore },
      { source: "/", headers: noStore },
    ];
  },
};

export default nextConfig;
