/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // Allow @google-cloud/vision (Node.js-only) to run exclusively server-side
  experimental: {
    serverComponentsExternalPackages: ['@google-cloud/vision'],
  },
};

module.exports = nextConfig;
