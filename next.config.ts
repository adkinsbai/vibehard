import type { NextConfig } from "next";

// 部署到子路径（如 https://ldcx.tech/vibehard）时，在构建前设置 NEXT_PUBLIC_BASE_PATH=/vibehard；
// 本地开发不设置即为根路径。standalone 输出用于以 `node server.js` 运行精简生产服务。
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const scriptPolicy = process.env.NODE_ENV === "development" ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";
const securityHeaders = [
  { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; ${scriptPolicy}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'` },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async rewrites() {
    // Only the ticket-authenticated RFB endpoint is public; never proxy the broker control API.
    const desktop = process.env.NODE_ENV === 'development' ? (process.env.EDA_DESKTOP_URL ?? 'http://127.0.0.1:6081') : '';
    return desktop ? [{ source: '/eda-desktop/ws', destination: `${desktop}/client/ws` }] : [];
  },
  webpack(config) {
    // noVNC's feature detection uses top-level await; supported browsers are modern ESM clients.
    config.output.environment = { ...config.output.environment, asyncFunction: true };
    return config;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
