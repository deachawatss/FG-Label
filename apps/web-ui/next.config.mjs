/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { domains: [] },
  async rewrites() {
    return [
      {
        source: '/hubs/:path*',
        destination: 'http://localhost:5500/hubs/:path*',
      },
      {
        source: '/api/:path*',
        destination: 'http://localhost:5500/api/:path*',
      },
      {
        source: '/auth/:path*',
        destination: 'http://localhost:5500/auth/:path*',
      }
    ];
  },
};
export default nextConfig; 