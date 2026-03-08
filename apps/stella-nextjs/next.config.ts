import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Compress responses for faster transfer
  compress: true,
  // Optimize package imports — tree-shake heavy libraries
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'radix-ui',
      '@web3icons/react',
    ],
  },
  async redirects() {
    return [
      {
        source: '/dashboard/shift-handoff',
        destination: '/dashboard/incidents',
        permanent: true,
      },
      {
        source: '/dashboard/shift-handoff/history',
        destination: '/dashboard/incidents',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        // Cache static assets aggressively
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Cache fonts
        source: '/fonts/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
