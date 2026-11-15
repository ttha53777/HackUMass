import type { NextConfig } from "next";

// FastAPI backend. Server-side only; the browser always calls same-origin /api/*.
const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  // The old sidebar dashboard is archived (app/(opendoor)/_archive). Its URLs land in the Plan Hub.
  async redirects() {
    return [
      { source: "/benefits/:slug", destination: "/home?guide=:slug", permanent: false },
      { source: "/benefits", destination: "/home?show=gov", permanent: false },
      { source: "/local", destination: "/home?show=local", permanent: false },
      { source: "/documents", destination: "/papers", permanent: false },
      { source: "/about", destination: "/home?sheet=answers", permanent: false },
      { source: "/money", destination: "/home?sheet=bank", permanent: false },
    ];
  },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
