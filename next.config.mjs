import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  // Native/canvas + PDF.js must stay external for Neon PDF page snapshots.
  serverExternalPackages: ['@napi-rs/canvas', 'pdfjs-dist', 'unpdf', 'sharp'],
  async headers() {
    const isProd = process.env.NODE_ENV === 'production';
    const scriptSrc = isProd
      ? "script-src 'self' 'unsafe-inline' https://upload-widget.cloudinary.com;"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://upload-widget.cloudinary.com;";
    const connectSrc = isProd
      ? "connect-src 'self' https:;"
      : "connect-src 'self' https: http: ws: wss:;";

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value:
              `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; ${scriptSrc} style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https: data: blob:; media-src 'self' https: blob:; font-src 'self' https: data:; ${connectSrc} frame-src 'self' https://upload-widget.cloudinary.com;`,
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: '*.aws.neon.tech' },
      { protocol: 'https', hostname: '*.neon.tech' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'cdn.dribbble.com' },
      { protocol: 'https', hostname: 'i.imgur.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
      { protocol: 'https', hostname: '*.githubusercontent.com' },
      { protocol: 'https', hostname: 'scontent.fbag1-2.fna.fbcdn.net' },
    ],
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      swr: path.resolve('./lib/vendor/swr.ts'),
      'next-cloudinary': path.resolve('./lib/vendor/next-cloudinary.tsx'),
    };

    return config;
  },
};

export default nextConfig;
