import type { NextConfig } from 'next';

// In development (and simple deployments) Next proxies /api/* to the NestJS API so the session cookie
// stays same-origin. In production, a reverse proxy (nginx/Caddy) can route /api directly to the API.
const API = process.env.API_URL || 'http://localhost:4000';
const config: NextConfig = {
  poweredByHeader: false,
  async rewrites() { return [{ source: '/api/:path*', destination: `${API}/api/:path*` }]; },
  experimental: { proxyTimeout: 300_000 },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
    ] }];
  },
};
export default config;
