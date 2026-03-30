import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['pdfjs-dist'],
  // Stellt sicher dass pdfjs-Dateien als physische Dateien im Vercel Lambda vorhanden sind
  outputFileTracingIncludes: {
    '/**': [
      './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      './node_modules/pdfjs-dist/standard_fonts/**',
    ],
  },
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
