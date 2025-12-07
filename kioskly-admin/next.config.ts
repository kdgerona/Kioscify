import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '4000',
        pathname: '/uploads/**',
      },
      {
        protocol: 'http',
        hostname: '**', // Allow any hostname for development (local network IPs)
        port: '4000',
        pathname: '/uploads/**',
      },
    ],
  },
};

export default nextConfig;
