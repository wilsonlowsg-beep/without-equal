/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Allow service worker to control the entire app scope
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control',   value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type',    value: 'application/javascript; charset=utf-8' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.webmanifest',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
