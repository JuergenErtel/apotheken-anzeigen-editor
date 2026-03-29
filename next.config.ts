import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  turbopack: {
    resolveAlias: {
      canvas: { browser: './empty.js' },
      encoding: { browser: './empty.js' },
    },
  },
}

export default nextConfig
