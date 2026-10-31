const prod = process.env.NODE_ENV === "production";
// Content-Security-Policy is enforced in production only (dev tooling needs eval). Inline styles/scripts are allowed because Next injects them.
const csp = ["default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https:", "font-src 'self' data:", "media-src 'self' https:", "connect-src 'self'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'"].join("; ");
const headers = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }, // order/application/enquiry links contain private tokens: never sent to other sites
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(prod ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }, { key: "Content-Security-Policy", value: csp }] : []),
];
/** @type {import('next').NextConfig} */
const nextConfig = { output: "standalone", reactStrictMode: true, poweredByHeader: false, serverExternalPackages: ["playwright", "@prisma/client"], async headers() { return [{ source: "/:path*", headers }, { source: "/media/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] }]; } };
export default nextConfig;
