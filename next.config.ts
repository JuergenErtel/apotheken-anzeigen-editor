import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // pdfjs-dist darf nicht gebundelt werden — require.resolve() muss echte Dateipfade liefern
  serverExternalPackages: ['pdfjs-dist'],
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
