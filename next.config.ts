import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        "**/node_modules/**",
        "**/prisma/dev.db*",
        "**/*.db",
        "**/*.db-journal",
        "**/*.db-wal",
      ],
    };
    return config;
  },
};

export default nextConfig;
