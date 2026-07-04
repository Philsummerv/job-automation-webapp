/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Shared workspace packages ship raw TS/TSX; Next transpiles them.
  transpilePackages: ["@autoapply/shared", "@autoapply/db"],
};

module.exports = nextConfig;
