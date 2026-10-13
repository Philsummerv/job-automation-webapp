/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Shared workspace packages ship raw TS/TSX; Next transpiles them.
  transpilePackages: ["@jobassistui/shared", "@jobassistui/db"],
  // "Apply for me" drives a cloud browser. Load these from node_modules at
  // run time instead of bundling them: playwright-core can't be bundled.
  serverExternalPackages: ["playwright-core", "@browserbasehq/sdk"],
};

module.exports = nextConfig;
