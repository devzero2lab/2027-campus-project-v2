import type { NextConfig } from 'next';

/**
 * Keeps the frontend configuration intentionally small for the MVP while still
 * leaving room for future package-level customization.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;

