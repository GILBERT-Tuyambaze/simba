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
  output: 'standalone',
  poweredByHeader: false,
  outputFileTracingRoot: __dirname,
  webpack: (config) => {
    config.output.module = false;
    config.experiments = { ...config.experiments, outputModule: false };
    return config;
  },
};

export default nextConfig;
