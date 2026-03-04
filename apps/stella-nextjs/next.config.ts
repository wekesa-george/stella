import type { NextConfig } from "next";

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
};

export default nextConfig;
