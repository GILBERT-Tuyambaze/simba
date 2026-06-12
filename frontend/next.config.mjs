import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
  // Only use standalone output in production to avoid Windows file lock issues during dev
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,
  outputFileTracingRoot: process.env.NODE_ENV === 'production' ? __dirname : undefined,
  poweredByHeader: false,
  webpack: (config) => {
    config.output.module = false;
    config.experiments = { ...config.experiments, outputModule: false };
    return config;
  },
};

export default nextConfig;
