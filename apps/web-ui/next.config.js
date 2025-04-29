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
    '@babel/runtime'
  ],
  images: {
    domains: ['localhost', 'img2.pic.in.th'],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5051',
  },
  experimental: {
    esmExternals: true
  }
}

module.exports = nextConfig 