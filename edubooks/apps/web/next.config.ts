import type { NextConfig } from 'next';
import path from 'path';

// In development (and simple deployments) Next proxies /api/* to the NestJS API so the session cookie
// stays same-origin. In production, a reverse proxy (nginx/Caddy) can route /api directly to the API.
const API = process.env.API_URL || 'http://localhost:4000';
const config: NextConfig = {
  poweredByHeader: false,
  // Self-contained server bundle for the Docker image (monorepo root for dependency tracing).
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '..', '..'),
  async rewrites() { return [{ source: '/api/:path*', destination: `${API}/api/:path*` }]; },
  experimental: { proxyTimeout: 300_000 },
  async headers() {
    const prod = process.env.NODE_ENV === 'production';
    // Next.js inlines small bootstrap scripts, hence 'unsafe-inline'; pdf.js may use WebAssembly decoders.
    const csp = [
      "default-src 'self'", `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${prod ? '' : " 'unsafe-eval'"}`, "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:", "font-src 'self' data:", "connect-src 'self'", "worker-src 'self' blob:", "media-src 'self' blob:",
      "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com", "frame-ancestors 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
    ].join('; ');
    // Not for /api: the API sets its own headers (e.g. sandboxed flipbooks).
    return [{ source: '/((?!api/).*)', headers: [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), payment=()' },
      ...(process.env.COOKIE_SECURE === '1' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
    ] }];
  },
};
export default config;
