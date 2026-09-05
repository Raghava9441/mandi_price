import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Capping workers avoids an OOM when building many pages on a small local machine.
  // CI hosts have the headroom and want the parallelism, so only do it locally.
  ...(process.env.CI ? {} : { experimental: { cpus: 2 } }),
  // Trailing slashes would fork every canonical into two crawlable variants.
  trailingSlash: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
