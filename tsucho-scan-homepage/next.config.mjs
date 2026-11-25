/** @type {import('next').NextConfig} */
const nextConfig = {
  // Trang tĩnh (out/) để đưa lên Cloudflare Pages ở tsucho-scan.com
  output: 'export',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
