/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Don't fail production builds on stylistic lint rules. TypeScript errors
    // still block the build. Run `npm run lint` to see lint findings.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
