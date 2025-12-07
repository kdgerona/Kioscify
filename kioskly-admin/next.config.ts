import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone', // Enable standalone output for Docker
  images: {
    // Configure allowed image domains for Next.js Image component
    // This is required for loading tenant logos and product images from the API
    remotePatterns: [
      // Local development - API on port 4000
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '4000',
        pathname: '/uploads/**',
      },
      // Local development - Allow network IPs (for testing on mobile devices)
      {
        protocol: 'http',
        hostname: '192.168.*.*', // Local network range
        port: '4000',
        pathname: '/uploads/**',
      },
      // Production - Specific domain (more secure than wildcard)
      {
        protocol: 'https',
        hostname: 'kioscify.kdgerona.com',
        pathname: '/uploads/**',
      },
      // Fallback for other HTTPS domains (can be removed for tighter security)
      {
        protocol: 'https',
        hostname: '**',
        pathname: '/uploads/**',
      },
    ],
  },
};

export default nextConfig;
