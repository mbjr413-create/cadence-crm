import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js output tracing can miss Playwright's dynamically loaded
  // browsers.json during a Vercel deployment.
  // Keep this scoped to the affected upload route to avoid bloating other functions.
  outputFileTracingIncludes: {
    "/api/upload": [
      "./node_modules/playwright-core/browsers.json",
      "./node_modules/.pnpm/playwright-core@*/node_modules/playwright-core/browsers.json",
    ],
  },
};

export default nextConfig;
