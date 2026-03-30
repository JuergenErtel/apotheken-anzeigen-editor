import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['pdfjs-dist'],
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false
    config.resolve.alias.encoding = false
    return config
  },
  turbopack: {
    resolveAlias: {
      canvas: { browser: './empty.js' },
      encoding: { browser: './empty.js' },
    },
  },
}

export default nextConfig
