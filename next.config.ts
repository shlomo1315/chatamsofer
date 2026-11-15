import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // אתר התדמית יושב ב-public/promo
    return [{ source: "/promo", destination: "/promo/index.html", permanent: false }];
  },
  async headers() {
    return [
      {
        // Prevent NetFree / browser caching of admin pages so deploys are seen immediately
        source: "/admin/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, max-age=0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
