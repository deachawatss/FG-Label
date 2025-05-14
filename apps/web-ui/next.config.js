/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  swcMinify: true,
  transpilePackages: [
    '@ant-design/icons',
    '@ant-design/icons-svg',
    'rc-util',
    'rc-pagination',
    'rc-picker',
    'rc-input',
    'rc-tree',
    'rc-table',
    '@babel/runtime',
    'react-konva',
    'konva',
    'qrcode',
    'jsbarcode'
  ],
  images: {
    domains: ['localhost', 'img2.pic.in.th'],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5051/api',
    NEXT_PUBLIC_SIGNALR_URL: process.env.NEXT_PUBLIC_SIGNALR_URL || 'http://localhost:5051/hubs/job',
  },
  experimental: {
    esmExternals: true,
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/batch-search',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:5051/api/:path*',
      },
      {
        source: '/hubs/:path*',
        destination: 'http://localhost:5051/hubs/:path*',
      },
      {
        source: '/auth/:path*',
        destination: 'http://localhost:5051/auth/:path*',
      }
    ];
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        'canvas': 'commonjs canvas',
        'react-konva': 'commonjs react-konva',
        'konva': 'commonjs konva',
        'jsbarcode': 'commonjs jsbarcode',
        'qrcode': 'commonjs qrcode',
      });
    }
    return config;
  },
}

module.exports = nextConfig 