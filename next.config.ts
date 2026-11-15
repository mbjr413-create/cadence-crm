import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "playwright",
    "@sparticuz/chromium"
  ],

  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/playwright-core/browsers.json"
    ],

    "/api/scrape-worker": [
      "./node_modules/@sparticuz/chromium/bin/**/*"
    ]
  }
};

export default nextConfig;