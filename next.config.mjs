/** @type {import('next').NextConfig} */

// Content Security Policy. Kept permissive enough not to break the SPA (inline
// styles are used throughout, and Next's Pages Router injects inline hydration
// scripts) while still locking network/frame/object origins to known hosts.
// Stripe (Elements + API), Supabase (auth/storage), the backend API, and the
// pinned Tabler icon CDN are explicitly allowed.
const ContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' https://cdn.jsdelivr.net data:",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://connect.facebook.net https://www.clarity.ms https://*.clarity.ms",
  "worker-src 'self' blob:",
  "connect-src 'self' https://harrys-list-backend.vercel.app https://*.supabase.co https://api.stripe.com https://www.facebook.com https://connect.facebook.net https://*.clarity.ms https://c.clarity.ms https://*.bing.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: ContentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      {
        source: "/sitemap.xml",
        destination: "/api/sitemap",
      },
    ];
  },
};

export default nextConfig;
